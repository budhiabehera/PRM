"""
Knowledge Base / Wiki router — CRUD for articles + Azure Blob file attachments.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/knowledge-base", tags=["Knowledge Base"])


# ---------- Helpers ----------

def _enrich_article(article: models.KBArticle) -> dict:
    """Convert an ORM article to a dict with joined names."""
    return {
        "id": article.id,
        "title": article.title,
        "content": article.content,
        "category": article.category,
        "project_id": article.project_id,
        "created_by_id": article.created_by_id,
        "updated_by_id": article.updated_by_id,
        "created_at": article.created_at,
        "updated_at": article.updated_at,
        "project_name": article.project.name if article.project else None,
        "created_by_name": article.created_by.full_name if article.created_by else None,
        "updated_by_name": article.updated_by.full_name if article.updated_by else None,
    }


def _get_blob_service(db: Session):
    """Return BlobServiceClient using connection string from IntegrationSettings."""
    settings = db.query(models.IntegrationSettings).get(1)
    if not settings or not settings.azure_blob_connection_string:
        raise HTTPException(400, "Azure Blob connection string is not configured. Set it in Admin > Settings.")
    from azure.storage.blob import BlobServiceClient
    return BlobServiceClient.from_connection_string(settings.azure_blob_connection_string)


KB_CONTAINER = "knowledge-base"


# ---------- Categories ----------

@router.get("/categories", response_model=List[str])
def get_categories(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return distinct categories currently in use."""
    rows = db.query(models.KBArticle.category).filter(
        models.KBArticle.category.isnot(None),
        models.KBArticle.category != "",
    ).distinct().all()
    return sorted([r[0] for r in rows])


# ---------- List / Search ----------

@router.get("", response_model=List[schemas.KBArticleOut])
def list_articles(
    project_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.KBArticle)
    if project_id is not None:
        q = q.filter(models.KBArticle.project_id == project_id)
    if category:
        q = q.filter(models.KBArticle.category == category)
    if search:
        q = q.filter(models.KBArticle.title.ilike(f"%{search}%"))
    articles = q.order_by(models.KBArticle.created_at.desc()).all()
    return [_enrich_article(a) for a in articles]


# ---------- Get single ----------

@router.get("/{article_id}", response_model=schemas.KBArticleDetail)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    article = db.query(models.KBArticle).get(article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    data = _enrich_article(article)
    data["attachments"] = [
        {
            "id": att.id,
            "article_id": att.article_id,
            "file_name": att.file_name,
            "blob_url": att.blob_url,
            "content_type": att.content_type,
            "file_size": att.file_size,
            "uploaded_at": att.uploaded_at,
        }
        for att in article.attachments
    ]
    return data


# ---------- Create ----------

@router.post("", response_model=schemas.KBArticleOut, status_code=201)
def create_article(
    payload: schemas.KBArticleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    article = models.KBArticle(
        title=payload.title,
        content=payload.content,
        category=payload.category,
        project_id=payload.project_id,
        created_by_id=current_user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return _enrich_article(article)


# ---------- Update ----------

@router.put("/{article_id}", response_model=schemas.KBArticleOut)
def update_article(
    article_id: int,
    payload: schemas.KBArticleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    article = db.query(models.KBArticle).get(article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    # Permission: creator or Admin/Manager
    if article.created_by_id != current_user.id and current_user.role not in ("Admin", "Manager"):
        raise HTTPException(403, "You don't have permission to edit this article.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(article, field, value)
    article.updated_by_id = current_user.id
    db.commit()
    db.refresh(article)
    return _enrich_article(article)


# ---------- Delete ----------

@router.delete("/{article_id}", status_code=204)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    article = db.query(models.KBArticle).get(article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    # Also delete blobs from Azure
    try:
        blob_service = _get_blob_service(db)
        container_client = blob_service.get_container_client(KB_CONTAINER)
        for att in article.attachments:
            blob_path = f"{article_id}/{att.file_name}"
            try:
                container_client.get_blob_client(blob_path).delete_blob()
            except Exception:
                pass
    except Exception:
        pass  # Don't block delete if blob cleanup fails
    db.delete(article)
    db.commit()


# ---------- Upload Attachment ----------

@router.post("/{article_id}/attachments", response_model=schemas.KBAttachmentOut, status_code=201)
def upload_attachment(
    article_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    article = db.query(models.KBArticle).get(article_id)
    if not article:
        raise HTTPException(404, "Article not found")

    blob_service = _get_blob_service(db)
    container_client = blob_service.get_container_client(KB_CONTAINER)

    # Create container if not exists
    try:
        container_client.create_container()
    except Exception:
        pass  # Already exists

    blob_path = f"{article_id}/{file.filename}"
    blob_client = container_client.get_blob_client(blob_path)

    file_content = file.file.read()
    blob_client.upload_blob(
        file_content,
        content_type=file.content_type or "application/octet-stream",
        overwrite=True,
    )

    attachment = models.KBAttachment(
        article_id=article_id,
        file_name=file.filename,
        blob_url=blob_client.url,
        content_type=file.content_type or "application/octet-stream",
        file_size=len(file_content),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


# ---------- Delete Attachment ----------

@router.delete("/{article_id}/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    article_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = db.query(models.KBAttachment).filter(
        models.KBAttachment.id == attachment_id,
        models.KBAttachment.article_id == article_id,
    ).first()
    if not attachment:
        raise HTTPException(404, "Attachment not found")

    # Delete blob
    try:
        blob_service = _get_blob_service(db)
        container_client = blob_service.get_container_client(KB_CONTAINER)
        blob_path = f"{article_id}/{attachment.file_name}"
        container_client.get_blob_client(blob_path).delete_blob()
    except Exception:
        pass  # Don't block DB delete if blob fails

    db.delete(attachment)
    db.commit()
