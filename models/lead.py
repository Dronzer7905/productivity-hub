from datetime import datetime, timezone
import uuid
from models import db

def _uuid():
    return uuid.uuid4().hex

class Lead(db.Model):
    __tablename__ = "leads"

    id = db.Column(db.String(32), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    team_id = db.Column(db.String(32), db.ForeignKey("teams.id"), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    company = db.Column(db.String(120), nullable=True)
    source = db.Column(db.String(50), default="Direct")
    source_link = db.Column(db.String(500), nullable=True)
    category = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(50), default="New") # New, Contacted, Qualified, Proposal, Won, Lost
    value = db.Column(db.Float, default=0.0)
    identified_by = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "team_id": self.team_id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "company": self.company,
            "source": self.source,
            "source_link": self.source_link,
            "category": self.category,
            "status": self.status,
            "value": self.value,
            "identified_by": self.identified_by,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
