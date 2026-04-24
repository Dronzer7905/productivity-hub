from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.tracker import DailyLog, AIMLLog, KPILog

tracker_bp = Blueprint("tracker", __name__)


# ── Daily Logs ──────────────────────────────────────────

@tracker_bp.route("/api/tracker/daily")
@login_required
def get_daily_logs():
    logs = DailyLog.query.filter_by(
        user_id=current_user.id
    ).order_by(DailyLog.date.desc()).limit(60).all()
    return jsonify([l.to_dict() for l in logs])


@tracker_bp.route("/api/tracker/daily", methods=["POST"])
@login_required
def save_daily_log():
    data = request.get_json()
    date_val = data.get("date")
    if not date_val:
        return jsonify({"error": "Date is required"}), 400

    log = DailyLog.query.filter_by(
        user_id=current_user.id, date=date_val
    ).first()

    if log:
        # Update existing
        log.dt_hours = data.get("dt_hours", log.dt_hours)
        log.ai_hours = data.get("ai_hours", log.ai_hours)
        log.pomodoros = data.get("pomodoros", log.pomodoros)
        log.mood = data.get("mood", log.mood)
        log.commits = data.get("commits", log.commits)
        log.top_win = data.get("top_win", log.top_win)
        log.blocker = data.get("blocker", log.blocker)
    else:
        log = DailyLog(
            user_id=current_user.id,
            date=date_val,
            dt_hours=data.get("dt_hours", 0),
            ai_hours=data.get("ai_hours", 0),
            pomodoros=data.get("pomodoros", 0),
            mood=data.get("mood", 0),
            commits=data.get("commits", 0),
            top_win=data.get("top_win", ""),
            blocker=data.get("blocker", ""),
        )
        db.session.add(log)

    db.session.commit()
    return jsonify(log.to_dict()), 201


@tracker_bp.route("/api/tracker/daily/<int:log_id>", methods=["DELETE"])
@login_required
def delete_daily_log(log_id):
    log = DailyLog.query.filter_by(
        id=log_id, user_id=current_user.id
    ).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@tracker_bp.route("/api/tracker/daily/stats")
@login_required
def daily_stats():
    logs = DailyLog.query.filter_by(user_id=current_user.id).all()
    total_days = len(logs)
    total_dt = sum(l.dt_hours for l in logs)
    total_ai = sum(l.ai_hours for l in logs)
    total_poms = sum(l.pomodoros for l in logs)
    moods = [l.mood for l in logs if l.mood > 0]
    avg_mood = round(sum(moods) / len(moods), 1) if moods else 0
    return jsonify({
        "total_days": total_days,
        "total_dt_hours": round(total_dt, 1),
        "total_ai_hours": round(total_ai, 1),
        "total_pomodoros": total_poms,
        "avg_mood": avg_mood,
    })


# ── AI/ML Logs ──────────────────────────────────────────

@tracker_bp.route("/api/tracker/aiml")
@login_required
def get_aiml_logs():
    logs = AIMLLog.query.filter_by(
        user_id=current_user.id
    ).order_by(AIMLLog.date.desc()).limit(50).all()
    return jsonify([l.to_dict() for l in logs])


@tracker_bp.route("/api/tracker/aiml", methods=["POST"])
@login_required
def save_aiml_log():
    data = request.get_json()
    if not data.get("topic"):
        return jsonify({"error": "Topic is required"}), 400

    log = AIMLLog(
        user_id=current_user.id,
        date=data.get("date", ""),
        topic=data["topic"],
        source=data.get("source", ""),
        applied_to=data.get("applied_to", "No"),
        notes=data.get("notes", ""),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@tracker_bp.route("/api/tracker/aiml/<int:log_id>", methods=["DELETE"])
@login_required
def delete_aiml_log(log_id):
    log = AIMLLog.query.filter_by(
        id=log_id, user_id=current_user.id
    ).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"})


# ── KPI Logs ────────────────────────────────────────────

@tracker_bp.route("/api/tracker/kpis")
@login_required
def get_kpi_logs():
    logs = KPILog.query.filter_by(
        user_id=current_user.id
    ).order_by(KPILog.week_date.desc()).limit(20).all()
    return jsonify([l.to_dict() for l in logs])


@tracker_bp.route("/api/tracker/kpis", methods=["POST"])
@login_required
def save_kpi_log():
    data = request.get_json()
    log = KPILog(
        user_id=current_user.id,
        week_date=data.get("week_date", ""),
        leads=data.get("leads", 0),
        clients=data.get("clients", 0),
        revenue=data.get("revenue", 0),
        commits=data.get("commits", 0),
        blogs=data.get("blogs", 0),
        stars=data.get("stars", 0),
        big_win=data.get("big_win", ""),
        next_goal=data.get("next_goal", ""),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@tracker_bp.route("/api/tracker/kpis/<int:log_id>", methods=["DELETE"])
@login_required
def delete_kpi_log(log_id):
    log = KPILog.query.filter_by(
        id=log_id, user_id=current_user.id
    ).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"})
