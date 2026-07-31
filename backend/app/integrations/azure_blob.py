"""
Azure Blob Storage integration — uploads task JSON to a blob container.

Storage Account: fx1fxposblobstorage
Container: postask

Connection string is configured from Admin > Settings > Integrations.
"""
import json
from datetime import datetime


CONTAINER_NAME = "postask"


def upload_task_json(task_data: dict, connection_string: str, blob_name: str = None) -> tuple[bool, str]:
    """Upload task JSON to Azure Blob Storage.
    
    Args:
        task_data: The JSON payload to upload
        connection_string: Azure Storage connection string from app settings
        blob_name: Optional custom blob name (auto-generated if not provided)
    
    Returns (success, blob_url_or_error_message).
    """
    if not connection_string:
        return False, "Azure Blob connection string is not configured. Set it in Admin > Settings."

    if not blob_name:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        task_name = task_data.get("TaskName", "task").replace(" ", "_")[:30]
        blob_name = f"task_{timestamp}_{task_name}.json"

    json_content = json.dumps(task_data, indent=2, ensure_ascii=False)

    try:
        from azure.storage.blob import BlobServiceClient

        blob_service = BlobServiceClient.from_connection_string(connection_string)
        container_client = blob_service.get_container_client(CONTAINER_NAME)
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(
            json_content,
            content_type="application/json",
            overwrite=True,
        )
        blob_url = blob_client.url
        return True, blob_url

    except ImportError:
        return False, "azure-storage-blob package not installed. Run: pip install azure-storage-blob"
    except Exception as exc:
        return False, f"Azure Blob upload failed: {exc}"
