from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.schedule import ScheduleBlock
from models.schedule_mode import ScheduleMode

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


@schedule_bp.route("/api/schedule/modes", methods=["GET"])
@login_required
def get_modes():
    modes = ScheduleMode.query.filter_by(user_id=current_user.id).order_by(ScheduleMode.sort_order).all()
    if not modes:
        # Provide default modes if none exist
        default_modes = [
            {"slug": "college", "label": "College", "icon": "school", "days_of_week": "1,2,3", "sort_order": 0},
            {"slug": "free", "label": "Free", "icon": "laptop_mac", "days_of_week": "4,5", "sort_order": 1},
            {"slug": "saturday", "label": "Saturday", "icon": "bolt", "days_of_week": "6", "sort_order": 2},
            {"slug": "sunday", "label": "Sunday", "icon": "battery_charging_full", "days_of_week": "0", "sort_order": 3}
        ]
        for dm in default_modes:
            mode = ScheduleMode(user_id=current_user.id, **dm)
            db.session.add(mode)
        db.session.commit()
        modes = ScheduleMode.query.filter_by(user_id=current_user.id).order_by(ScheduleMode.sort_order).all()
    
    return jsonify([m.to_dict() for m in modes])


@schedule_bp.route("/api/schedule/modes", methods=["POST"])
@login_required
def save_modes():
    data = request.get_json()
    modes_data = data.get("modes", [])
    
    # Delete existing modes
    ScheduleMode.query.filter_by(user_id=current_user.id).delete()
    
    # Add new modes
    for index, mode_dict in enumerate(modes_data):
        days = mode_dict.get("days_of_week", [])
        days_str = ",".join(str(d) for d in days)
        
        mode = ScheduleMode(
            user_id=current_user.id,
            slug=mode_dict.get("slug", f"mode_{index}"),
            label=mode_dict.get("label", f"Mode {index+1}"),
            icon=mode_dict.get("icon", "event"),
            days_of_week=days_str,
            sort_order=index
        )
        db.session.add(mode)
    
    db.session.commit()
    modes = ScheduleMode.query.filter_by(user_id=current_user.id).order_by(ScheduleMode.sort_order).all()
    return jsonify([m.to_dict() for m in modes])
