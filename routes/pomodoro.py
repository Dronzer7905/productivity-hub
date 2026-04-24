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
    today = date.today().isoformat()
    sessions = PomodoroSession.query.filter_by(
        user_id=current_user.id
    ).filter(
        PomodoroSession.completed_at >= today
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
        completed_at=datetime.now(timezone.utc),
    )
    db.session.add(session_entry)
    
    # Instead of auto-completing, we only log the session against the task name.
    # The user must manually mark the task finished when all sprints are complete.
            
    db.session.commit()
    return jsonify(session_entry.to_dict()), 201


@pomodoro_bp.route("/api/pomodoro/stats")
@login_required
def get_stats():
    """Get pomodoro stats: today count, total, streak."""
    today = date.today().isoformat()

    today_count = PomodoroSession.query.filter_by(
        user_id=current_user.id, mode="work"
    ).filter(PomodoroSession.completed_at >= today).count()

    total_count = PomodoroSession.query.filter_by(
        user_id=current_user.id, mode="work"
    ).count()

    today_focus = today_count * 25  # minutes

    return jsonify({
        "today": today_count,
        "total": total_count,
        "today_focus_min": today_focus,
    })
