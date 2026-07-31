from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
import uuid
import io

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/task-attachments", tags=["Task Attachments"])

IST = timezone(timedelta(hours=5, minutes=30))

CONTAINER_NAME = "PRMAttachmentFiles"


def _get_blob_service():
    """Get Azure Blob Storage container client using connection string from settings."""
    from azure.storage.blob import BlobServiceClient
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        settings = db.query(models.IntegrationSettings).first()
        if not settings or not settings.azure_blob_connection_string:
            raise HTTPException(500, "Azure Blob Storage connection string not configured. Go to Admin > Settings.")
        blob_service = BlobServiceClient.from_connection_string(settings.azure_blob_connection_string)
        container_client = blob_service.get_container_client(CONTAINER_NAME)
        # Create container if it doesn't exist
        try:
            container_client.get_container_properties()
        except Exception:
            container_client.create_container()
        return container_client
    finally:
        db.close()


def _serialize_attachment(a):
    return {
        "id": a.id,
        "task_id": a.task_id,
        "file_name": a.file_name,
        "blob_name": a.blob_name,
        "file_size": a.file_size,
        "content_type": a.content_type,
        "created_by_id": a.created_by_id,
        "created_by_name": a.created_by.full_name if a.created_by else None,
        "created_at": a.created_at,
        "last_modified": a.last_modified,
    }


@router.get("/{task_id}")
def list_attachments(task_id: int, db: Session = Depends(get_db)):
    """Get all attachments for a task."""
    attachments = (
        db.query(models.TaskAttachment)
        .filter(models.TaskAttachment.task_id == task_id)
        .order_by(models.TaskAttachment.created_at.desc())
        .all()
    )
    return [_serialize_attachment(a) for a in attachments]


@router.post("/{task_id}", status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Upload a file attachment for a task to Azure Blob Storage."""
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Generate unique blob name: task_id/uuid_filename
    blob_name = f"{task_id}/{uuid.uuid4().hex}_{file.filename}"

    # Upload to Azure Blob Storage
    container_client = _get_blob_service()
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(content, overwrite=True, content_settings={
        "content_type": file.content_type or "application/octet-stream"
    })

    now = datetime.now(IST)

    # Save metadata to DB
    attachment = models.TaskAttachment(
        task_id=task_id,
        file_name=file.filename,
        blob_name=blob_name,
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream",
        created_by_id=current_user.id,
        created_at=now,
        last_modified=now,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return _serialize_attachment(attachment)


@router.get("/download/{attachment_id}")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Download (view) a file attachment from Azure Blob Storage."""
    attachment = db.query(models.TaskAttachment).get(attachment_id)
    if not attachment:
        raise HTTPException(404, "Attachment not found")

    container_client = _get_blob_service()
    blob_client = container_client.get_blob_client(attachment.blob_name)

    try:
        download_stream = blob_client.download_blob()
        content = download_stream.readall()
    except Exception as e:
        raise HTTPException(500, f"Could not download file from storage: {str(e)}")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{attachment.file_name}"',
            "Content-Length": str(attachment.file_size),
        },
    )


@router.put("/{attachment_id}")
async def update_attachment(
    attachment_id: int,
    file_name: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Edit an attachment — rename or replace the file."""
    attachment = db.query(models.TaskAttachment).get(attachment_id)
    if not attachment:
        raise HTTPException(404, "Attachment not found")

    now = datetime.now(IST)

    # If a new file is uploaded, replace blob content
    if file:
        content = await file.read()
        container_client = _get_blob_service()

        # Delete old blob
        old_blob_client = container_client.get_blob_client(attachment.blob_name)
        try:
            old_blob_client.delete_blob()
        except Exception:
            pass

        # Upload new blob
        new_blob_name = f"{attachment.task_id}/{uuid.uuid4().hex}_{file.filename}"
        new_blob_client = container_client.get_blob_client(new_blob_name)
        new_blob_client.upload_blob(content, overwrite=True, content_settings={
            "content_type": file.content_type or "application/octet-stream"
        })

        attachment.blob_name = new_blob_name
        attachment.file_size = len(content)
        attachment.content_type = file.content_type or "application/octet-stream"
        attachment.file_name = file.filename

    # If only renaming
    if file_name and not file:
        attachment.file_name = file_name

    attachment.last_modified = now
    db.commit()
    db.refresh(attachment)
    return _serialize_attachment(attachment)


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete an attachment from Azure Blob Storage and the database."""
    attachment = db.query(models.TaskAttachment).get(attachment_id)
    if not attachment:
        raise HTTPException(404, "Attachment not found")

    # Delete blob from Azure
    container_client = _get_blob_service()
    blob_client = container_client.get_blob_client(attachment.blob_name)
    try:
        blob_client.delete_blob()
    except Exception:
        pass  # blob might already be gone

    db.delete(attachment)
    db.commit()
