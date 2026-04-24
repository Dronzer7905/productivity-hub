from datetime import datetime, timezone
from models import db

class Invite(db.Model):
    __tablename__ = "invites"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sender_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    recipient_email = db.Column(db.String(120), nullable=False)
    section = db.Column(db.String(50), default="team-grid") # Section to share
    role = db.Column(db.String(50), default="Member")
    status = db.Column(db.String(20), default="pending") # pending, accepted, declined
    token = db.Column(db.String(100), unique=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        from models.user import User
        sender = db.session.get(User, self.sender_id)
        return {
            "id": self.id,
            "sender_name": sender.display_name if sender else "Unknown",
            "recipient_email": self.recipient_email,
            "section": self.section,
            "role": self.role,
            "status": self.status,
            "date": self.created_at.strftime("%Y-%m-%d"),
            "token": self.token
        }
