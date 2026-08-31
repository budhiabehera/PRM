"""Engineering module — Bitbucket settings & repository management."""

import logging
from math import ceil
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations.bitbucket_service import BitbucketClient
from ..integrations.sync_service import (
    sync_commits_for_repo, sync_all_repos, extract_task_codes,
    sync_prs_for_repo, sync_prs_all_repos,
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
