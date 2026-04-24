import json

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.planner import WeeklyPlan

planner_bp = Blueprint("planner", __name__)


@planner_bp.route("/api/planner/<week_key>")
@login_required
def get_week(week_key):
    plan = WeeklyPlan.query.filter_by(
        user_id=current_user.id, week_key=week_key
    ).first()
    if plan:
        return jsonify(plan.to_dict())
    return jsonify({
        "week_key": week_key,
        "goals": {},
        "priorities": {},
        "review": {},
        "reflection": "",
        "numbers": {},
        "habits": {},
    })


@planner_bp.route("/api/planner/<week_key>", methods=["POST"])
@login_required
def save_week(week_key):
    data = request.get_json()
    plan = WeeklyPlan.query.filter_by(
        user_id=current_user.id, week_key=week_key
    ).first()

    if plan:
        plan.goals_json = json.dumps(data.get("goals", {}))
        plan.priorities_json = json.dumps(data.get("priorities", {}))
        plan.review_json = json.dumps(data.get("review", {}))
        plan.reflection = data.get("reflection", "")
        plan.numbers_json = json.dumps(data.get("numbers", {}))
        plan.habits_json = json.dumps(data.get("habits", {}))
    else:
        plan = WeeklyPlan(
            user_id=current_user.id,
            week_key=week_key,
            goals_json=json.dumps(data.get("goals", {})),
            priorities_json=json.dumps(data.get("priorities", {})),
            review_json=json.dumps(data.get("review", {})),
            reflection=data.get("reflection", ""),
            numbers_json=json.dumps(data.get("numbers", {})),
            habits_json=json.dumps(data.get("habits", {})),
        )
        db.session.add(plan)

    db.session.commit()
    return jsonify(plan.to_dict()), 201


@planner_bp.route("/api/planner/history")
@login_required
def get_history():
    plans = WeeklyPlan.query.filter_by(
        user_id=current_user.id
    ).order_by(WeeklyPlan.week_key.desc()).limit(12).all()
    return jsonify([p.to_dict() for p in plans])
