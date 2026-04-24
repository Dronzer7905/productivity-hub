from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from models import db

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard/stats")
@login_required
def dashboard_stats():
    """Get aggregated stats for the dashboard."""
    from datetime import date
    from models.pomodoro import PomodoroSession
    from models.tracker import DailyLog
    from models.task import Task

    today = date.today().isoformat()

    # Today's pomodoros
    today_poms = PomodoroSession.query.filter_by(
        user_id=current_user.id, mode="work"
    ).filter(
        PomodoroSession.completed_at >= today
    ).count()

    # Streak calculation (days with at least 1 pomodoro)
    logs = DailyLog.query.filter_by(user_id=current_user.id).order_by(
        DailyLog.date.desc()
    ).limit(30).all()

    streak = 0
    for log in logs:
        if log.pomodoros and log.pomodoros > 0:
            streak += 1
        else:
            break

    # Total hours this week
    week_logs = DailyLog.query.filter_by(user_id=current_user.id).order_by(
        DailyLog.date.desc()
    ).limit(7).all()

    total_hours = sum(l.dt_hours + l.ai_hours for l in week_logs)

    # Pending tasks
    pending_tasks = Task.query.filter_by(
        user_id=current_user.id, completed=False
    ).count()

    # P1 tasks today
    p1_today = Task.query.filter_by(
        user_id=current_user.id, completed=False, priority=1, due_date=today
    ).count()

    # ── Daily Activation Protocol ─────────────────────────
    from datetime import datetime, date
    today_date = date.today()
    today_str = today_date.isoformat()

    # 1. Reset Recurring Tasks
    recurring_tasks = Task.query.filter_by(user_id=current_user.id).filter(Task.recurring.in_(["daily", "weekly"])).all()
    resets = 0
    for task in recurring_tasks:
        if task.completed and task.completed_at:
            should_reset = False
            if task.recurring == "daily":
                should_reset = task.completed_at.date() < today_date
            elif task.recurring == "weekly":
                # Reset on Monday if completed in a previous week
                is_monday = today_date.weekday() == 0
                if is_monday:
                    should_reset = task.completed_at.isocalendar()[1] < today_date.isocalendar()[1]
            
            if should_reset:
                task.completed = False
                task.completed_at = None
                resets += 1

    # 1.5 Auto-Rollover Pending Tasks
    past_due_tasks = Task.query.filter_by(user_id=current_user.id, completed=False).filter(Task.due_date < today_str).all()
    for task in past_due_tasks:
        task.due_date = today_str
        resets += 1

    # 2. Daily Log Initialization
    # Ensure a DailyLog exists for today to track real-time velocity
    today_log = DailyLog.query.filter_by(user_id=current_user.id, date=today_str).first()
    if not today_log:
        today_log = DailyLog(user_id=current_user.id, date=today_str, dt_hours=0, ai_hours=0, pomodoros=0, mood=0)
        db.session.add(today_log)
    
    # 3. Synchronize Pomodoro Count to Daily Log
    # In case sessions were logged but the daily log hasn't updated its summary
    today_log.pomodoros = today_poms
    
    db.session.commit()

    return jsonify({
        "today_pomodoros": today_poms,
        "streak": streak,
        "week_hours": round(total_hours, 1),
        "pending_tasks": pending_tasks,
        "p1_today": p1_today,
        "daily_resets": resets,
        "active_protocol": True
    })
