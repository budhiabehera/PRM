"""
PM Template Engine — Zero-Cost AI Project Manager
===================================================
Text templates that render context dicts from pm_context.py into
human-readable summaries. Pure string formatting, no LLM API calls.
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _risk_emoji(level: str) -> str:
    return {"LOW": "🟢", "MEDIUM": "🟡", "HIGH": "🔴"}.get(level, "⚪")


def _priority_emoji(ptype: str) -> str:
    return {"review": "👀", "task": "📌"}.get(ptype, "•")


def _progress_bar(pct: float, width: int = 20) -> str:
    filled = round(pct / 100 * width)
    return "█" * filled + "░" * (width - filled)


def _bullet_list(items: list[str], indent: str = "  ") -> str:
    if not items:
        return f"{indent}(none)"
    return "\n".join(f"{indent}• {item}" for item in items)


# ═══════════════════════════════════════════════════════════════════════════
# 1. PROJECT SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

def render_project_summary(ctx: dict[str, Any]) -> str:
    if "error" in ctx:
        return f"❌ {ctx['error']}"

    pct = ctx["completion_pct"]
    bar = _progress_bar(pct)
    variance = ctx["hours_variance"]
    var_label = "under budget" if variance < 0 else "over budget" if variance > 0 else "on budget"

    # Developer table (top 5)
    devs = ctx.get("developers", [])[:5]
    dev_lines = []
    if devs:
        dev_lines.append("  Name                Tasks  Done  Commits")
        dev_lines.append("  " + "─" * 44)
        for d in devs:
            dev_lines.append(
                f"  {d['name']:<20s}{d['tasks']:>5d}{d['completed']:>6d}{d['commits']:>9d}"
            )

    risks = ctx.get("risks", [])

    lines = [
        f"📊 Project Status: {ctx['project_name']}",
        "",
        f"Overall Progress: {pct}% ({ctx['completed_tasks']}/{ctx['total_tasks']} tasks)",
        f"{bar}",
        f"Hours: {ctx['total_actual_hours']}h / {ctx['total_estimated_hours']}h estimated ({variance:+.1f}h {var_label})",
        "",
        "Development Activity:",
        f"  • {ctx['total_commits']} commits, {ctx['total_prs']} PRs ({ctx['merged_prs']} merged, {ctx['open_prs']} open)",
        f"  • Average PR merge time: {ctx['avg_merge_time_hr']}h",
        f"  • {ctx['active_developers']} active developers",
    ]

    if risks:
        lines.append("")
        lines.append("⚠️ Risks:")
        lines.append(_bullet_list(risks))

    if dev_lines:
        lines.append("")
        lines.append("👥 Top Contributors:")
        lines.extend(dev_lines)

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 2. SPRINT SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

def render_sprint_summary(ctx: dict[str, Any]) -> str:
    if "error" in ctx:
        return f"❌ {ctx['error']}"

    pct = ctx["completion_pct"]
    bar = _progress_bar(pct)
    risk_em = _risk_emoji(ctx["risk_level"])

    lines = [
        f"🏃 Sprint Summary: {ctx['sprint_name']}",
        f"Period: {ctx['start_date']} → {ctx['end_date']} ({ctx['days_remaining']} days remaining)",
        "",
        f"Progress: {pct}% complete",
        f"{bar}",
        f"├── ✅ Completed: {ctx['completed']}",
        f"├── 🔄 In Progress: {ctx['in_progress']}",
        f"└── ⬜ Not Started: {ctx['not_started']}",
        "",
        f"Engineering Readiness: {ctx['readiness_pct']}%",
        f"├── Tasks with commits: {ctx['tasks_with_commits']}",
        f"├── Tasks with merged PR: {ctx['tasks_with_merged_pr']}",
        f"└── Tasks with no activity: {ctx['tasks_no_activity']} ⚠️" if ctx["tasks_no_activity"] else f"└── Tasks with no activity: {ctx['tasks_no_activity']}",
        "",
        f"Velocity: {ctx['velocity_commits_per_day']} commits/day",
        f"Utilization: {ctx['utilization_pct']}% ({ctx['total_hours_logged']}h / {ctx['capacity_hours']}h)",
        "",
        f"Risk Level: {risk_em} {ctx['risk_level']}",
    ]

    # Top contributors
    contribs = ctx.get("top_contributors", [])[:5]
    if contribs:
        lines.append("")
        lines.append("👥 Top Contributors:")
        for c in contribs:
            lines.append(f"  • {c['name']}: {c['commits']} commits, {c['prs']} PRs")

    # Blockers
    blockers = ctx.get("blockers", [])
    if blockers:
        lines.append("")
        lines.append("🚧 Blockers:")
        for b in blockers:
            lines.append(f"  • {b['task_code']} — {b['subject']}: {b['reason']}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 3. DAILY BRIEF
# ═══════════════════════════════════════════════════════════════════════════

def render_daily_brief(ctx: dict[str, Any]) -> str:
    if "error" in ctx:
        return f"❌ {ctx['error']}"

    lines = [
        f"☀️ {ctx['greeting']}",
        f"📅 {ctx['date']}",
        "",
        ctx["summary"],
    ]

    # Focus items
    focus = ctx.get("focus_items", [])
    if focus:
        lines.append("")
        lines.append("🎯 Today's Focus:")
        for item in focus:
            emoji = _priority_emoji(item["type"])
            lines.append(f"  {item['priority']}. {emoji} {item['text']}")

    # Yesterday's activity
    ya = ctx.get("yesterday_activity", {})
    if ya:
        lines.append("")
        lines.append("📈 Yesterday's Activity:")
        lines.append(
            f"  • {ya.get('commits', 0)} commits, "
            f"{ya.get('prs_opened', 0)} PRs opened, "
            f"{ya.get('prs_merged', 0)} merged, "
            f"{ya.get('hours_logged', 0)}h logged"
        )

    # Alerts
    alerts = ctx.get("alerts", [])
    if alerts:
        lines.append("")
        lines.append("🚨 Alerts:")
        lines.append(_bullet_list(alerts))

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 4. DEVELOPER REPORT
# ═══════════════════════════════════════════════════════════════════════════

def render_developer_report(ctx: dict[str, Any]) -> str:
    if "error" in ctx:
        return f"❌ {ctx['error']}"

    lines = [
        f"👤 Developer Report: {ctx['developer_name']}",
        "",
        f"Tasks: {ctx['assigned_tasks']} assigned",
        f"├── ✅ Completed: {ctx['completed_tasks']}",
        f"├── 🔄 In Progress: {ctx['in_progress_tasks']}",
        f"└── 📋 Other: {ctx['assigned_tasks'] - ctx['completed_tasks'] - ctx['in_progress_tasks']}",
        "",
        f"Engineering:",
        f"  • {ctx['total_commits']} commits, {ctx['total_prs']} PRs",
        f"  • {ctx['reviews_given']} code reviews given (avg {ctx['avg_review_time_hr']}h turnaround)",
        f"  • {ctx['hours_logged']}h logged",
    ]

    # Today's tasks
    today = ctx.get("today_tasks", [])
    if today:
        lines.append("")
        lines.append("📌 Active Tasks:")
        for t in today:
            lines.append(f"  • {t['task_code']} — {t['subject']} [{t['status']}] {t['percentage']}%")

    # Pending reviews
    reviews = ctx.get("pending_reviews", [])
    if reviews:
        lines.append("")
        lines.append("👀 Pending Reviews:")
        for r in reviews:
            days = round(r["hours_waiting"] / 24, 1)
            lines.append(f"  • PR #{r['pr_number']} '{r['title']}' — waiting {days} days")

    # Focus recommendations
    focus = ctx.get("focus_recommendations", [])
    if focus:
        lines.append("")
        lines.append("💡 Recommendations:")
        for i, f_item in enumerate(focus, 1):
            lines.append(f"  {i}. {f_item}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 5. RISK REPORT
# ═══════════════════════════════════════════════════════════════════════════

def render_risk_report(project_ctx: dict[str, Any], sprint_ctx: dict[str, Any] | None = None) -> str:
    """Combine project and sprint risks into a risk report."""
    lines = [f"⚠️ Risk Report: {project_ctx.get('project_name', 'Unknown')}"]

    # Project-level risks
    risks = project_ctx.get("risks", [])
    if risks:
        lines.append("")
        lines.append("Project Risks:")
        lines.append(_bullet_list(risks))

    # Sprint-level info
    if sprint_ctx and "error" not in sprint_ctx:
        lines.append("")
        risk_em = _risk_emoji(sprint_ctx["risk_level"])
        lines.append(f"Sprint Risk Level: {risk_em} {sprint_ctx['risk_level']}")

        blockers = sprint_ctx.get("blockers", [])
        if blockers:
            lines.append("")
            lines.append("🚧 Sprint Blockers:")
            for b in blockers:
                lines.append(f"  • {b['task_code']} — {b['reason']}")

        if sprint_ctx["tasks_no_activity"]:
            lines.append(f"\n📉 {sprint_ctx['tasks_no_activity']} tasks have no engineering activity")

    if not risks and (not sprint_ctx or sprint_ctx.get("risk_level") == "LOW"):
        lines.append("")
        lines.append("🟢 No significant risks detected. Looking good!")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 6. IDLE DEVELOPERS
# ═══════════════════════════════════════════════════════════════════════════

def render_idle_report(idle_devs: list[dict]) -> str:
    if not idle_devs:
        return "✅ All developers have been active in the last 7 days."

    lines = [
        f"😴 Inactive Developers ({len(idle_devs)} found):",
        f"No commits or time logs in the last 7 days:",
        "",
    ]
    for d in idle_devs:
        lines.append(f"  • {d['name']} ({d['dev_code']})")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 7. PR STATUS
# ═══════════════════════════════════════════════════════════════════════════

def render_pr_status(ctx: dict[str, Any]) -> str:
    lines = [
        "🔀 Pull Request Status",
        "",
        f"Total: {ctx['total_prs']} PRs",
        f"├── 🟢 Open: {ctx['open']}",
        f"├── ✅ Merged: {ctx['merged']}",
        f"└── ❌ Declined: {ctx['declined']}",
    ]

    stale = ctx.get("stale_prs", [])
    if stale:
        lines.append("")
        lines.append(f"⏰ Stale PRs (open > 48h): {len(stale)}")
        for p in stale[:5]:
            lines.append(f"  • PR #{p['pr_number']} '{p['title']}' by {p['author']} — {round(p['hours_open'] / 24, 1)} days")

    open_prs = ctx.get("open_prs", [])
    if open_prs:
        lines.append("")
        lines.append("Open PRs:")
        for p in open_prs:
            lines.append(f"  • PR #{p['pr_number']} '{p['title']}' by {p['author']}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 8. TEAM REPORT (multiple devs)
# ═══════════════════════════════════════════════════════════════════════════

def render_team_report(dev_contexts: list[dict[str, Any]]) -> str:
    if not dev_contexts:
        return "No developer data available."

    lines = [
        f"👥 Team Report ({len(dev_contexts)} developers)",
        "═" * 50,
    ]
    for ctx in dev_contexts:
        if "error" in ctx:
            continue
        lines.append("")
        lines.append(f"  {ctx['developer_name']}")
        lines.append(f"    Tasks: {ctx['completed_tasks']}/{ctx['assigned_tasks']} done | "
                      f"Commits: {ctx['total_commits']} | PRs: {ctx['total_prs']} | "
                      f"Hours: {ctx['hours_logged']}h")
        if ctx.get("pending_reviews"):
            lines.append(f"    ⏳ {len(ctx['pending_reviews'])} pending review{'s' if len(ctx['pending_reviews']) != 1 else ''}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# 9. HELP MESSAGE
# ═══════════════════════════════════════════════════════════════════════════

def render_help() -> str:
    return """🤖 PRM Project Manager — Zero-Cost AI Assistant

I can answer questions about your project using real data. Try asking:

📊 Project Status:
  • "How is FX-POS doing?"
  • "Project status"

🏃 Sprint Status:
  • "How's the sprint?"
  • "Sprint summary for Aug-2026"

📌 My Tasks:
  • "What should I focus on today?"
  • "My tasks"

👤 Developer Reports:
  • "How is Budhia doing?"
  • "Developer report for Biswajit"

⚠️ Risks & Blockers:
  • "What's at risk?"
  • "Show me blockers"

😴 Idle Developers:
  • "Who is idle?"
  • "Inactive developers"

🔀 PR Status:
  • "PR status"
  • "Pull request summary"

📈 Velocity:
  • "How fast are we going?"
  • "Commits per day"

All responses are generated from live SQL data — zero AI cost! 🎉"""
