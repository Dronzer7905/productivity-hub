from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timezone, date

from models import db
from models.pomodoro import PomodoroSession

pomodoro_bp = Blueprint("pomodoro", __name__)


@pomodoro_bp.route("/api/pomodoro/sessions")
@login_required
def get_sessions():
    """Get today's pomodoro sessions."""
    from datetime import time
    today_start = datetime.combine(date.today(), time.min)
    sessions = PomodoroSession.query.filter_by(
        user_id=current_user.id
    ).filter(
        PomodoroSession.completed_at >= today_start
    ).order_by(PomodoroSession.completed_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions])


@pomodoro_bp.route("/api/pomodoro/sessions", methods=["POST"])
@login_required
def add_session():
    data = request.get_json()
    task_name = data.get("task_name", "Deep work session")
    mode = data.get("mode", "work")
    
    session_entry = PomodoroSession(
        user_id=current_user.id,
        task_name=task_name,
        mode=mode,
        duration=data.get("duration", 25),
        completed_at=datetime.now(),
    )
    db.session.add(session_entry)
    
    # Sync with DailyLog for real-time tracking
    if mode == "work":
        from models.tracker import DailyLog
        from datetime import time
        today_date = date.today()
        today_str = today_date.isoformat()
        today_start = datetime.combine(today_date, time.min)
        
        # Recalculate today's poms to be safe
        today_poms = PomodoroSession.query.filter_by(
            user_id=current_user.id, mode="work"
        ).filter(PomodoroSession.completed_at >= today_start).count() + 1 # +1 for the one we just added but haven't committed yet?
        
        # Actually, let's just commit first
        db.session.commit()
        
        # Now update log
        today_poms = PomodoroSession.query.filter_by(
            user_id=current_user.id, mode="work"
        ).filter(PomodoroSession.completed_at >= today_start).count()
        
        log = DailyLog.query.filter_by(user_id=current_user.id, date=today_str).first()
        if not log:
            log = DailyLog(user_id=current_user.id, date=today_str, dt_hours=0, ai_hours=0, pomodoros=today_poms, mood=0)
            db.session.add(log)
        else:
            log.pomodoros = today_poms
        
        db.session.commit()
    else:
        db.session.commit()
            
    return jsonify(session_entry.to_dict()), 201


@pomodoro_bp.route("/api/pomodoro/stats")
@login_required
def get_stats():
    """Get pomodoro stats: today count, total, streak."""
    from datetime import time
    today_start = datetime.combine(date.today(), time.min)

    today_count = PomodoroSession.query.filter_by(
        user_id=current_user.id, mode="work"
    ).filter(PomodoroSession.completed_at >= today_start).count()

    total_count = PomodoroSession.query.filter_by(
        user_id=current_user.id, mode="work"
    ).count()

    today_focus = today_count * 25  # minutes

    return jsonify({
        "today": today_count,
        "total": total_count,
        "today_focus_min": today_focus,
    })
