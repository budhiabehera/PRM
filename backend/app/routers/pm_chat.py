"""
PM Chat Router — Zero-Cost AI Project Manager
===============================================
Keyword-matching "chat" that routes questions to the right SQL query
+ text template. Also provides direct summary endpoints.

All responses generated from SQL queries + text templates — NO LLM API calls.
"""
from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..services.pm_context import (
    get_project_context,
    get_sprint_context,
    get_developer_context,
    get_daily_brief,
    find_project_by_name,
    find_sprint_by_name,
    find_developer_by_name,
    get_current_sprint,
    get_idle_developers,
    get_pr_status_summary,
)
from ..services.pm_templates import (
    render_project_summary,
    render_sprint_summary,
    render_daily_brief,
    render_developer_report,
    render_risk_report,
    render_idle_report,
    render_pr_status,
    render_team_report,
    render_help,
)

router = APIRouter(prefix="/api/pm", tags=["PM Assistant"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    project_id: int | None = None
    sprint_id: int | None = None


class ChatResponse(BaseModel):
    response: str
    type: str
    data: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Intent detection — keyword matching
# ---------------------------------------------------------------------------

INTENT_PATTERNS: dict[str, list[str]] = {
    "project_status": [
        "how is", "how's the project", "project status", "project health",
        "project summary", "project overview", "how are we doing",
    ],
    "sprint_summary": [
        "sprint", "sprint status", "sprint summary", "how's the sprint",
        "sprint report", "sprint progress",
    ],
    "my_tasks": [
        "my tasks", "what should i", "focus today", "my work",
        "what do i", "daily brief", "good morning", "what's on my plate",
        "my focus", "my day",
    ],
    "developer_report": [
        "how is .+ doing", "developer report", "team member",
        "developer status", "dev report",
    ],
    "risk_report": [
        "at risk", "risks", "delayed", "overdue", "blockers",
        "what's at risk", "risk report", "show me risks",
    ],
    "who_is_idle": [
        "idle", "no activity", "who is not", "inactive",
        "who is idle", "who hasn't", "not working",
    ],
    "pr_status": [
        "pull request", "prs", "pr status", "code review",
        "merge", "open prs", "pr summary",
    ],
    "velocity": [
        "velocity", "commits per day", "how fast", "speed",
        "throughput", "commit rate",
    ],
}


def _detect_intent(message: str) -> str:
    """Match user message to an intent. Returns intent key or 'help'."""
    msg = message.lower().strip()

    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            # Support regex patterns (e.g. "how is .+ doing")
            if "." in pattern or "+" in pattern or "*" in pattern:
                try:
                    if re.search(pattern, msg):
                        return intent
                except re.error:
                    if pattern in msg:
                        return intent
            else:
                if pattern in msg:
                    return intent
    return "help"


def _extract_entity_name(message: str, intent: str) -> str | None:
    """Try to extract a project/sprint/developer name from the message."""
    msg = message.strip()

    # "how is X doing" pattern
    match = re.search(r"how is (.+?) doing", msg, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # "for X" pattern
    match = re.search(r"(?:for|about|of)\s+(.+?)(?:\?|$)", msg, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # "X status" or "X summary" pattern
    match = re.search(r"^(.+?)\s+(?:status|summary|report|health)", msg, re.IGNORECASE)
    if match:
        name = match.group(1).strip()
        # Exclude generic words
        if name.lower() not in {"project", "sprint", "dev", "developer", "team", "pr", "pull request", "the"}:
            return name

    return None


def _resolve_project(
    db: Session, message: str, explicit_id: int | None = None,
) -> models.Project | None:
    """Resolve a project from explicit ID, message mention, or default first."""
    if explicit_id:
        return db.get(models.Project, explicit_id)

    name = _extract_entity_name(message, "project")
    if name:
        proj = find_project_by_name(db, name)
        if proj:
            return proj

    # Try to match any known project name in the message
    projects = db.query(models.Project).all()
    msg_lower = message.lower()
    for p in projects:
        if p.name.lower() in msg_lower or p.code.lower() in msg_lower:
            return p

    # Default: first active project
    return db.query(models.Project).filter(models.Project.status == "Active").first()


def _resolve_sprint(
    db: Session, message: str, explicit_id: int | None = None,
) -> models.Sprint | None:
    """Resolve a sprint from explicit ID, message mention, or current."""
    if explicit_id:
        return db.get(models.Sprint, explicit_id)

    # Try to find sprint name in message
    sprints = db.query(models.Sprint).all()
    msg_lower = message.lower()
    for s in sprints:
        if s.name.lower() in msg_lower:
            return s

    # Default: current sprint
    return get_current_sprint(db)


def _resolve_developer(db: Session, message: str) -> models.Developer | None:
    """Try to extract and find a developer name from the message."""
    name = _extract_entity_name(message, "developer")
    if name:
        return find_developer_by_name(db, name)

    # Try matching known developer names in the message
    devs = db.query(models.Developer).filter(models.Developer.active == True).all()  # noqa: E712
    msg_lower = message.lower()
    for d in devs:
        # Match first name or full name
        if d.name.lower() in msg_lower:
            return d
        first_name = d.name.split()[0].lower()
        if len(first_name) > 2 and first_name in msg_lower:
            return d

    return None


# ---------------------------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
def pm_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Zero-cost AI chat — routes natural-language questions to SQL queries
    and text templates. No LLM API calls.
    """
    message = req.message
    intent = _detect_intent(message)

    # ── PROJECT STATUS ────────────────────────────────────────────────
    if intent == "project_status":
        project = _resolve_project(db, message, req.project_id)
        if not project:
            return ChatResponse(
                response="I couldn't find a project. Try specifying a project name.",
                type="error",
            )
        ctx = get_project_context(db, project.id)
        return ChatResponse(
            response=render_project_summary(ctx),
            type="project_summary",
            data=ctx,
        )

    # ── SPRINT SUMMARY ────────────────────────────────────────────────
    if intent == "sprint_summary":
        sprint = _resolve_sprint(db, message, req.sprint_id)
        if not sprint:
            return ChatResponse(
                response="I couldn't find a matching sprint. Try 'sprint summary for Aug-2026'.",
                type="error",
            )
        ctx = get_sprint_context(db, sprint.id)
        return ChatResponse(
            response=render_sprint_summary(ctx),
            type="sprint_summary",
            data=ctx,
        )

    # ── MY TASKS / DAILY BRIEF ────────────────────────────────────────
    if intent == "my_tasks":
        dev_id = current_user.developer_id
        if not dev_id:
            return ChatResponse(
                response="Your account isn't linked to a developer profile. Ask an admin to link it.",
                type="error",
            )
        ctx = get_daily_brief(db, dev_id)
        return ChatResponse(
            response=render_daily_brief(ctx),
            type="daily_brief",
            data=ctx,
        )

    # ── DEVELOPER REPORT ──────────────────────────────────────────────
    if intent == "developer_report":
        dev = _resolve_developer(db, message)
        if not dev:
            return ChatResponse(
                response="I couldn't identify which developer. Try 'How is Budhia doing?' or 'Developer report for Biswajit'.",
                type="error",
            )
        sprint = _resolve_sprint(db, message, req.sprint_id)
        ctx = get_developer_context(db, dev.id, sprint.id if sprint else None)
        return ChatResponse(
            response=render_developer_report(ctx),
            type="developer_report",
            data=ctx,
        )

    # ── RISK REPORT ───────────────────────────────────────────────────
    if intent == "risk_report":
        project = _resolve_project(db, message, req.project_id)
        if not project:
            return ChatResponse(response="No project found.", type="error")
        proj_ctx = get_project_context(db, project.id)
        sprint = _resolve_sprint(db, message, req.sprint_id)
        sprint_ctx = get_sprint_context(db, sprint.id) if sprint else None
        return ChatResponse(
            response=render_risk_report(proj_ctx, sprint_ctx),
            type="risk_report",
        )

    # ── IDLE DEVELOPERS ───────────────────────────────────────────────
    if intent == "who_is_idle":
        project = _resolve_project(db, message, req.project_id)
        idle = get_idle_developers(db, project.id if project else None)
        return ChatResponse(
            response=render_idle_report(idle),
            type="idle_report",
            data={"idle_developers": idle},
        )

    # ── PR STATUS ─────────────────────────────────────────────────────
    if intent == "pr_status":
        project = _resolve_project(db, message, req.project_id)
        ctx = get_pr_status_summary(db, project.id if project else None)
        return ChatResponse(
            response=render_pr_status(ctx),
            type="pr_status",
            data=ctx,
        )

    # ── VELOCITY ──────────────────────────────────────────────────────
    if intent == "velocity":
        sprint = _resolve_sprint(db, message, req.sprint_id)
        if not sprint:
            return ChatResponse(
                response="No active sprint found to measure velocity.",
                type="error",
            )
        ctx = get_sprint_context(db, sprint.id)
        velocity_text = (
            f"📈 Velocity Report: {ctx['sprint_name']}\n\n"
            f"Commits per day: {ctx['velocity_commits_per_day']}\n"
            f"Sprint progress: {ctx['completion_pct']}%\n"
            f"Days remaining: {ctx['days_remaining']}\n"
            f"Utilization: {ctx['utilization_pct']}%"
        )
        return ChatResponse(
            response=velocity_text,
            type="velocity",
            data=ctx,
        )

    # ── HELP (fallback) ───────────────────────────────────────────────
    return ChatResponse(
        response=render_help(),
        type="help",
    )


# ---------------------------------------------------------------------------
# Direct summary endpoints (non-chat)
# ---------------------------------------------------------------------------

@router.get("/project-summary")
def project_summary(
    project_id: int = Query(..., description="Project ID"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Rendered project summary text."""
    ctx = get_project_context(db, project_id)
    return {
        "text": render_project_summary(ctx),
        "data": ctx,
    }


@router.get("/sprint-summary")
def sprint_summary(
    sprint_id: int = Query(..., description="Sprint ID"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Rendered sprint summary text."""
    ctx = get_sprint_context(db, sprint_id)
    return {
        "text": render_sprint_summary(ctx),
        "data": ctx,
    }


@router.get("/daily-brief")
def daily_brief(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Personalized daily brief for the current user."""
    dev_id = current_user.developer_id
    if not dev_id:
        return {
            "text": "Your account isn't linked to a developer profile.",
            "data": {},
        }
    ctx = get_daily_brief(db, dev_id)
    return {
        "text": render_daily_brief(ctx),
        "data": ctx,
    }


@router.get("/team-report")
def team_report(
    project_id: int = Query(None, description="Filter by project"),
    sprint_id: int = Query(None, description="Filter by sprint"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """All developer reports for a project/sprint."""
    dev_q = db.query(models.Developer).filter(models.Developer.active == True)  # noqa: E712

    if project_id:
        dev_q = dev_q.filter(
            models.Developer.id.in_(
                db.query(models.developer_projects.c.developer_id)
                .filter(models.developer_projects.c.project_id == project_id)
            )
        )

    devs = dev_q.order_by(models.Developer.name).all()

    dev_contexts = []
    for d in devs:
        ctx = get_developer_context(db, d.id, sprint_id)
        dev_contexts.append(ctx)

    return {
        "text": render_team_report(dev_contexts),
        "data": {"developers": dev_contexts},
    }


@router.get("/developer-report")
def developer_report(
    developer_id: int = Query(..., description="Developer ID"),
    sprint_id: int = Query(None, description="Optional sprint filter"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Single developer report."""
    ctx = get_developer_context(db, developer_id, sprint_id)
    return {
        "text": render_developer_report(ctx),
        "data": ctx,
    }
