"""
Background Scheduler — lightweight daily hours check at 10 PM IST.

Uses a daemon thread so it stops automatically when the FastAPI process exits.
Start this from main.py's @app.on_event("startup") or lifespan context.

Trigger: Every day at 22:00 IST (UTC+5:30) = 16:30 UTC.
Action:  Runs daily_hours_check.run_daily_hours_check() for today's date.

This is an alternative to external cron / Task Scheduler / Azure WebJob.
The API endpoint POST /api/time-logs/schedule-check can also be called
externally for the same purpose.
"""

import threading
import time
import traceback
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))
TARGET_HOUR = 22   # 10 PM IST
TARGET_MINUTE = 0


def _daily_hours_check_loop():
    """Background thread that sleeps until 10 PM IST, runs the check, then repeats."""
    while True:
        try:
            now = datetime.now(IST)
            # Calculate next 10 PM IST
            target = now.replace(hour=TARGET_HOUR, minute=TARGET_MINUTE, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            sleep_seconds = (target - now).total_seconds()
            print(f"[HOURS CHECK SCHEDULER] Next run at {target.strftime('%Y-%m-%d %H:%M IST')} "
                  f"(sleeping {sleep_seconds:.0f}s / {sleep_seconds/3600:.1f}h)")
            time.sleep(sleep_seconds)

            # Run the check
            print(f"[HOURS CHECK SCHEDULER] Running daily hours check at {datetime.now(IST).strftime('%Y-%m-%d %H:%M IST')}...")
            from ..database import SessionLocal
            db = SessionLocal()
            try:
                from .daily_hours_check import run_daily_hours_check
                result = run_daily_hours_check(db)
                print(f"[HOURS CHECK SCHEDULER] Completed: checked={result['checked']}, "
                      f"under_hours={result['under_hours']}, emails_sent={result['emails_sent']}, "
                      f"on_leave={result['on_leave']}, skipped={result['skipped']}")
            finally:
                db.close()

        except Exception as e:
            print(f"[HOURS CHECK SCHEDULER] Error: {e}")
            traceback.print_exc()
            # Sleep 60 seconds before retrying to avoid tight error loops
            time.sleep(60)


_scheduler_started = False
_scheduler_lock = threading.Lock()


def start_hours_check_scheduler():
    """Start the background scheduler thread (idempotent — safe to call multiple times)."""
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            print("[HOURS CHECK SCHEDULER] Already running, skipping duplicate start.")
            return
        _scheduler_started = True

    thread = threading.Thread(target=_daily_hours_check_loop, daemon=True, name="daily-hours-check")
    thread.start()
    print(f"[HOURS CHECK SCHEDULER] Background thread started. "
          f"Will check hours at {TARGET_HOUR}:{TARGET_MINUTE:02d} IST daily.")
