"""Sync service — pulls commits from Bitbucket and stores in PRM DB."""

import re
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from .. import models
from .bitbucket_service import BitbucketClient

logger = logging.getLogger(__name__)

TASK_CODE_PATTERN = re.compile(r'\b(T\d{5})\b', re.IGNORECASE)


def extract_task_codes(text: str) -> list[str]:
    """Extract PRM task codes from text. E.g. 'T09045: Fixed bug' -> ['T09045']"""
    if not text:
        return []
    return list(set(TASK_CODE_PATTERN.findall(text.upper())))


def link_to_task(task_code: str, db: Session) -> int | None:
    """Find PRM task by code and return task_id."""
    task = db.query(models.Task).filter(models.Task.task_code == task_code).first()
    return task.id if task else None


def match_developer(author_name: str, author_email: str, db: Session) -> int | None:
    """Try to match a Bitbucket author to a PRM developer.
    Match by email first (via linked User account), then by name
    (case-insensitive, trimmed)."""
    if author_email:
        # Developer doesn't have email directly — check via linked User account
        user = db.query(models.User).filter(
            models.User.email == author_email,
            models.User.developer_id.isnot(None),
        ).first()
        if user:
            return user.developer_id
    if author_name:
        # Try case-insensitive name match
        devs = db.query(models.Developer).all()
        name_lower = author_name.strip().lower()
        for dev in devs:
            if dev.name and dev.name.strip().lower() == name_lower:
                return dev.id
    return None


def _build_client(db: Session) -> BitbucketClient:
    """Build BitbucketClient from stored settings."""
    settings = db.get(models.BitbucketSettings, 1)
    if not settings:
        raise RuntimeError("Bitbucket settings not configured")
    return BitbucketClient(
        platform=settings.platform,
        workspace_slug=settings.workspace_slug,
        base_url=settings.base_url,
        auth_username=settings.auth_username,
        auth_token=settings.auth_token,
        auth_type=settings.auth_type,
    )


def sync_commits_for_repo(repo: models.Repository, db: Session,
                          max_pages: int = 5) -> dict:
    """Sync commits from Bitbucket for a single repository.

    Returns: {"new": int, "skipped": int, "linked_tasks": int}
    """
    client = _build_client(db)
    stats = {"new": 0, "skipped": 0, "linked_tasks": 0}

    for page_num in range(1, max_pages + 1):
        try:
            raw = client.list_commits(repo.repo_slug, page=page_num, page_size=50)
        except Exception as e:
            logger.error(f"Error fetching commits for {repo.repo_slug} page {page_num}: {e}")
            break

        # Normalize Cloud vs Server response
        commits_data = raw.get("values", [])

        if not commits_data:
            break

        for c in commits_data:
            # Extract fields based on platform
            if client.platform == "cloud":
                commit_hash = c.get("hash", "")
                author_info = c.get("author", {})
                author_name = author_info.get("raw", "").split("<")[0].strip()
                author_email = ""
                # Extract email from "Name <email>" format
                raw_author = author_info.get("raw", "")
                if "<" in raw_author and ">" in raw_author:
                    author_email = raw_author.split("<")[1].split(">")[0]
                message = c.get("message", "").strip()
                committed_at_str = c.get("date", "")
                # Cloud doesn't provide additions/deletions in list endpoint
                additions = 0
                deletions = 0
                files_changed = 0
            else:
                commit_hash = c.get("id", "")
                author_name = c.get("author", {}).get("name", "")
                author_email = c.get("author", {}).get("emailAddress", "")
                message = c.get("message", "").strip()
                committed_at_str = ""
                ts = c.get("authorTimestamp")
                if ts:
                    committed_at_str = datetime.fromtimestamp(ts / 1000).isoformat()
                additions = 0
                deletions = 0
                files_changed = 0

            if not commit_hash:
                continue

            # Check if already exists
            exists = db.query(models.Commit).filter(
                models.Commit.repo_id == repo.id,
                models.Commit.commit_hash == commit_hash
            ).first()
            if exists:
                stats["skipped"] += 1
                continue

            # Parse committed_at
            committed_at = None
            if committed_at_str:
                try:
                    committed_at = datetime.fromisoformat(
                        committed_at_str.replace("Z", "+00:00")
                    )
                except Exception:
                    committed_at = datetime.utcnow()
            else:
                committed_at = datetime.utcnow()

            # Match developer
            developer_id = match_developer(author_name, author_email, db)

            # Extract task codes and link
            # Priority: 1) commit message, 2) branch name from repo config
            task_id = None
            task_codes = extract_task_codes(message)
            if not task_codes:
                # Fallback: check the configured branch name
                branch_name = repo.default_branch or ""
                task_codes = extract_task_codes(branch_name)
            if task_codes:
                task_id = link_to_task(task_codes[0], db)
                if task_id:
                    stats["linked_tasks"] += 1

            commit = models.Commit(
                repo_id=repo.id,
                commit_hash=commit_hash,
                short_hash=commit_hash[:12] if commit_hash else "",
                author_name=author_name,
                author_email=author_email,
                developer_id=developer_id,
                message=message,
                branch=repo.default_branch,
                committed_at=committed_at,
                additions=additions,
                deletions=deletions,
                files_changed=files_changed,
                task_id=task_id,
            )
            db.add(commit)
            stats["new"] += 1

        # Check if there are more pages (Cloud)
        if client.platform == "cloud" and not raw.get("next"):
            break

    db.commit()

    # Update repo last_synced_at
    repo.last_synced_at = datetime.utcnow()
    db.commit()

    return stats


def link_orphan_commits_via_branches(repo: models.Repository, db: Session) -> int:
    """Post-sync pass: link commits that have no task_id but whose branch
    contains a task code (e.g. feature/T09045-fix-login).
    
    Also checks if any PR linked to a task has a source_branch — and links
    commits on that branch to the same task.
    
    Returns: number of commits newly linked.
    """
    linked = 0

    # 1. Get all unlinked commits for this repo
    orphans = (
        db.query(models.Commit)
        .filter(
            models.Commit.repo_id == repo.id,
            models.Commit.task_id.is_(None),
        )
        .all()
    )
    if not orphans:
        return 0

    # 2. Build branch→task_id map from PRs that have task_id
    branch_task_map = {}
    pr_rows = (
        db.query(models.PullRequest.source_branch, models.PullRequest.task_id)
        .filter(
            models.PullRequest.repo_id == repo.id,
            models.PullRequest.task_id.isnot(None),
            models.PullRequest.source_branch.isnot(None),
        )
        .all()
    )
    for pr in pr_rows:
        if pr.source_branch:
            branch_task_map[pr.source_branch] = pr.task_id

    # 3. For each orphan commit, try to link via branch name
    for commit in orphans:
        # First: check commit's own branch field for task codes
        if commit.branch:
            codes = extract_task_codes(commit.branch)
            if codes:
                tid = link_to_task(codes[0], db)
                if tid:
                    commit.task_id = tid
                    linked += 1
                    continue

        # Second: check if commit's branch matches a PR's source_branch
        if commit.branch and commit.branch in branch_task_map:
            commit.task_id = branch_task_map[commit.branch]
            linked += 1

    if linked:
        db.commit()
    return linked


def sync_all_repos(db: Session) -> dict:
    """Sync commits for all active repositories."""
    repos = db.query(models.Repository).filter(
        models.Repository.active == True  # noqa: E712
    ).all()
    results = {}
    for repo in repos:
        try:
            stats = sync_commits_for_repo(repo, db)
            results[repo.repo_slug] = stats
        except Exception as e:
            logger.error(f"Sync failed for {repo.repo_slug}: {e}")
            results[repo.repo_slug] = {"error": str(e)}
    return results


# ── Pull Request sync ─────────────────────────────────────────────────

def sync_prs_for_repo(repo: models.Repository, db: Session,
                      max_pages: int = 5) -> dict:
    """Sync pull requests from Bitbucket for a single repository.

    Returns: {"new": int, "updated": int, "linked_tasks": int}
    """
    client = _build_client(db)
    stats = {"new": 0, "updated": 0, "linked_tasks": 0}

    for page_num in range(1, max_pages + 1):
        try:
            raw = client.list_pull_requests(repo.repo_slug, state="ALL",
                                            page=page_num, page_size=50)
        except Exception as e:
            logger.error(f"Error fetching PRs for {repo.repo_slug} page {page_num}: {e}")
            break

        prs_data = raw.get("values", [])
        if not prs_data:
            break

        for pr_data in prs_data:
            pr_number = pr_data.get("id")
            if not pr_number:
                continue

            title = pr_data.get("title", "")
            description = pr_data.get("description", "")
            author_info = pr_data.get("author", {})
            author_name = author_info.get("display_name", "")
            # Try to extract email from author links (Bitbucket Cloud)
            author_email = ""
            author_links = author_info.get("links", {})
            if "html" in author_links:
                # Bitbucket Cloud doesn't expose email directly in PR response
                pass

            source_branch = pr_data.get("source", {}).get("branch", {}).get("name", "")
            dest_branch = pr_data.get("destination", {}).get("branch", {}).get("name", "")
            pr_status = pr_data.get("state", "OPEN")
            comment_count = pr_data.get("comment_count", 0)

            # Parse dates
            created_at_bb = _parse_bb_datetime(pr_data.get("created_on"))
            updated_at_bb = _parse_bb_datetime(pr_data.get("updated_on"))

            # Merged at: check merge_commit first, then fall back to updated_on if state is MERGED
            merged_at = None
            merge_commit = pr_data.get("merge_commit")
            if merge_commit and isinstance(merge_commit, dict):
                merged_at = _parse_bb_datetime(merge_commit.get("date"))
            if not merged_at and pr_status == "MERGED":
                merged_at = updated_at_bb

            # Calculate merge duration
            merge_duration_hr = None
            if merged_at and created_at_bb:
                merge_duration_hr = round(
                    (merged_at - created_at_bb).total_seconds() / 3600, 2
                )

            # Match developer
            developer_id = match_developer(author_name, author_email, db)

            # Extract task codes from title and link
            task_id = None
            task_codes = extract_task_codes(title)
            if not task_codes:
                task_codes = extract_task_codes(source_branch)
            if task_codes:
                task_id = link_to_task(task_codes[0], db)
                if task_id:
                    stats["linked_tasks"] += 1

            # Check if PR already exists
            existing = db.query(models.PullRequest).filter(
                models.PullRequest.repo_id == repo.id,
                models.PullRequest.pr_number == pr_number,
            ).first()

            if existing:
                # Update mutable fields
                existing.status = pr_status
                existing.title = title
                existing.updated_at_bb = updated_at_bb
                existing.merged_at = merged_at
                existing.merge_duration_hr = merge_duration_hr
                existing.comment_count = comment_count
                if developer_id:
                    existing.developer_id = developer_id
                if task_id:
                    existing.task_id = task_id
                pr_record = existing
                stats["updated"] += 1
            else:
                pr_record = models.PullRequest(
                    repo_id=repo.id,
                    pr_number=pr_number,
                    title=title,
                    description=description,
                    author_name=author_name,
                    author_email=author_email,
                    developer_id=developer_id,
                    source_branch=source_branch,
                    dest_branch=dest_branch,
                    status=pr_status,
                    commit_count=0,
                    comment_count=comment_count,
                    task_id=task_id,
                    created_at_bb=created_at_bb,
                    updated_at_bb=updated_at_bb,
                    merged_at=merged_at,
                    merge_duration_hr=merge_duration_hr,
                )
                db.add(pr_record)
                db.flush()  # get pr_record.id for reviewers
                stats["new"] += 1

            # ── Sync reviewers ──
            participants = pr_data.get("participants", [])
            for p in participants:
                p_role = p.get("role", "")
                if p_role != "REVIEWER":
                    continue

                p_user = p.get("user", {})
                p_name = p_user.get("display_name", "")
                # Bitbucket Cloud doesn't expose reviewer email in participants
                p_email = p_user.get("links", {}).get("html", {}).get("href", "")
                p_approved = p.get("approved", False)
                p_state = (p.get("state") or "").lower()

                if p_approved:
                    reviewer_status = "APPROVED"
                elif p_state == "changes_requested":
                    reviewer_status = "CHANGES_REQUESTED"
                else:
                    reviewer_status = "PENDING"

                # Reviewed at: approximate with updated_at_bb if approved/changes_requested
                reviewed_at = None
                review_duration_hr = None
                if reviewer_status != "PENDING" and updated_at_bb:
                    reviewed_at = updated_at_bb
                    if created_at_bb:
                        review_duration_hr = round(
                            (reviewed_at - created_at_bb).total_seconds() / 3600, 2
                        )

                reviewer_dev_id = match_developer(p_name, "", db)

                # Upsert reviewer (match by pr_id + reviewer name)
                existing_reviewer = db.query(models.PRReviewer).filter(
                    models.PRReviewer.pr_id == pr_record.id,
                    models.PRReviewer.reviewer_name == p_name,
                ).first()

                if existing_reviewer:
                    existing_reviewer.status = reviewer_status
                    existing_reviewer.reviewed_at = reviewed_at
                    existing_reviewer.review_duration_hr = review_duration_hr
                    if reviewer_dev_id:
                        existing_reviewer.developer_id = reviewer_dev_id
                else:
                    reviewer = models.PRReviewer(
                        pr_id=pr_record.id,
                        reviewer_name=p_name,
                        reviewer_email=p_email,
                        developer_id=reviewer_dev_id,
                        status=reviewer_status,
                        reviewed_at=reviewed_at,
                        review_duration_hr=review_duration_hr,
                        comments_count=0,
                    )
                    db.add(reviewer)

        # Check if there are more pages (Cloud pagination)
        if not raw.get("next"):
            break

    # ── Auto-status transition: PR Merged → Task "QA-WIP" ──
    # After syncing all PRs, check for newly merged PRs linked to tasks
    # and auto-update task status to "QA-WIP" (Ready for QA)
    merged_prs = (
        db.query(models.PullRequest)
        .filter(
            models.PullRequest.repo_id == repo.id,
            models.PullRequest.status == "MERGED",
            models.PullRequest.task_id.isnot(None),
        )
        .all()
    )
    for pr in merged_prs:
        task = db.get(models.Task, pr.task_id)
        if task and task.status and task.status.lower().replace(" ", "") in (
            "inprogress", "in progress", "notstarted", "not started"
        ):
            task.status = "QA-WIP"
            stats["tasks_moved_to_qa"] = stats.get("tasks_moved_to_qa", 0) + 1
            logger.info(f"Task {task.task_code} auto-moved to QA-WIP (PR #{pr.pr_number} merged)")

    db.commit()
    return stats


def _parse_bb_datetime(value: str | None) -> datetime | None:
    """Parse an ISO-8601 datetime string from Bitbucket."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def sync_prs_all_repos(db: Session) -> dict:
    """Sync pull requests for all active repositories."""
    repos = db.query(models.Repository).filter(
        models.Repository.active == True  # noqa: E712
    ).all()
    results = {}
    for repo in repos:
        try:
            stats = sync_prs_for_repo(repo, db)
            results[repo.repo_slug] = stats
        except Exception as e:
            logger.error(f"PR sync failed for {repo.repo_slug}: {e}")
            results[repo.repo_slug] = {"error": str(e)}
    return results


# ── Release / Tag sync ─────────────────────────────────────────────────

def sync_releases_for_repo(repo: models.Repository, db: Session,
                           max_pages: int = 5) -> dict:
    """Sync tags/releases from Bitbucket for a single repository.

    Returns: {"new": int, "skipped": int}
    """
    client = _build_client(db)
    stats = {"new": 0, "skipped": 0}

    for page_num in range(1, max_pages + 1):
        try:
            raw = client.list_tags(repo.repo_slug, page=page_num, page_size=50)
        except Exception as e:
            logger.error(f"Error fetching tags for {repo.repo_slug} page {page_num}: {e}")
            break

        tags_data = raw.get("values", [])
        if not tags_data:
            break

        for tag in tags_data:
            tag_name = tag.get("name", "")
            if not tag_name:
                continue

            # Check if already exists
            exists = db.query(models.Release).filter(
                models.Release.repo_id == repo.id,
                models.Release.tag_name == tag_name,
            ).first()
            if exists:
                stats["skipped"] += 1
                continue

            # Extract fields from Bitbucket Cloud tag object
            target = tag.get("target", {})
            commit_hash = target.get("hash", "")
            released_at_str = target.get("date")
            author_raw = target.get("author", {}).get("raw", "")
            author_name = author_raw.split("<")[0].strip() if author_raw else ""
            description = tag.get("message", "") or target.get("message", "")

            # Parse released_at
            released_at = _parse_bb_datetime(released_at_str)

            release = models.Release(
                repo_id=repo.id,
                tag_name=tag_name,
                release_name=tag_name,
                description=description,
                author_name=author_name,
                commit_hash=commit_hash,
                released_at=released_at,
            )
            db.add(release)
            stats["new"] += 1

        # Check if there are more pages (Cloud pagination)
        if not raw.get("next"):
            break

    db.commit()

    # ── Calculate days_since_prev for all releases in this repo ──
    all_releases = (
        db.query(models.Release)
        .filter(models.Release.repo_id == repo.id)
        .order_by(models.Release.released_at.asc())
        .all()
    )
    prev_released_at = None
    for rel in all_releases:
        if prev_released_at and rel.released_at:
            rel.days_since_prev = (rel.released_at - prev_released_at).days
        else:
            rel.days_since_prev = None
        if rel.released_at:
            prev_released_at = rel.released_at
    db.commit()

    # Update repo last_synced_at
    repo.last_synced_at = datetime.utcnow()
    db.commit()

    return stats


def sync_releases_all_repos(db: Session) -> dict:
    """Sync releases/tags for all active repositories."""
    repos = db.query(models.Repository).filter(
        models.Repository.active == True  # noqa: E712
    ).all()
    results = {}
    for repo in repos:
        try:
            stats = sync_releases_for_repo(repo, db)
            results[repo.repo_slug] = stats
        except Exception as e:
            logger.error(f"Release sync failed for {repo.repo_slug}: {e}")
            results[repo.repo_slug] = {"error": str(e)}
    return results
