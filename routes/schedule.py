from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.schedule import ScheduleBlock

schedule_bp = Blueprint("schedule", __name__)


@schedule_bp.route("/api/schedule")
@login_required
def get_schedule():
    # 1. Get IDs of users who shared their schedule with me
    from models.invite import Invite
    shares = Invite.query.filter_by(recipient_email=current_user.email, status='accepted').all()
    shared_user_ids = [s.sender_id for s in shares if s.section in ['schedule', 'all']]

    # 2. Query blocks belonging to me OR shared with me
    blocks = ScheduleBlock.query.filter(
        (ScheduleBlock.user_id == current_user.id) | 
        (ScheduleBlock.user_id.in_(shared_user_ids))
    ).order_by(ScheduleBlock.sort_order).all()
    
    return jsonify([b.to_dict() for b in blocks])


@schedule_bp.route("/api/schedule", methods=["POST"])
@login_required
def add_block():
    data = request.get_json()
    block = ScheduleBlock(
        user_id=current_user.id,
        start_time=data.get("start_time", "09:00"),
        end_time=data.get("end_time", "10:00"),
        title=data.get("title", "New Block"),
        category=data.get("category", "personal"),
        color=data.get("color", "blue"),
        description=data.get("description", ""),
        icon=data.get("icon", "📌"),
        day_type=data.get("day_type", "daily"),
        sort_order=data.get("sort_order", 99),
    )
    db.session.add(block)
    db.session.commit()
    return jsonify(block.to_dict()), 201


@schedule_bp.route("/api/schedule/<int:block_id>", methods=["PUT"])
@login_required
def update_block(block_id):
    block = ScheduleBlock.query.filter_by(
        id=block_id, user_id=current_user.id
    ).first_or_404()
    data = request.get_json()
    for key in ["start_time", "end_time", "title", "category", "color",
                "description", "icon", "day_type", "sort_order"]:
        if key in data:
            setattr(block, key, data[key])
    db.session.commit()
    return jsonify(block.to_dict())


@schedule_bp.route("/api/schedule/<int:block_id>", methods=["DELETE"])
@login_required
def delete_block(block_id):
    block = ScheduleBlock.query.filter_by(
        id=block_id, user_id=current_user.id
    ).first_or_404()
    db.session.delete(block)
    db.session.commit()
    return jsonify({"message": "Deleted"})
