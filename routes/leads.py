from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db
from models.lead import Lead

leads_bp = Blueprint('leads', __name__, url_prefix='/api/leads')

@leads_bp.route('', methods=['GET'])
@login_required
def get_leads():
    # 1. Get IDs of users who shared their leads with me
    from models.invite import Invite
    shares = Invite.query.filter_by(recipient_email=current_user.email, status='accepted').all()
    shared_user_ids = [s.sender_id for s in shares if s.section in ['leads', 'all']]

    # 2. Query leads belonging to me OR shared with me
    leads = Lead.query.filter(
        (Lead.user_id == current_user.id) | 
        (Lead.user_id.in_(shared_user_ids))
    ).order_by(Lead.created_at.desc()).all()
    
    return jsonify([l.to_dict() for l in leads])

@leads_bp.route('', methods=['POST'])
@login_required
def create_lead():
    data = request.get_json()
    lead = Lead(
        user_id=current_user.id,
        team_id=data.get('team_id'),
        name=data.get('name'),
        email=data.get('email'),
        phone=data.get('phone'),
        company=data.get('company'),
        source=data.get('source', 'Direct'),
        source_link=data.get('source_link'),
        category=data.get('category'),
        status=data.get('status', 'New'),
        value=data.get('value', 0.0),
        identified_by=data.get('identified_by'),
        notes=data.get('notes')
    )
    db.session.add(lead)
    db.session.commit()
    return jsonify(lead.to_dict()), 201

@leads_bp.route('/<lead_id>', methods=['PUT'])
@login_required
def update_lead(lead_id):
    lead = Lead.query.get_or_404(lead_id)
    if lead.user_id != current_user.id and lead.team_id is None:
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.get_json()
    lead.name = data.get('name', lead.name)
    lead.email = data.get('email', lead.email)
    lead.phone = data.get('phone', lead.phone)
    lead.company = data.get('company', lead.company)
    lead.source = data.get('source', lead.source)
    lead.source_link = data.get('source_link', lead.source_link)
    lead.category = data.get('category', lead.category)
    lead.status = data.get('status', lead.status)
    lead.value = data.get('value', lead.value)
    lead.identified_by = data.get('identified_by', lead.identified_by)
    lead.notes = data.get('notes', lead.notes)
    
    db.session.commit()
    return jsonify(lead.to_dict())

@leads_bp.route('/<lead_id>', methods=['DELETE'])
@login_required
def delete_lead(lead_id):
    lead = Lead.query.get_or_404(lead_id)
    if lead.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    
    db.session.add(lead) # Just in case it's not and we want to be sure it's tracked by session
    db.session.delete(lead)
    db.session.commit()
    return jsonify({"success": True})
