"""
Alerts router — configurable alert rules, alert checking engine,
and alert history for engineering notifications.
"""

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations.teams import send_teams_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

# ─── helpers ──────────────────────────────────────────────────────────

_DEFAULT_RULES_SEEDED = False


def seed_default_rules(db: Session) -> None:
    """Create the four default rules if the table is empty."""
    global _DEFAULT_RULES_SEEDED
    if _DEFAULT_RULES_SEEDED:
        return
    count = db.query(models.AlertRule).count()
    if count > 0:
        _DEFAULT_RULES_SEEDED = True
        return

    defaults = [
        models.AlertRule(
            rule_type="pr_review_pending",
            name="PR Review Pending",
            description="Alert when a pull request has been waiting for review beyond the threshold.",
            threshold=24,
            severity="warning",
            notify_in_app=True,
        ),
        models.AlertRule(
            rule_type="task_no_activity",
            name="Task No Activity",
            description="Alert when an in-progress task has no commits for N days.",
            threshold=3,
            severity="warning",
            notify_in_app=True,
        ),
        models.AlertRule(
            rule_type="task_overdue",
            name="Overdue Task",
            description="Alert when a task is past its due date plus the grace period and has no merged PR.",
            threshold=2,
            severity="critical",
            notify_in_app=True,
        ),
        models.AlertRule(
            rule_type="sprint_delay",
            name="Sprint Delay Warning",
            description="Alert when the percentage of sprint tasks without dev activity exceeds threshold.",
            threshold=30,
            severity="critical",
            notify_in_app=True,
        ),
    ]
    db.add_all(defaults)
    db.commit()
    _DEFAULT_RULES_SEEDED = True


def _get_smtp_settings(db: Session):
    """Load SMTP integration settings (singleton row id=1)."""
    return db.get(models.IntegrationSettings, 1)


def _send_alert_email(settings: models.IntegrationSettings, to_email: str,
                       subject: str, body_text: str) -> tuple[bool, str]:
    """Send a plain-text alert email using the configured SMTP settings."""
    if not settings or not settings.smtp_enabled or not settings.smtp_host:
        return False, "SMTP not configured or disabled."
    if not to_email:
        return False, "No recipient email."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or 'PRM System'} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(body_text, "plain"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port or 465)
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
        server.quit()
        return True, f"Alert email sent to {to_email}"
    except Exception as exc:
        return False, f"Failed to send alert email: {exc}"


def _deliver_notifications(
    db: Session,
    rule: models.AlertRule,
    title: str,
    message: str,
    user_ids: list[int],
    task_id: int | None = None,
) -> None:
    """Fan out an alert via the channels enabled on the rule."""
    # 1) In-app notifications
    if rule.notify_in_app and user_ids:
        for uid in set(user_ids):
            db.add(models.Notification(
                user_id=uid,
                type=f"alert_{rule.severity}",
                title=title,
                message=message,
                task_id=task_id,
            ))

    # 2) Email
    if rule.notify_email:
        settings = _get_smtp_settings(db)
        if settings and settings.smtp_enabled:
            # Gather emails for the target users
            emails = (
                db.query(models.User.email)
                .filter(models.User.id.in_(user_ids), models.User.email.isnot(None))
                .all()
            )
            for (email,) in emails:
                _send_alert_email(settings, email, f"[PRM Alert] {title}", message)

    # 3) Teams webhook
    if rule.notify_teams:
        settings = _get_smtp_settings(db)  # reuse same row for teams_webhook_url
        if settings and settings.teams_enabled and settings.teams_webhook_url:
            send_teams_message(settings.teams_webhook_url, f"🔔 {title}", message)


def _find_user_ids_for_developer(db: Session, developer_id: int | None) -> list[int]:
    """Map a developer_id to the linked user account id."""
    if not developer_id:
        return []
    user = (
        db.query(models.User.id)
        .filter(models.User.developer_id == developer_id, models.User.active == True)
        .first()
    )
    return [user[0]] if user else []


def _find_manager_admin_user_ids(db: Session) -> list[int]:
    """Return user IDs with Admin or Manager role."""
    rows = (
        db.query(models.User.id)
        .filter(models.User.role.in_(["Admin", "Manager"]), models.User.active == True)
        .all()
    )
    return [r[0] for r in rows]


# ─── Alert Rules CRUD ─────────────────────────────────────────────────

@router.get("/rules", response_model=list[schemas.AlertRuleOut])
def list_rules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all alert rules (seeds defaults on first access)."""
    seed_default_rules(db)
    rules = (
        db.query(models.AlertRule)
        .options(joinedload(models.AlertRule.project))
        .order_by(models.AlertRule.id)
        .all()
    )
    return [
        schemas.AlertRuleOut(
            id=r.id,
            rule_type=r.rule_type,
            name=r.name,
            description=r.description,
            threshold=r.threshold,
            enabled=r.enabled,
            severity=r.severity,
            notify_in_app=r.notify_in_app,
            notify_email=r.notify_email,
            notify_teams=r.notify_teams,
            project_id=r.project_id,
            project_name=r.project.name if r.project else None,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rules
    ]


@router.post("/rules", response_model=schemas.AlertRuleOut)
def create_rule(
    payload: schemas.AlertRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    rule = models.AlertRule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return schemas.AlertRuleOut(
        **{k: v for k, v in payload.model_dump().items()},
        id=rule.id,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.put("/rules/{rule_id}", response_model=schemas.AlertRuleOut)
def update_rule(
    rule_id: int,
    payload: schemas.AlertRuleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    rule = db.get(models.AlertRule, rule_id)
    if not rule:
        raise HTTPException(404, "Alert rule not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    # Reload with project eagerly
    rule = (
        db.query(models.AlertRule)
        .options(joinedload(models.AlertRule.project))
        .filter(models.AlertRule.id == rule_id)
        .first()
    )
    return schemas.AlertRuleOut(
        id=rule.id,
        rule_type=rule.rule_type,
        name=rule.name,
        description=rule.description,
        threshold=rule.threshold,
        enabled=rule.enabled,
        severity=rule.severity,
        notify_in_app=rule.notify_in_app,
        notify_email=rule.notify_email,
        notify_teams=rule.notify_teams,
        project_id=rule.project_id,
        project_name=rule.project.name if rule.project else None,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin")),
):
    rule = db.get(models.AlertRule, rule_id)
    if not rule:
        raise HTTPException(404, "Alert rule not found")
    # Cascade-delete related alert history
    db.query(models.AlertHistory).filter(models.AlertHistory.rule_id == rule_id).delete()
    db.delete(rule)
    db.commit()
    return {"success": True, "deleted_id": rule_id}


# ─── Alert History ────────────────────────────────────────────────────

@router.get("/history", response_model=list[schemas.AlertHistoryOut])
def list_history(
    rule_type: str | None = None,
    severity: str | None = None,
    resolved: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.AlertHistory)
    if rule_type:
        q = q.filter(models.AlertHistory.rule_type == rule_type)
    if severity:
        q = q.filter(models.AlertHistory.severity == severity)
    if resolved is not None:
        q = q.filter(models.AlertHistory.resolved == resolved)
    items = (
        q.order_by(models.AlertHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items


@router.post("/history/{history_id}/resolve")
def resolve_alert(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ah = db.get(models.AlertHistory, history_id)
    if not ah:
        raise HTTPException(404, "Alert history record not found")
    ah.resolved = True
    ah.resolved_at = func.now()
    db.commit()
    return {"success": True}


# ─── Alert Checking Engine ────────────────────────────────────────────

@router.post("/check", response_model=schemas.AlertCheckResult)
def run_alert_check(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    """Manually trigger the alert engine: evaluate all enabled rules."""
    rules = db.query(models.AlertRule).filter(models.AlertRule.enabled == True).all()

    total_triggered = 0
    total_resolved = 0
    details: list[dict] = []

    now = datetime.now(timezone.utc)

    for rule in rules:
        triggered, resolved = 0, 0

        if rule.rule_type == "pr_review_pending":
            t, r = _check_pr_review_pending(db, rule, now)
            triggered, resolved = t, r

        elif rule.rule_type == "task_no_activity":
            t, r = _check_task_no_activity(db, rule, now)
            triggered, resolved = t, r

        elif rule.rule_type == "task_overdue":
            t, r = _check_task_overdue(db, rule, now)
            triggered, resolved = t, r

        elif rule.rule_type == "sprint_delay":
            t, r = _check_sprint_delay(db, rule, now)
            triggered, resolved = t, r

        total_triggered += triggered
        total_resolved += resolved
        if triggered or resolved:
            details.append({
                "rule": rule.name,
                "rule_type": rule.rule_type,
                "triggered": triggered,
                "resolved": resolved,
            })

    db.commit()
    return schemas.AlertCheckResult(
        alerts_triggered=total_triggered,
        alerts_resolved=total_resolved,
        details=details,
    )


# ─── Rule-type checkers ──────────────────────────────────────────────


def _check_pr_review_pending(db: Session, rule: models.AlertRule, now: datetime) -> tuple[int, int]:
    """
    threshold = hours.
    Find OPEN PRs with PENDING reviewers where (now - created_at_bb) > threshold hours.
    """
    cutoff = now - timedelta(hours=rule.threshold)
    triggered, resolved = 0, 0

    # Base query: open PRs older than the cutoff with at least one pending reviewer
    q = (
        db.query(models.PullRequest)
        .join(models.PRReviewer, models.PRReviewer.pr_id == models.PullRequest.id)
        .filter(
            models.PullRequest.status == "OPEN",
            models.PRReviewer.status == "PENDING",
            models.PullRequest.created_at_bb < cutoff,
        )
    )
    if rule.project_id:
        q = q.join(models.Repository, models.Repository.id == models.PullRequest.repo_id)
        q = q.filter(models.Repository.project_id == rule.project_id)

    pending_prs = q.distinct().all()
    pending_pr_ids = {pr.id for pr in pending_prs}

    # Existing unresolved alerts for this rule
    existing = (
        db.query(models.AlertHistory)
        .filter(
            models.AlertHistory.rule_id == rule.id,
            models.AlertHistory.entity_type == "PullRequest",
            models.AlertHistory.resolved == False,
        )
        .all()
    )
    existing_entity_ids = {ah.entity_id for ah in existing}

    # Create new alerts
    for pr in pending_prs:
        if pr.id not in existing_entity_ids:
            title = f"PR #{pr.pr_number} awaiting review"
            message = f"PR \"{pr.title or ''}\" has been pending review for over {rule.threshold}h."
            ah = models.AlertHistory(
                rule_id=rule.id,
                rule_type=rule.rule_type,
                severity=rule.severity,
                title=title,
                message=message,
                entity_type="PullRequest",
                entity_id=pr.id,
                entity_label=f"PR #{pr.pr_number}",
            )
            db.add(ah)
            triggered += 1
            user_ids = _find_user_ids_for_developer(db, pr.developer_id)
            _deliver_notifications(db, rule, title, message, user_ids)

    # Resolve alerts for PRs no longer pending
    for ah in existing:
        if ah.entity_id not in pending_pr_ids:
            ah.resolved = True
            ah.resolved_at = now
            resolved += 1

    return triggered, resolved


def _check_task_no_activity(db: Session, rule: models.AlertRule, now: datetime) -> tuple[int, int]:
    """
    threshold = days.
    Find in-progress tasks with no commits in the last N days.
    """
    cutoff = now - timedelta(days=rule.threshold)
    triggered, resolved = 0, 0

    # In-progress tasks
    in_progress_q = db.query(models.Task).filter(models.Task.status == "In Progress")
    if rule.project_id:
        in_progress_q = in_progress_q.filter(models.Task.project_id == rule.project_id)
    in_progress_tasks = in_progress_q.all()

    if not in_progress_tasks:
        return 0, 0

    task_ids = [t.id for t in in_progress_tasks]

    # Batch query: tasks that DO have recent commits
    recent_commit_task_ids = set(
        r[0] for r in
        db.query(models.Commit.task_id)
        .filter(
            models.Commit.task_id.in_(task_ids),
            models.Commit.committed_at >= cutoff,
        )
        .distinct()
        .all()
    )

    stale_task_ids = set(task_ids) - recent_commit_task_ids
    task_map = {t.id: t for t in in_progress_tasks}

    # Existing unresolved alerts
    existing = (
        db.query(models.AlertHistory)
        .filter(
            models.AlertHistory.rule_id == rule.id,
            models.AlertHistory.entity_type == "Task",
            models.AlertHistory.resolved == False,
        )
        .all()
    )
    existing_entity_ids = {ah.entity_id for ah in existing}

    for tid in stale_task_ids:
        if tid not in existing_entity_ids:
            task = task_map[tid]
            title = f"No dev activity on {task.task_code}"
            message = f"Task \"{task.task_code}\" has had no commits for {rule.threshold}+ days."
            ah = models.AlertHistory(
                rule_id=rule.id,
                rule_type=rule.rule_type,
                severity=rule.severity,
                title=title,
                message=message,
                entity_type="Task",
                entity_id=tid,
                entity_label=task.task_code,
            )
            db.add(ah)
            triggered += 1
            user_ids = _find_user_ids_for_developer(db, task.developer_id)
            _deliver_notifications(db, rule, title, message, user_ids, task_id=tid)

    # Resolve alerts for tasks that now have recent commits
    for ah in existing:
        if ah.entity_id not in stale_task_ids:
            ah.resolved = True
            ah.resolved_at = now
            resolved += 1

    return triggered, resolved


def _check_task_overdue(db: Session, rule: models.AlertRule, now: datetime) -> tuple[int, int]:
    """
    threshold = days (grace period after end_date).
    Find tasks overdue by more than threshold days, status not done, no merged PR.
    """
    grace_date = (now - timedelta(days=rule.threshold)).date()
    triggered, resolved = 0, 0

    done_statuses = {"Completed", "Deployed", "QA-Staging"}

    overdue_q = (
        db.query(models.Task)
        .filter(
            models.Task.end_date < grace_date,
            ~models.Task.status.in_(done_statuses),
        )
    )
    if rule.project_id:
        overdue_q = overdue_q.filter(models.Task.project_id == rule.project_id)
    overdue_tasks = overdue_q.all()

    if not overdue_tasks:
        # Resolve any lingering alerts
        lingering = (
            db.query(models.AlertHistory)
            .filter(
                models.AlertHistory.rule_id == rule.id,
                models.AlertHistory.entity_type == "Task",
                models.AlertHistory.resolved == False,
            )
            .all()
        )
        for ah in lingering:
            ah.resolved = True
            ah.resolved_at = now
        return 0, len(lingering)

    overdue_task_ids = [t.id for t in overdue_tasks]

    # Exclude tasks that have a merged PR
    merged_task_ids = set(
        r[0] for r in
        db.query(models.PullRequest.task_id)
        .filter(
            models.PullRequest.task_id.in_(overdue_task_ids),
            models.PullRequest.status == "MERGED",
        )
        .distinct()
        .all()
    )

    truly_overdue_ids = set(overdue_task_ids) - merged_task_ids
    task_map = {t.id: t for t in overdue_tasks}

    # Existing unresolved
    existing = (
        db.query(models.AlertHistory)
        .filter(
            models.AlertHistory.rule_id == rule.id,
            models.AlertHistory.entity_type == "Task",
            models.AlertHistory.resolved == False,
        )
        .all()
    )
    existing_entity_ids = {ah.entity_id for ah in existing}

    for tid in truly_overdue_ids:
        if tid not in existing_entity_ids:
            task = task_map[tid]
            title = f"Overdue: {task.task_code}"
            message = (
                f"Task \"{task.task_code}\" was due {task.end_date} "
                f"and is overdue by {rule.threshold}+ day grace period with no merged PR."
            )
            ah = models.AlertHistory(
                rule_id=rule.id,
                rule_type=rule.rule_type,
                severity=rule.severity,
                title=title,
                message=message,
                entity_type="Task",
                entity_id=tid,
                entity_label=task.task_code,
            )
            db.add(ah)
            triggered += 1
            user_ids = _find_user_ids_for_developer(db, task.developer_id)
            _deliver_notifications(db, rule, title, message, user_ids, task_id=tid)

    # Resolve alerts no longer applicable
    for ah in existing:
        if ah.entity_id not in truly_overdue_ids:
            ah.resolved = True
            ah.resolved_at = now
            resolved += 1

    return triggered, resolved


def _check_sprint_delay(db: Session, rule: models.AlertRule, now: datetime) -> tuple[int, int]:
    """
    threshold = percentage (e.g., 30 means 30% of tasks without any commits).
    Find active sprints where % of tasks with no commits exceeds threshold.
    """
    triggered, resolved = 0, 0

    sprint_q = db.query(models.Sprint).filter(models.Sprint.status == "Active")
    if rule.project_id:
        sprint_q = sprint_q.filter(models.Sprint.project_id == rule.project_id)
    active_sprints = sprint_q.all()

    if not active_sprints:
        lingering = (
            db.query(models.AlertHistory)
            .filter(
                models.AlertHistory.rule_id == rule.id,
                models.AlertHistory.entity_type == "Sprint",
                models.AlertHistory.resolved == False,
            )
            .all()
        )
        for ah in lingering:
            ah.resolved = True
            ah.resolved_at = now
        return 0, len(lingering)

    delayed_sprint_ids: set[int] = set()

    for sprint in active_sprints:
        # All task IDs in this sprint
        task_rows = (
            db.query(models.Task.id)
            .filter(models.Task.sprint_id == sprint.id)
            .all()
        )
        total_tasks = len(task_rows)
        if total_tasks == 0:
            continue

        task_ids = [r[0] for r in task_rows]

        # Tasks that have at least one commit
        tasks_with_commits = (
            db.query(models.Commit.task_id)
            .filter(models.Commit.task_id.in_(task_ids))
            .distinct()
            .count()
        )

        no_activity_count = total_tasks - tasks_with_commits
        pct_no_activity = (no_activity_count / total_tasks) * 100

        if pct_no_activity >= rule.threshold:
            delayed_sprint_ids.add(sprint.id)

            # Check if alert already exists
            exists = (
                db.query(models.AlertHistory.id)
                .filter(
                    models.AlertHistory.rule_id == rule.id,
                    models.AlertHistory.entity_type == "Sprint",
                    models.AlertHistory.entity_id == sprint.id,
                    models.AlertHistory.resolved == False,
                )
                .first()
            )
            if not exists:
                title = f"Sprint delay: {sprint.name}"
                message = (
                    f"{no_activity_count}/{total_tasks} tasks ({pct_no_activity:.0f}%) "
                    f"in sprint \"{sprint.name}\" have no dev activity."
                )
                ah = models.AlertHistory(
                    rule_id=rule.id,
                    rule_type=rule.rule_type,
                    severity=rule.severity,
                    title=title,
                    message=message,
                    entity_type="Sprint",
                    entity_id=sprint.id,
                    entity_label=sprint.name,
                )
                db.add(ah)
                triggered += 1
                user_ids = _find_manager_admin_user_ids(db)
                _deliver_notifications(db, rule, title, message, user_ids)

    # Resolve sprint alerts no longer applicable
    existing = (
        db.query(models.AlertHistory)
        .filter(
            models.AlertHistory.rule_id == rule.id,
            models.AlertHistory.entity_type == "Sprint",
            models.AlertHistory.resolved == False,
        )
        .all()
    )
    for ah in existing:
        if ah.entity_id not in delayed_sprint_ids:
            ah.resolved = True
            ah.resolved_at = now
            resolved += 1

    return triggered, resolved
