"""Engineering module — Bitbucket settings & repository management."""

import hashlib
import hmac
import json
import logging
from math import ceil
from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import Date, func

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations.bitbucket_service import BitbucketClient
from ..integrations.sync_service import (
    sync_commits_for_repo, sync_all_repos, extract_task_codes,
    sync_prs_for_repo, sync_prs_all_repos,
    sync_releases_for_repo, sync_releases_all_repos,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engineering", tags=["engineering"])


# ── helpers ──────────────────────────────────────────────────────────

def _get_bb_client(db: Session) -> BitbucketClient:
    """Build a BitbucketClient from the stored singleton settings."""
    settings = db.get(models.BitbucketSettings, 1)
    if not settings:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Bitbucket settings not configured yet.")
    return BitbucketClient(
        platform=settings.platform,
        workspace_slug=settings.workspace_slug,
        base_url=settings.base_url,
        auth_username=settings.auth_username,
        auth_token=settings.auth_token,
        auth_type=settings.auth_type,
    )


# ── Settings endpoints ───────────────────────────────────────────────

@router.get("/settings", response_model=schemas.BitbucketSettingsOut)
def get_settings(db: Session = Depends(get_db),
                 _user: models.User = Depends(get_current_user)):
    """Return the singleton Bitbucket settings (id=1). If none exist yet,
    return sensible defaults so the UI can render an empty form."""
    row = db.get(models.BitbucketSettings, 1)
    if not row:
        return schemas.BitbucketSettingsOut(
            id=0, platform="cloud", auth_type="app_password",
            sync_enabled=True, sync_interval=15,
        )
    # Mask the auth_token in the response
    out = schemas.BitbucketSettingsOut.model_validate(row)
    out.auth_token = "***" if row.auth_token else None
    return out


@router.put("/settings", response_model=schemas.BitbucketSettingsOut)
def upsert_settings(payload: schemas.BitbucketSettingsIn,
                    db: Session = Depends(get_db),
                    _user: models.User = Depends(require_roles("Admin"))):
    """Create or update the singleton Bitbucket settings row."""
    row = db.get(models.BitbucketSettings, 1)
    data = payload.model_dump(exclude_unset=True)

    if row:
        # If the caller sends "***" for auth_token, keep the existing value
        if data.get("auth_token") == "***":
            data.pop("auth_token")
        for key, val in data.items():
            setattr(row, key, val)
    else:
        row = models.BitbucketSettings(id=1, **data)
        db.add(row)

    db.commit()
    db.refresh(row)

    out = schemas.BitbucketSettingsOut.model_validate(row)
    out.auth_token = "***" if row.auth_token else None
    return out


@router.post("/settings/test-connection")
def test_connection(db: Session = Depends(get_db),
                    _user: models.User = Depends(require_roles("Admin"))):
    """Test the Bitbucket API connection using stored settings."""
    client = _get_bb_client(db)
    ok, message = client.test_connection()
    return {"success": ok, "message": message}


# ── Repository endpoints ─────────────────────────────────────────────

@router.get("/repositories", response_model=list[schemas.RepositoryOut])
def list_repositories(db: Session = Depends(get_db),
                      _user: models.User = Depends(get_current_user)):
    """List all linked repositories with their parent project name."""
    rows = (
        db.query(models.Repository)
        .options(joinedload(models.Repository.project))
        .order_by(models.Repository.repo_name)
        .all()
    )
    result = []
    for r in rows:
        out = schemas.RepositoryOut.model_validate(r)
        out.project_name = r.project.name if r.project else None
        result.append(out)
    return result


@router.post("/repositories", response_model=schemas.RepositoryOut,
             status_code=status.HTTP_201_CREATED)
def link_repository(payload: schemas.RepositoryCreate,
                    db: Session = Depends(get_db),
                    _user: models.User = Depends(require_roles("Admin", "Manager", "Lead"))):
    """Link a new Bitbucket repository to a PRM project."""
    # Check project exists
    project = db.get(models.Project, payload.project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Check duplicate
    exists = (
        db.query(models.Repository)
        .filter_by(repo_slug=payload.repo_slug, project_id=payload.project_id)
        .first()
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="This repo is already linked to this project.")

    repo = models.Repository(**payload.model_dump())
    db.add(repo)
    db.commit()
    db.refresh(repo)

    out = schemas.RepositoryOut.model_validate(repo)
    out.project_name = project.name
    return out


@router.delete("/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_repository(repo_id: int,
                      db: Session = Depends(get_db),
                      _user: models.User = Depends(require_roles("Admin", "Manager"))):
    """Unlink (delete) a repository and all its synced data (commits, PRs, reviewers)."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    # Delete child records first (FK constraints prevent direct repo delete)
    # 1. Delete PR reviewers for all PRs in this repo
    pr_ids = [pr.id for pr in db.query(models.PullRequest.id).filter(
        models.PullRequest.repo_id == repo_id).all()]
    if pr_ids:
        db.query(models.PRReviewer).filter(
            models.PRReviewer.pr_id.in_(pr_ids)).delete(synchronize_session=False)
    # 2. Delete pull requests
    db.query(models.PullRequest).filter(
        models.PullRequest.repo_id == repo_id).delete(synchronize_session=False)
    # 3. Delete commits
    db.query(models.Commit).filter(
        models.Commit.repo_id == repo_id).delete(synchronize_session=False)
    # 4. Now safe to delete the repo
    db.delete(repo)
    db.commit()


@router.get("/repositories/available")
def list_available_repos(db: Session = Depends(get_db),
                         _user: models.User = Depends(require_roles("Admin", "Manager", "Lead"))):
    """Fetch available repositories from the Bitbucket API (not yet linked)."""
    client = _get_bb_client(db)
    try:
        raw = client.list_repositories(page=1, page_size=100)
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail=f"Bitbucket API error: {str(e)[:300]}")

    # Normalise across Cloud / Server response shapes
    if client.platform == "cloud":
        repos = raw.get("values", [])
        items = [
            {
                "slug": r.get("slug", ""),
                "name": r.get("name", ""),
                "full_name": r.get("full_name", ""),
                "language": r.get("language", ""),
            }
            for r in repos
        ]
    else:
        repos = raw.get("values", [])
        items = [
            {
                "slug": r.get("slug", ""),
                "name": r.get("name", ""),
                "full_name": f"{r.get('project', {}).get('key', '')}/{r.get('slug', '')}",
                "language": "",
            }
            for r in repos
        ]

    # Mark repos that are already linked
    linked_slugs = {
        r.repo_slug
        for r in db.query(models.Repository.repo_slug).all()
    }
    for item in items:
        item["already_linked"] = item["slug"] in linked_slugs

    return items


@router.get("/repositories/branches-by-slug")
def list_branches_by_slug(repo_slug: str = Query(...),
                          db: Session = Depends(get_db),
                          _user: models.User = Depends(get_current_user)):
    """Fetch branches for a repo by slug (for the link form, before repo is linked)."""
    client = _get_bb_client(db)
    all_branches = []
    try:
        # Fetch multiple pages to get all branches
        for page_num in range(1, 11):  # max 10 pages = 1000 branches
            raw = client.list_branches(repo_slug, page=page_num, page_size=100)
            if client.platform == "cloud":
                branches = [b.get("name", "") for b in raw.get("values", [])]
            else:
                branches = [b.get("displayId", "") for b in raw.get("values", [])]
            all_branches.extend(branches)
            # Check if there are more pages
            if client.platform == "cloud":
                if not raw.get("next"):
                    break
            else:
                if raw.get("isLastPage", True):
                    break
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail=f"Bitbucket API error: {str(e)[:300]}")
    return {"branches": sorted(set(all_branches))}


@router.get("/repositories/{repo_id}/branches")
def list_repo_branches(repo_id: int,
                       db: Session = Depends(get_db),
                       _user: models.User = Depends(get_current_user)):
    """Fetch branches for a linked repository from the Bitbucket API."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    client = _get_bb_client(db)
    all_branches = []
    try:
        for page_num in range(1, 11):
            raw = client.list_branches(repo.repo_slug, page=page_num, page_size=100)
            if client.platform == "cloud":
                branches = [b.get("name", "") for b in raw.get("values", [])]
            else:
                branches = [b.get("displayId", "") for b in raw.get("values", [])]
            all_branches.extend(branches)
            if client.platform == "cloud":
                if not raw.get("next"):
                    break
            else:
                if raw.get("isLastPage", True):
                    break
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail=f"Bitbucket API error: {str(e)[:300]}")
    return {"branches": sorted(set(all_branches)), "default_branch": repo.default_branch}


@router.patch("/repositories/{repo_id}")
def update_repository(repo_id: int,
                      payload: dict,
                      db: Session = Depends(get_db),
                      _user: models.User = Depends(require_roles("Admin", "Manager", "Lead"))):
    """Update a linked repository (e.g. change default branch)."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    if "default_branch" in payload:
        repo.default_branch = payload["default_branch"]
    db.commit()
    db.refresh(repo)
    return {"id": repo.id, "default_branch": repo.default_branch}


# ── Sync endpoints ─────────────────────────────────────────────────

@router.post("/repositories/{repo_id}/sync")
def sync_repository(repo_id: int,
                    db: Session = Depends(get_db),
                    _user: models.User = Depends(
                        require_roles("Admin", "Manager", "Lead"))):
    """Trigger a manual commit sync for a single repository."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="Repository not found.")
    stats = sync_commits_for_repo(repo, db)
    return stats


@router.post("/sync-all")
def sync_all(db: Session = Depends(get_db),
             _user: models.User = Depends(require_roles("Admin"))):
    """Trigger commit sync for all active repositories (Admin only)."""
    results = sync_all_repos(db)
    return results


# ── Commit endpoints ───────────────────────────────────────────────

@router.get("/commits", response_model=schemas.CommitListResponse)
def list_commits(
    repo_id: int | None = Query(None),
    developer_id: int | None = Query(None),
    project_id: int | None = Query(None),
    task_id: int | None = Query(None),
    branch: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """List commits with filtering, pagination, and KPIs."""

    # ── base query with eager-loading ──
    q = (
        db.query(models.Commit)
        .options(
            joinedload(models.Commit.repo).joinedload(models.Repository.project),
            joinedload(models.Commit.developer),
            joinedload(models.Commit.task),
        )
    )

    # ── filters ──
    if repo_id is not None:
        q = q.filter(models.Commit.repo_id == repo_id)
    if developer_id is not None:
        q = q.filter(models.Commit.developer_id == developer_id)
    if project_id is not None:
        q = q.join(models.Commit.repo).filter(
            models.Repository.project_id == project_id
        )
    if task_id is not None:
        q = q.filter(models.Commit.task_id == task_id)
    if branch:
        q = q.filter(models.Commit.branch == branch)
    if from_date:
        q = q.filter(models.Commit.committed_at >= datetime.combine(
            from_date, datetime.min.time()))
    if to_date:
        q = q.filter(models.Commit.committed_at <= datetime.combine(
            to_date, datetime.max.time()))
    if search:
        q = q.filter(models.Commit.message.ilike(f"%{search}%"))

    # ── KPIs (run on filtered set, before pagination) ──
    # Build a lightweight "stats" query from the same filters
    stats_q = db.query(
        func.count(models.Commit.id).label("total_commits"),
        func.count(func.distinct(models.Commit.author_name)).label("unique_authors"),
        func.coalesce(func.sum(models.Commit.additions), 0).label("total_additions"),
        func.coalesce(func.sum(models.Commit.deletions), 0).label("total_deletions"),
    )
    # Re-apply the same filters on the stats query
    if repo_id is not None:
        stats_q = stats_q.filter(models.Commit.repo_id == repo_id)
    if developer_id is not None:
        stats_q = stats_q.filter(models.Commit.developer_id == developer_id)
    if project_id is not None:
        stats_q = stats_q.join(models.Repository,
                               models.Commit.repo_id == models.Repository.id).filter(
            models.Repository.project_id == project_id
        )
    if task_id is not None:
        stats_q = stats_q.filter(models.Commit.task_id == task_id)
    if branch:
        stats_q = stats_q.filter(models.Commit.branch == branch)
    if from_date:
        stats_q = stats_q.filter(models.Commit.committed_at >= datetime.combine(
            from_date, datetime.min.time()))
    if to_date:
        stats_q = stats_q.filter(models.Commit.committed_at <= datetime.combine(
            to_date, datetime.max.time()))
    if search:
        stats_q = stats_q.filter(models.Commit.message.ilike(f"%{search}%"))

    stats_row = stats_q.one()
    total = stats_row.total_commits

    kpis = schemas.CommitKPIs(
        total_commits=total,
        unique_authors=stats_row.unique_authors,
        total_additions=stats_row.total_additions,
        total_deletions=stats_row.total_deletions,
    )

    # ── pagination ──
    pages = max(ceil(total / page_size), 1)
    offset = (page - 1) * page_size

    rows = (
        q.order_by(models.Commit.committed_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # ── serialize ──
    items: list[schemas.CommitOut] = []
    for c in rows:
        # Derive display names from joined relationships
        repo_name = c.repo.repo_name if c.repo else None
        project_name = (c.repo.project.name
                        if c.repo and c.repo.project else None)
        project_id_val = (c.repo.project_id if c.repo else None)
        developer_name = (c.developer.name
                          if c.developer else c.author_name)
        task_code = None
        if c.task:
            task_code = c.task.task_code
        else:
            # Try to extract from commit message
            codes = extract_task_codes(c.message or "")
            task_code = codes[0] if codes else None

        items.append(schemas.CommitOut(
            id=c.id,
            commit_hash=c.commit_hash,
            short_hash=c.short_hash,
            author_name=c.author_name,
            developer_id=c.developer_id,
            developer_name=developer_name,
            message=c.message,
            branch=c.branch,
            repo_name=repo_name,
            repo_id=c.repo_id,
            project_name=project_name,
            project_id=project_id_val,
            committed_at=c.committed_at,
            additions=c.additions or 0,
            deletions=c.deletions or 0,
            files_changed=c.files_changed or 0,
            task_id=c.task_id,
            task_code=task_code,
            created_at=c.created_at,
        ))

    return schemas.CommitListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
        kpis=kpis,
    )


# ── Pull Request endpoints ────────────────────────────────────────────

@router.post("/repositories/{repo_id}/sync-prs")
def sync_repo_prs(repo_id: int,
                  db: Session = Depends(get_db),
                  _user: models.User = Depends(
                      require_roles("Admin", "Manager", "Lead"))):
    """Trigger a manual PR sync for a single repository."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="Repository not found.")
    stats = sync_prs_for_repo(repo, db)
    return stats


@router.post("/sync-all-prs")
def sync_all_prs(db: Session = Depends(get_db),
                 _user: models.User = Depends(require_roles("Admin"))):
    """Trigger PR sync for all active repositories (Admin only)."""
    results = sync_prs_all_repos(db)
    return results


@router.get("/pull-requests", response_model=schemas.PullRequestListResponse)
def list_pull_requests(
    repo_id: int | None = Query(None),
    developer_id: int | None = Query(None),
    project_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """List pull requests with filtering, pagination, and KPIs."""

    # ── base query with eager-loading ──
    q = (
        db.query(models.PullRequest)
        .options(
            joinedload(models.PullRequest.repo)
            .joinedload(models.Repository.project),
            joinedload(models.PullRequest.developer),
            joinedload(models.PullRequest.task),
            selectinload(models.PullRequest.reviewers),
        )
    )

    # ── filters ──
    if repo_id is not None:
        q = q.filter(models.PullRequest.repo_id == repo_id)
    if developer_id is not None:
        q = q.filter(models.PullRequest.developer_id == developer_id)
    if project_id is not None:
        q = q.join(models.PullRequest.repo).filter(
            models.Repository.project_id == project_id
        )
    if status_filter:
        q = q.filter(models.PullRequest.status == status_filter.upper())
    if from_date:
        q = q.filter(models.PullRequest.created_at_bb >= datetime.combine(
            from_date, datetime.min.time()))
    if to_date:
        q = q.filter(models.PullRequest.created_at_bb <= datetime.combine(
            to_date, datetime.max.time()))
    if search:
        q = q.filter(models.PullRequest.title.ilike(f"%{search}%"))

    # ── KPIs (run on filtered set, before pagination) ──
    # Build a lightweight stats query re-applying the same filters
    base_filter = db.query(models.PullRequest)
    if repo_id is not None:
        base_filter = base_filter.filter(models.PullRequest.repo_id == repo_id)
    if developer_id is not None:
        base_filter = base_filter.filter(models.PullRequest.developer_id == developer_id)
    if project_id is not None:
        base_filter = base_filter.join(
            models.Repository,
            models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if status_filter:
        base_filter = base_filter.filter(
            models.PullRequest.status == status_filter.upper()
        )
    if from_date:
        base_filter = base_filter.filter(
            models.PullRequest.created_at_bb >= datetime.combine(
                from_date, datetime.min.time())
        )
    if to_date:
        base_filter = base_filter.filter(
            models.PullRequest.created_at_bb <= datetime.combine(
                to_date, datetime.max.time())
        )
    if search:
        base_filter = base_filter.filter(
            models.PullRequest.title.ilike(f"%{search}%")
        )

    total = base_filter.count()

    open_count = base_filter.filter(
        models.PullRequest.status == "OPEN"
    ).count()
    merged_count = base_filter.filter(
        models.PullRequest.status == "MERGED"
    ).count()
    declined_count = base_filter.filter(
        models.PullRequest.status == "DECLINED"
    ).count()

    avg_merge_row = (
        base_filter.filter(models.PullRequest.status == "MERGED")
        .with_entities(
            func.coalesce(func.avg(models.PullRequest.merge_duration_hr), 0)
        )
        .scalar()
    )
    avg_merge_time_hr = round(float(avg_merge_row or 0), 2)

    # PRs without review: OPEN PRs that have no reviewers with status APPROVED
    open_pr_ids = [
        r[0] for r in
        base_filter.filter(models.PullRequest.status == "OPEN")
        .with_entities(models.PullRequest.id).all()
    ]
    prs_without_review = 0
    if open_pr_ids:
        approved_pr_ids = {
            r[0] for r in
            db.query(models.PRReviewer.pr_id)
            .filter(
                models.PRReviewer.pr_id.in_(open_pr_ids),
                models.PRReviewer.status == "APPROVED",
            ).all()
        }
        prs_without_review = len(set(open_pr_ids) - approved_pr_ids)

    kpis = schemas.PRKPIs(
        open_count=open_count,
        merged_count=merged_count,
        declined_count=declined_count,
        avg_merge_time_hr=avg_merge_time_hr,
        prs_without_review=prs_without_review,
    )

    # ── pagination ──
    pages = max(ceil(total / page_size), 1)
    offset = (page - 1) * page_size

    rows = (
        q.order_by(models.PullRequest.created_at_bb.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # ── serialize ──
    items: list[schemas.PullRequestOut] = []
    for pr in rows:
        repo_name = pr.repo.repo_name or pr.repo.repo_slug if pr.repo else None
        project_name = (pr.repo.project.name
                        if pr.repo and pr.repo.project else None)
        project_id_val = pr.repo.project_id if pr.repo else None
        developer_name = (pr.developer.name
                          if pr.developer else pr.author_name)

        task_code = None
        if pr.task:
            task_code = pr.task.task_code
        else:
            codes = extract_task_codes(pr.title or "")
            task_code = codes[0] if codes else None

        reviewers_out = [
            schemas.PRReviewerOut(
                id=rev.id,
                reviewer_name=rev.reviewer_name,
                developer_id=rev.developer_id,
                status=rev.status or "PENDING",
                reviewed_at=rev.reviewed_at,
                review_duration_hr=rev.review_duration_hr,
                comments_count=rev.comments_count or 0,
            )
            for rev in (pr.reviewers or [])
        ]

        items.append(schemas.PullRequestOut(
            id=pr.id,
            pr_number=pr.pr_number,
            title=pr.title,
            description=pr.description,
            author_name=pr.author_name,
            developer_id=pr.developer_id,
            developer_name=developer_name,
            repo_id=pr.repo_id,
            repo_name=repo_name,
            project_id=project_id_val,
            project_name=project_name,
            source_branch=pr.source_branch,
            dest_branch=pr.dest_branch,
            status=pr.status,
            commit_count=pr.commit_count or 0,
            comment_count=pr.comment_count or 0,
            task_id=pr.task_id,
            task_code=task_code,
            created_at_bb=pr.created_at_bb,
            updated_at_bb=pr.updated_at_bb,
            merged_at=pr.merged_at,
            merge_duration_hr=pr.merge_duration_hr,
            created_at=pr.created_at,
            reviewers=reviewers_out,
        ))

    return schemas.PullRequestListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
        kpis=kpis,
    )


# ── Code Review endpoints ──────────────────────────────────────────────

@router.get("/code-reviews", response_model=schemas.CodeReviewResponse)
def get_code_reviews(
    developer_id: int | None = Query(None, description="Filter by reviewer developer_id"),
    project_id: int | None = Query(None),
    repo_id: int | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Code Reviews dashboard: leaderboard, awaiting-review list, and KPIs.

    - developer_id filters by **reviewer** (not PR author).
    - Leaderboard aggregates completed review stats per reviewer.
    - Awaiting Review lists OPEN PRs that still have PENDING reviewers.
    """
    now = datetime.utcnow()

    # ── 1. LEADERBOARD ──────────────────────────────────────────────
    # Base: PRReviewer joined to PullRequest → Repository for filters
    lb_q = (
        db.query(
            models.PRReviewer.developer_id,
            models.PRReviewer.reviewer_name,
            func.count(models.PRReviewer.id).label("reviews_total"),
            func.count(
                func.nullif(models.PRReviewer.status != "APPROVED", True)
            ).label("reviews_approved"),
            func.count(
                func.nullif(models.PRReviewer.status != "CHANGES_REQUESTED", True)
            ).label("reviews_changes_requested"),
            func.coalesce(
                func.avg(models.PRReviewer.review_duration_hr), 0
            ).label("avg_turnaround_hr"),
            func.coalesce(
                func.sum(models.PRReviewer.comments_count), 0
            ).label("total_comments"),
        )
        .join(
            models.PullRequest,
            models.PRReviewer.pr_id == models.PullRequest.id,
        )
        .join(
            models.Repository,
            models.PullRequest.repo_id == models.Repository.id,
        )
        .filter(models.PRReviewer.status != "PENDING")  # only completed reviews
    )

    # Apply filters
    if developer_id is not None:
        lb_q = lb_q.filter(models.PRReviewer.developer_id == developer_id)
    if project_id is not None:
        lb_q = lb_q.filter(models.Repository.project_id == project_id)
    if repo_id is not None:
        lb_q = lb_q.filter(models.PullRequest.repo_id == repo_id)
    if from_date:
        lb_q = lb_q.filter(
            models.PullRequest.created_at_bb >= datetime.combine(
                from_date, datetime.min.time())
        )
    if to_date:
        lb_q = lb_q.filter(
            models.PullRequest.created_at_bb <= datetime.combine(
                to_date, datetime.max.time())
        )

    lb_q = (
        lb_q.group_by(
            models.PRReviewer.developer_id,
            models.PRReviewer.reviewer_name,
        )
        .order_by(func.count(models.PRReviewer.id).desc())
    )

    # Resolve developer names via a single lookup
    dev_name_map: dict[int, str] = {}
    if True:  # always pre-fetch for name resolution
        dev_rows = db.query(models.Developer.id, models.Developer.name).all()
        dev_name_map = {d.id: d.name for d in dev_rows}

    leaderboard: list[schemas.ReviewLeaderboardItem] = []
    for row in lb_q.all():
        dev_name = (
            dev_name_map.get(row.developer_id)
            if row.developer_id
            else None
        ) or row.reviewer_name or "Unknown"
        leaderboard.append(schemas.ReviewLeaderboardItem(
            developer_id=row.developer_id,
            developer_name=dev_name,
            reviews_total=row.reviews_total,
            reviews_approved=row.reviews_approved,
            reviews_changes_requested=row.reviews_changes_requested,
            avg_turnaround_hr=round(float(row.avg_turnaround_hr or 0), 2),
            total_comments=int(row.total_comments or 0),
        ))

    # ── 2. AWAITING REVIEW ──────────────────────────────────────────
    # OPEN PRs with at least one PENDING reviewer
    aw_q = (
        db.query(models.PullRequest)
        .options(
            joinedload(models.PullRequest.repo)
            .joinedload(models.Repository.project),
            selectinload(models.PullRequest.reviewers),
        )
        .filter(models.PullRequest.status == "OPEN")
        .filter(
            models.PullRequest.id.in_(
                db.query(models.PRReviewer.pr_id)
                .filter(models.PRReviewer.status == "PENDING")
                .subquery()
            )
        )
    )

    if project_id is not None:
        aw_q = aw_q.join(
            models.Repository,
            models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if repo_id is not None:
        aw_q = aw_q.filter(models.PullRequest.repo_id == repo_id)
    if developer_id is not None:
        # Filter to PRs where THIS developer is a pending reviewer
        aw_q = aw_q.filter(
            models.PullRequest.id.in_(
                db.query(models.PRReviewer.pr_id).filter(
                    models.PRReviewer.developer_id == developer_id,
                    models.PRReviewer.status == "PENDING",
                ).subquery()
            )
        )

    aw_q = aw_q.order_by(models.PullRequest.created_at_bb.asc())  # oldest first

    awaiting_review: list[schemas.AwaitingReviewItem] = []
    for pr in aw_q.all():
        pending_names = [
            rev.reviewer_name or "Unknown"
            for rev in (pr.reviewers or [])
            if rev.status == "PENDING"
        ]
        days_waiting = (
            (now - pr.created_at_bb).total_seconds() / 86400
            if pr.created_at_bb else 0.0
        )
        repo_name = (
            pr.repo.repo_name or pr.repo.repo_slug if pr.repo else None
        )
        project_name = (
            pr.repo.project.name
            if pr.repo and pr.repo.project else None
        )
        awaiting_review.append(schemas.AwaitingReviewItem(
            pr_id=pr.id,
            pr_number=pr.pr_number,
            title=pr.title,
            repo_name=repo_name,
            project_name=project_name,
            author_name=pr.author_name,
            source_branch=pr.source_branch,
            created_at_bb=pr.created_at_bb,
            days_waiting=round(days_waiting, 2),
            pending_reviewers=pending_names,
        ))

    # ── 3. KPIs ─────────────────────────────────────────────────────
    total_reviews = sum(lb.reviews_total for lb in leaderboard)
    avg_turnaround = (
        round(
            sum(lb.avg_turnaround_hr * lb.reviews_total for lb in leaderboard)
            / total_reviews, 2
        )
        if total_reviews > 0 else 0.0
    )
    prs_awaiting = len(awaiting_review)
    oldest_pending = (
        max(a.days_waiting for a in awaiting_review) if awaiting_review else 0.0
    )

    kpis = schemas.CodeReviewKPIs(
        total_reviews=total_reviews,
        avg_turnaround_hr=avg_turnaround,
        prs_awaiting_review=prs_awaiting,
        oldest_pending_days=oldest_pending,
    )

    return schemas.CodeReviewResponse(
        leaderboard=leaderboard,
        awaiting_review=awaiting_review,
        kpis=kpis,
    )


# ══════════════════════════════════════════════════════════════════════════════
# RELEASE ENDPOINTS  (Task 0 — missing from Phase 5)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/repositories/{repo_id}/sync-releases")
def sync_repo_releases(repo_id: int,
                       db: Session = Depends(get_db),
                       _user: models.User = Depends(
                           require_roles("Admin", "Manager", "Lead"))):
    """Trigger a manual release sync for a single repository."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="Repository not found.")
    stats = sync_releases_for_repo(repo, db)
    return stats


@router.post("/sync-all-releases")
def sync_all_releases_endpoint(db: Session = Depends(get_db),
                                _user: models.User = Depends(require_roles("Admin"))):
    """Trigger release sync for all active repositories (Admin only)."""
    results = sync_releases_all_repos(db)
    return results


@router.get("/releases", response_model=schemas.ReleaseListResponse)
def list_releases(
    repo_id: int | None = Query(None),
    project_id: int | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """List releases with filtering, pagination, and KPIs."""

    # ── base query with eager-loading ──
    q = (
        db.query(models.Release)
        .options(
            joinedload(models.Release.repo)
            .joinedload(models.Repository.project),
        )
    )

    # ── filters ──
    if repo_id is not None:
        q = q.filter(models.Release.repo_id == repo_id)
    if project_id is not None:
        q = q.join(models.Release.repo).filter(
            models.Repository.project_id == project_id
        )
    if from_date:
        q = q.filter(models.Release.released_at >= datetime.combine(
            from_date, datetime.min.time()))
    if to_date:
        q = q.filter(models.Release.released_at <= datetime.combine(
            to_date, datetime.max.time()))
    if search:
        q = q.filter(
            models.Release.tag_name.ilike(f"%{search}%")
            | models.Release.release_name.ilike(f"%{search}%")
            | models.Release.description.ilike(f"%{search}%")
        )

    # ── KPIs (run on filtered set, before pagination) ──
    stats_q = db.query(
        func.count(models.Release.id).label("total"),
        func.coalesce(func.avg(models.Release.days_since_prev), 0).label("avg_days"),
        func.coalesce(func.avg(models.Release.commit_count), 0).label("avg_commits"),
        func.max(models.Release.released_at).label("last_date"),
    )
    # Re-apply the same filters on the stats query
    if repo_id is not None:
        stats_q = stats_q.filter(models.Release.repo_id == repo_id)
    if project_id is not None:
        stats_q = stats_q.join(
            models.Repository,
            models.Release.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if from_date:
        stats_q = stats_q.filter(models.Release.released_at >= datetime.combine(
            from_date, datetime.min.time()))
    if to_date:
        stats_q = stats_q.filter(models.Release.released_at <= datetime.combine(
            to_date, datetime.max.time()))
    if search:
        stats_q = stats_q.filter(
            models.Release.tag_name.ilike(f"%{search}%")
            | models.Release.release_name.ilike(f"%{search}%")
            | models.Release.description.ilike(f"%{search}%")
        )

    stats_row = stats_q.one()
    total = stats_row.total

    # Get last release tag name
    last_release_tag = None
    if stats_row.last_date:
        last_rel = (
            db.query(models.Release.tag_name)
            .filter(models.Release.released_at == stats_row.last_date)
            .first()
        )
        last_release_tag = last_rel.tag_name if last_rel else None

    kpis = schemas.ReleaseKPIs(
        total_releases=total,
        avg_days_between_releases=round(float(stats_row.avg_days), 1),
        avg_commits_per_release=round(float(stats_row.avg_commits), 1),
        last_release_date=(
            stats_row.last_date.isoformat() if stats_row.last_date else None
        ),
        last_release_tag=last_release_tag,
    )

    # ── pagination ──
    pages = max(ceil(total / page_size), 1)
    offset = (page - 1) * page_size

    rows = (
        q.order_by(models.Release.released_at.desc(), models.Release.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # ── serialize ──
    items: list[schemas.ReleaseOut] = []
    for r in rows:
        repo_name = (r.repo.repo_name or r.repo.repo_slug) if r.repo else None
        project_name = (
            r.repo.project.name if r.repo and r.repo.project else None
        )
        project_id_val = r.repo.project_id if r.repo else None

        items.append(schemas.ReleaseOut(
            id=r.id,
            tag_name=r.tag_name,
            release_name=r.release_name,
            description=r.description,
            author_name=r.author_name,
            commit_hash=r.commit_hash,
            commit_count=r.commit_count or 0,
            pr_count=r.pr_count or 0,
            released_at=r.released_at,
            days_since_prev=r.days_since_prev,
            repo_id=r.repo_id,
            repo_name=repo_name,
            project_id=project_id_val,
            project_name=project_name,
            created_at=r.created_at,
        ))

    return schemas.ReleaseListResponse(
        items=items, total=total, page=page, pages=pages, kpis=kpis,
    )


# ══════════════════════════════════════════════════════════════════════════════
# ENGINEERING DASHBOARD OVERVIEW  (Task 1)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/overview")
def get_overview(
    project_id: int | None = Query(None),
    sprint_id: int | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Engineering dashboard overview — aggregated KPIs, trends, top contributors."""
    now = datetime.utcnow()
    today_start = datetime.combine(date.today(), datetime.min.time())
    week_ago = now - timedelta(days=7)

    # If sprint_id provided, derive date range from the sprint
    if sprint_id:
        sprint = db.get(models.Sprint, sprint_id)
        if sprint:
            from_date = sprint.start_date
            to_date = sprint.end_date

    # ── helper: apply project + date filters to a Commit query ──
    def _filter_commits(q, apply_dates: bool = True):
        if project_id:
            q = q.join(
                models.Repository,
                models.Commit.repo_id == models.Repository.id,
            ).filter(models.Repository.project_id == project_id)
        if apply_dates and from_date:
            q = q.filter(models.Commit.committed_at >= datetime.combine(
                from_date, datetime.min.time()))
        if apply_dates and to_date:
            q = q.filter(models.Commit.committed_at <= datetime.combine(
                to_date, datetime.max.time()))
        return q

    # ── COMMITS ──
    commits_total = _filter_commits(
        db.query(func.count(models.Commit.id))
    ).scalar() or 0

    commits_today = _filter_commits(
        db.query(func.count(models.Commit.id))
        .filter(models.Commit.committed_at >= today_start),
        apply_dates=False,
    ).scalar() or 0

    commits_this_week = _filter_commits(
        db.query(func.count(models.Commit.id))
        .filter(models.Commit.committed_at >= week_ago),
        apply_dates=False,
    ).scalar() or 0

    # ── PULL REQUESTS ──
    def _filter_prs_project(q):
        if project_id:
            q = q.join(
                models.Repository,
                models.PullRequest.repo_id == models.Repository.id,
            ).filter(models.Repository.project_id == project_id)
        return q

    pr_open = _filter_prs_project(
        db.query(func.count(models.PullRequest.id))
        .filter(models.PullRequest.status == "OPEN")
    ).scalar() or 0

    pr_merged_week = _filter_prs_project(
        db.query(func.count(models.PullRequest.id))
        .filter(
            models.PullRequest.status == "MERGED",
            models.PullRequest.merged_at >= week_ago,
        )
    ).scalar() or 0

    avg_merge_hr = round(float(
        _filter_prs_project(
            db.query(func.coalesce(func.avg(models.PullRequest.merge_duration_hr), 0))
            .filter(models.PullRequest.status == "MERGED")
        ).scalar() or 0
    ), 1)

    # ── REVIEWS ──
    pending_q = (
        db.query(func.count(models.PRReviewer.id))
        .join(models.PullRequest, models.PRReviewer.pr_id == models.PullRequest.id)
        .filter(
            models.PRReviewer.status == "PENDING",
            models.PullRequest.status == "OPEN",
        )
    )
    if project_id:
        pending_q = pending_q.join(
            models.Repository,
            models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    reviews_pending = pending_q.scalar() or 0

    review_turn_q = db.query(
        func.coalesce(func.avg(models.PRReviewer.review_duration_hr), 0)
    ).filter(models.PRReviewer.review_duration_hr.isnot(None))
    if project_id:
        review_turn_q = (
            review_turn_q
            .join(models.PullRequest, models.PRReviewer.pr_id == models.PullRequest.id)
            .join(models.Repository, models.PullRequest.repo_id == models.Repository.id)
            .filter(models.Repository.project_id == project_id)
        )
    avg_turnaround_hr = round(float(review_turn_q.scalar() or 0), 1)

    oldest_pending_q = (
        db.query(func.min(models.PullRequest.created_at_bb))
        .filter(
            models.PullRequest.status == "OPEN",
            models.PullRequest.id.in_(
                db.query(models.PRReviewer.pr_id)
                .filter(models.PRReviewer.status == "PENDING")
            ),
        )
    )
    if project_id:
        oldest_pending_q = oldest_pending_q.join(
            models.Repository,
            models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    oldest_dt = oldest_pending_q.scalar()
    oldest_pending_days = (
        round((now - oldest_dt).total_seconds() / 86400, 1)
        if oldest_dt else 0.0
    )

    # ── RELEASES ──
    rel_total_q = db.query(func.count(models.Release.id))
    if project_id:
        rel_total_q = rel_total_q.join(
            models.Repository, models.Release.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if from_date:
        rel_total_q = rel_total_q.filter(
            models.Release.released_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        rel_total_q = rel_total_q.filter(
            models.Release.released_at <= datetime.combine(to_date, datetime.max.time()))
    releases_total = rel_total_q.scalar() or 0

    last_rel_q = db.query(models.Release)
    if project_id:
        last_rel_q = last_rel_q.join(
            models.Repository, models.Release.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    last_release = (
        last_rel_q.order_by(models.Release.released_at.desc())
        .first()
    )
    last_release_tag = last_release.tag_name if last_release else None
    days_since_last = (
        (now - last_release.released_at).days
        if last_release and last_release.released_at else 0
    )

    # ── TOP CONTRIBUTORS ──
    contrib_q = (
        db.query(
            models.Commit.author_name,
            models.Commit.developer_id,
            func.count(models.Commit.id).label("commit_count"),
        )
    )
    if project_id:
        contrib_q = contrib_q.join(
            models.Repository, models.Commit.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if from_date:
        contrib_q = contrib_q.filter(
            models.Commit.committed_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        contrib_q = contrib_q.filter(
            models.Commit.committed_at <= datetime.combine(to_date, datetime.max.time()))
    contrib_rows = (
        contrib_q
        .group_by(models.Commit.author_name, models.Commit.developer_id)
        .order_by(func.count(models.Commit.id).desc())
        .limit(10)
        .all()
    )

    # PR counts per author_name for enrichment
    pr_cnt_q = db.query(
        models.PullRequest.author_name,
        func.count(models.PullRequest.id).label("pr_count"),
    )
    if project_id:
        pr_cnt_q = pr_cnt_q.join(
            models.Repository, models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if from_date:
        pr_cnt_q = pr_cnt_q.filter(
            models.PullRequest.created_at_bb >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        pr_cnt_q = pr_cnt_q.filter(
            models.PullRequest.created_at_bb <= datetime.combine(to_date, datetime.max.time()))
    pr_counts = dict(pr_cnt_q.group_by(models.PullRequest.author_name).all())

    dev_name_map = {
        d.id: d.name
        for d in db.query(models.Developer.id, models.Developer.name).all()
    }
    top_contributors = [
        {
            "developer_name": (
                dev_name_map.get(row.developer_id, row.author_name)
                if row.developer_id else row.author_name
            ) or "Unknown",
            "commit_count": row.commit_count,
            "pr_count": pr_counts.get(row.author_name, 0),
        }
        for row in contrib_rows
    ]

    # ── COMMIT TREND (last 30 days or from_date, whichever is later) ──
    thirty_ago = (now - timedelta(days=30)).date()
    trend_start = max(from_date, thirty_ago) if from_date else thirty_ago

    ct_q = (
        db.query(
            func.cast(models.Commit.committed_at, Date).label("dt"),
            func.count(models.Commit.id).label("cnt"),
        )
        .filter(models.Commit.committed_at >= datetime.combine(
            trend_start, datetime.min.time()))
    )
    if project_id:
        ct_q = ct_q.join(
            models.Repository, models.Commit.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if to_date:
        ct_q = ct_q.filter(models.Commit.committed_at <= datetime.combine(
            to_date, datetime.max.time()))
    commit_trend = [
        {"date": str(row.dt), "count": row.cnt}
        for row in ct_q
        .group_by(func.cast(models.Commit.committed_at, Date))
        .order_by(func.cast(models.Commit.committed_at, Date))
        .all()
    ]

    # ── PR TREND (same window) ──
    opened_q = (
        db.query(
            func.cast(models.PullRequest.created_at_bb, Date).label("dt"),
            func.count(models.PullRequest.id).label("cnt"),
        )
        .filter(models.PullRequest.created_at_bb >= datetime.combine(
            trend_start, datetime.min.time()))
    )
    if project_id:
        opened_q = opened_q.join(
            models.Repository, models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if to_date:
        opened_q = opened_q.filter(models.PullRequest.created_at_bb <= datetime.combine(
            to_date, datetime.max.time()))
    opened_by_date = dict(
        opened_q.group_by(func.cast(models.PullRequest.created_at_bb, Date)).all()
    )

    merged_q = (
        db.query(
            func.cast(models.PullRequest.merged_at, Date).label("dt"),
            func.count(models.PullRequest.id).label("cnt"),
        )
        .filter(
            models.PullRequest.merged_at >= datetime.combine(
                trend_start, datetime.min.time()),
            models.PullRequest.status == "MERGED",
        )
    )
    if project_id:
        merged_q = merged_q.join(
            models.Repository, models.PullRequest.repo_id == models.Repository.id,
        ).filter(models.Repository.project_id == project_id)
    if to_date:
        merged_q = merged_q.filter(models.PullRequest.merged_at <= datetime.combine(
            to_date, datetime.max.time()))
    merged_by_date = dict(
        merged_q.group_by(func.cast(models.PullRequest.merged_at, Date)).all()
    )

    all_pr_dates = sorted(set(list(opened_by_date.keys()) + list(merged_by_date.keys())))
    pr_trend = [
        {"date": str(d), "opened": opened_by_date.get(d, 0),
         "merged": merged_by_date.get(d, 0)}
        for d in all_pr_dates
    ]

    return {
        "commits": {
            "total": commits_total,
            "today": commits_today,
            "this_week": commits_this_week,
        },
        "pull_requests": {
            "open": pr_open,
            "merged_this_week": pr_merged_week,
            "avg_merge_hr": avg_merge_hr,
        },
        "reviews": {
            "pending": reviews_pending,
            "avg_turnaround_hr": avg_turnaround_hr,
            "oldest_pending_days": oldest_pending_days,
        },
        "releases": {
            "total": releases_total,
            "last_release": last_release_tag,
            "days_since_last": days_since_last,
        },
        "top_contributors": top_contributors,
        "commit_trend": commit_trend,
        "pr_trend": pr_trend,
    }


# ══════════════════════════════════════════════════════════════════════════════
# WEBHOOK RECEIVER  (Task 2)
# ══════════════════════════════════════════════════════════════════════════════

webhook_router = APIRouter(prefix="/api/engineering", tags=["engineering-webhooks"])


@webhook_router.post("/webhooks/bitbucket")
async def bitbucket_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Receive Bitbucket Cloud webhooks and trigger background sync.

    Public endpoint (no auth) — verified via HMAC-SHA256 if a
    webhook_secret is configured in BitbucketSettings.
    """
    body = await request.body()
    event_key = request.headers.get("X-Event-Key", "")

    # ── HMAC verification ──
    settings = db.get(models.BitbucketSettings, 1)
    _ws = getattr(settings, "webhook_secret", None) if settings else None
    if _ws:
        signature = request.headers.get("X-Hub-Signature", "")
        expected = "sha256=" + hmac.new(
            _ws.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, detail="Invalid HMAC signature"
            )

    # ── Parse payload ──
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload"
        )

    repo_data = payload.get("repository", {})
    slug = repo_data.get("slug", "")
    if not slug:
        return {"status": "ignored", "reason": "no repo slug in payload"}

    repo = db.query(models.Repository).filter_by(repo_slug=slug).first()
    if not repo:
        return {"status": "ignored", "reason": f"repo '{slug}' not linked"}

    # ── Dispatch to background sync ──
    if event_key == "repo:push":
        background_tasks.add_task(_webhook_sync_commits, repo.id)
    elif event_key.startswith("pullrequest:"):
        background_tasks.add_task(_webhook_sync_prs, repo.id)
    else:
        return {"status": "ignored", "reason": f"unhandled event: {event_key}"}

    logger.info("Webhook accepted: event=%s repo=%s", event_key, slug)
    return {"status": "accepted", "event": event_key, "repo": slug}


# ── background helpers (create their own DB session) ──────────────────────

def _webhook_sync_commits(repo_id: int):
    """Background: sync commits for a repo triggered by webhook."""
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        repo = db.get(models.Repository, repo_id)
        if repo:
            sync_commits_for_repo(repo, db)
            logger.info("Webhook commit sync complete for repo %s", repo_id)
    except Exception as exc:
        logger.error("Webhook commit sync failed for repo %s: %s", repo_id, exc)
    finally:
        db.close()


def _webhook_sync_prs(repo_id: int):
    """Background: sync PRs for a repo triggered by webhook."""
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        repo = db.get(models.Repository, repo_id)
        if repo:
            sync_prs_for_repo(repo, db)
            logger.info("Webhook PR sync complete for repo %s", repo_id)
    except Exception as exc:
        logger.error("Webhook PR sync failed for repo %s: %s", repo_id, exc)
    finally:
        db.close()
