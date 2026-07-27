"""
Microsoft Teams integration — posts messages to a Teams channel via an
Incoming Webhook (or a Power Automate "When a Teams webhook request is
received" workflow URL — both accept the same JSON POST).

Configure the webhook URL from Admin > Settings > Integrations. To create one:
  Classic Incoming Webhook: Teams channel -> "..." -> Connectors -> Incoming
  Webhook -> copy the generated URL.
  Power Automate Workflow (Microsoft's newer recommended path): create a flow
  triggered by "When a Teams webhook request is received" and use its URL here.
"""
import requests

TIMEOUT_SECONDS = 10


def send_teams_message(webhook_url: str, title: str, text: str, facts: list[tuple[str, str]] | None = None) -> tuple[bool, str]:
    """Sends a simple card to a Teams channel. Returns (success, message)."""
    if not webhook_url:
        return False, "No Teams webhook URL configured."

    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": title,
        "themeColor": "4F46E5",
        "title": title,
        "text": text,
    }
    if facts:
        payload["sections"] = [{
            "facts": [{"name": name, "value": str(value)} for name, value in facts]
        }]

    try:
        resp = requests.post(webhook_url, json=payload, timeout=TIMEOUT_SECONDS)
        if resp.status_code in (200, 202):
            return True, "Message sent to Teams."
        return False, f"Teams webhook returned HTTP {resp.status_code}: {resp.text[:300]}"
    except requests.RequestException as exc:
        return False, f"Could not reach Teams webhook: {exc}"


def notify_task_event(webhook_url: str, event: str, task) -> tuple[bool, str]:
    """Convenience wrapper for task-related notifications (created/updated/completed)."""
    title = f"Task {event}: {task.task_code}"
    text = task.description
    facts = [
        ("Project", task.project.name if task.project else "—"),
        ("Developer", task.developer.name if task.developer else "Unassigned"),
        ("Priority", task.priority),
        ("Status", task.status),
        ("Estimated Hours", task.estimated_hours),
    ]
    return send_teams_message(webhook_url, title, text, facts)
