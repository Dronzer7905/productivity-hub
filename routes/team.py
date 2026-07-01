import uuid
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.user import Team, TeamMember, User
from models.invite import Invite

team_bp = Blueprint("team", __name__)


def _gen_invite_code():
    return uuid.uuid4().hex[:8].upper()


@team_bp.route("/api/teams")
@login_required
def get_teams():
    memberships = TeamMember.query.filter_by(user_id=current_user.id).all()
    teams = []
    for m in memberships:
        t = m.team
        teams.append({
            **t.to_dict(),
            "role": m.role,
            "members": [
                {
                    "user_id": mem.user_id,
                    "display_name": mem.user.display_name or mem.user.username,
                    "avatar_color": mem.user.avatar_color,
                    "role": mem.role,
                }
                for mem in t.members
            ],
        })
    return jsonify(teams)


@team_bp.route("/api/teams", methods=["POST"])
@login_required
def create_team():
    data = request.get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Team name is required"}), 400

    team = Team(
        name=name,
        invite_code=_gen_invite_code(),
        created_by=current_user.id,
    )
    db.session.add(team)
    db.session.flush()

    membership = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role="admin",
    )
    db.session.add(membership)
    db.session.commit()

    return jsonify(team.to_dict()), 201


@team_bp.route("/api/teams/join", methods=["POST"])
@login_required
def join_team():
    data = request.get_json()
    code = (data.get("invite_code") or "").strip().upper()
    if not code:
        return jsonify({"error": "Invite code is required"}), 400

    team = Team.query.filter_by(invite_code=code).first()
    if not team:
        return jsonify({"error": "Invalid invite code"}), 404

    existing = TeamMember.query.filter_by(
        team_id=team.id, user_id=current_user.id
    ).first()
    if existing:
        return jsonify({"error": "Already a member"}), 409

    membership = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role="member",
    )
    db.session.add(membership)
    db.session.commit()
    return jsonify(team.to_dict()), 200


@team_bp.route("/api/teams/<team_id>/leave", methods=["POST"])
@login_required
def leave_team(team_id):
    membership = TeamMember.query.filter_by(
        team_id=team_id, user_id=current_user.id
    ).first_or_404()
    db.session.delete(membership)
    db.session.commit()
    return jsonify({"message": "Left team"})

@team_bp.route("/api/teams/collaborators", methods=["GET"])
@login_required
def get_collaborators():
    # Collect unique names of collaborators
    collaborators = set()
    
    # Add myself
    collaborators.add(current_user.display_name or current_user.username)
    
    # Add teammates
    memberships = TeamMember.query.filter_by(user_id=current_user.id).all()
    for m in memberships:
        for team_member in m.team.members:
            u = team_member.user
            collaborators.add(u.display_name or u.username)
            
    # Add users who invited me and I accepted
    shares = Invite.query.filter_by(recipient_email=current_user.email, status='accepted').all()
    for s in shares:
        u = User.query.get(s.sender_id)
        if u:
            collaborators.add(u.display_name or u.username)
            
    # Add users I invited and they accepted
    sent_shares = Invite.query.filter_by(sender_id=current_user.id, status='accepted').all()
    for s in sent_shares:
        u = User.query.filter_by(email=s.recipient_email).first()
        if u:
            collaborators.add(u.display_name or u.username)

    return jsonify(sorted(list(collaborators)))
