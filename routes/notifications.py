from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from models import db
from models.notification import Notification

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("/api/notifications")
@login_required
def get_notifications():
    notifications = (
        Notification.query.filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(25)
        .all()
    )
    unread_count = Notification.query.filter_by(
        user_id=current_user.id, is_read=False
    ).count()
    return jsonify(
        {
            "notifications": [n.to_dict() for n in notifications],
            "unread_count": unread_count,
        }
    )


@notifications_bp.route("/api/notifications/read-all", methods=["PUT"])
@login_required
def mark_all_notifications_read():
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update(
        {"is_read": True}
    )
    db.session.commit()
    return jsonify({"message": "Notifications marked as read"})
