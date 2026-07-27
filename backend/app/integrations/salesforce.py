"""
Salesforce integration — authenticates via the OAuth 2.0 username-password
flow and pushes tasks to Salesforce as Cases via the REST API.

Setup required in your Salesforce org (done once, by a Salesforce admin):
  1. Setup -> App Manager -> New Connected App.
     - Enable OAuth Settings, callback URL can be anything (e.g. https://localhost/callback)
       since we don't use the browser redirect flow.
     - OAuth Scopes: "Manage user data via APIs (api)" is enough.
  2. After saving, copy the Consumer Key (-> salesforce_client_id) and
     Consumer Secret (-> salesforce_client_secret).
  3. Your Salesforce username/password + Security Token (Settings -> Reset My
     Security Token, emailed to you) go in salesforce_username /
     salesforce_password / salesforce_security_token.
  4. salesforce_login_url is https://login.salesforce.com for production/dev
     orgs, or https://test.salesforce.com for sandboxes.

This uses the standard Case object for portability (works on any org without
custom fields). For robust de-duplication (avoiding creating a new Case every
sync), add a custom external-id field on Case (e.g. External_Task_Id__c) and
extend `push_task_as_case` to query on it — left as a documented extension
point since custom field names vary per org.
"""
import requests

TIMEOUT_SECONDS = 15
API_VERSION = "v61.0"


def get_access_token(settings) -> tuple[str | None, str | None, str | None]:
    """Returns (access_token, instance_url, error_message)."""
    token_url = f"{settings.salesforce_login_url.rstrip('/')}/services/oauth2/token"
    password = f"{settings.salesforce_password or ''}{settings.salesforce_security_token or ''}"
    try:
        resp = requests.post(
            token_url,
            data={
                "grant_type": "password",
                "client_id": settings.salesforce_client_id,
                "client_secret": settings.salesforce_client_secret,
                "username": settings.salesforce_username,
                "password": password,
            },
            timeout=TIMEOUT_SECONDS,
        )
        data = resp.json()
        if resp.status_code != 200:
            return None, None, data.get("error_description", str(data))
        return data["access_token"], data["instance_url"], None
    except requests.RequestException as exc:
        return None, None, f"Could not reach Salesforce: {exc}"
    except (KeyError, ValueError) as exc:
        return None, None, f"Unexpected Salesforce response: {exc}"


def test_connection(settings) -> tuple[bool, str]:
    if not settings.salesforce_client_id or not settings.salesforce_username:
        return False, "Salesforce is not fully configured yet."
    token, instance_url, error = get_access_token(settings)
    if error:
        return False, error
    return True, f"Connected to Salesforce org at {instance_url}."


_PRIORITY_MAP = {"Critical": "High", "High": "High", "Medium": "Medium", "Low": "Low"}
_STATUS_MAP = {
    "Not Started": "New",
    "In Progress": "Working",
    "On Hold": "On Hold",
    "Completed": "Closed",
    "Clarification": "Working",
}


def push_task_as_case(settings, task) -> tuple[bool, str]:
    """Creates a new Salesforce Case representing this task. Returns (success, message-or-case-id)."""
    token, instance_url, error = get_access_token(settings)
    if error:
        return False, error

    case_payload = {
        "Subject": f"[{task.task_code}] {task.description}"[:255],
        "Description": (
            f"Project: {task.project.name if task.project else '—'}\n"
            f"Developer: {task.developer.name if task.developer else 'Unassigned'}\n"
            f"Priority: {task.priority}\n"
            f"Estimated Hours: {task.estimated_hours}\n"
            f"Property/Client: {task.property_client or '—'}"
        ),
        "Priority": _PRIORITY_MAP.get(task.priority, "Medium"),
        "Status": _STATUS_MAP.get(task.status, "New"),
    }

    try:
        resp = requests.post(
            f"{instance_url}/services/data/{API_VERSION}/sobjects/Case",
            json=case_payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT_SECONDS,
        )
        data = resp.json()
        if resp.status_code == 201:
            return True, data["id"]
        return False, str(data)
    except requests.RequestException as exc:
        return False, f"Could not reach Salesforce: {exc}"
