"""Engineering module — Bitbucket settings & repository management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations.bitbucket_service import BitbucketClient

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
    """Unlink (delete) a repository record."""
    repo = db.get(models.Repository, repo_id)
    if not repo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Repository not found.")
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
