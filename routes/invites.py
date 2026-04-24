from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
import uuid
from models import db
from models.invite import Invite
from models.user import User, Team, TeamMember

invites_bp = Blueprint("invites", __name__)

@invites_bp.route("/api/invites")
@login_required
def get_invites():
    # Show invites sent TO this user
    received = Invite.query.filter_by(recipient_email=current_user.email).all()
    # Show invites sent BY this user
    sent = Invite.query.filter_by(sender_id=current_user.id).all()
    
    return jsonify({
        "received": [i.to_dict() for i in received],
        "sent": [i.to_dict() for i in sent]
    })

@invites_bp.route("/api/invites", methods=["POST"])
@login_required
def create_invite():
    data = request.get_json()
    email = data.get("email")
    section = data.get("section", "team-grid")
    role = data.get("role", "Member")

    if not email:
        return jsonify({"error": "Email is required"}), 400

    invite = Invite(
        sender_id=current_user.id,
        recipient_email=email,
        section=section,
        role=role,
        token=uuid.uuid4().hex
    )
    db.session.add(invite)
    db.session.commit()
    return jsonify(invite.to_dict()), 201

@invites_bp.route("/api/invites/<int:invite_id>/accept", methods=["PUT"])
@login_required
def accept_invite(invite_id):
    invite = Invite.query.get_or_404(invite_id)
    if invite.recipient_email != current_user.email:
        return jsonify({"error": "Unauthorized"}), 403

    invite.status = "accepted"
    
    # In a real team system, we'd add the user to a team here.
    # For this app, we'll just mark it as accepted.
    
    db.session.commit()
    return jsonify({"message": f"Access granted to {invite.section}"})

@invites_bp.route("/api/invites/<int:invite_id>", methods=["DELETE"])
@login_required
def delete_invite(invite_id):
    invite = Invite.query.get_or_404(invite_id)
    if invite.sender_id != current_user.id and invite.recipient_email != current_user.email:
        return jsonify({"error": "Unauthorized"}), 403
        
    db.session.delete(invite)
    db.session.commit()
    return jsonify({"message": "Invite removed"})
