from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
import uuid
from models import db
from models.invite import Invite
from models.user import User, Team, TeamMember
from models.notification import Notification

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
    
    # Notify recipient if they are already on the platform
    recipient = User.query.filter_by(email=email).first()
    if recipient:
        note = Notification(
            user_id=recipient.id,
            type="info",
            title="New Invite",
            message=f"{current_user.display_name or current_user.username} invited you to {section}."
        )
        db.session.add(note)
        
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
    
    # Notify sender that invite was accepted
    note = Notification(
        user_id=invite.sender_id,
        type="info",
        title="Invite Accepted",
        message=f"{current_user.display_name or current_user.username} accepted your invite for {invite.section}."
    )
    db.session.add(note)
    
    db.session.commit()
    return jsonify({"message": f"Access granted to {invite.section}"})

@invites_bp.route("/api/invites/<int:invite_id>/reject", methods=["PUT"])
@login_required
def reject_invite(invite_id):
    invite = Invite.query.get_or_404(invite_id)
    if invite.recipient_email != current_user.email:
        return jsonify({"error": "Unauthorized"}), 403

    invite.status = "declined"
    
    # Optionally notify sender
    note = Notification(
        user_id=invite.sender_id,
        type="info",
        title="Invite Declined",
        message=f"{current_user.display_name or current_user.username} declined your invite for {invite.section}."
    )
    db.session.add(note)
    
    db.session.commit()
    return jsonify({"message": "Invite declined"})

@invites_bp.route("/api/invites/<int:invite_id>", methods=["DELETE"])
@login_required
def delete_invite(invite_id):
    invite = Invite.query.get_or_404(invite_id)
    if invite.sender_id != current_user.id and invite.recipient_email != current_user.email:
        return jsonify({"error": "Unauthorized"}), 403
        
    db.session.delete(invite)
    db.session.commit()
    return jsonify({"message": "Invite removed"})
