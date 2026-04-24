from datetime import datetime, timezone

from models import db


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    team_id = db.Column(db.String(32), db.ForeignKey("teams.id"), nullable=True)
    title = db.Column(db.String(500), nullable=False)
    project = db.Column(db.String(100), default="Personal")
    label = db.Column(db.String(50), default="")
    priority = db.Column(db.Integer, default=4)  # 1=P1 (highest), 4=P4 (lowest)
    due_date = db.Column(db.String(10), default="")
    due_time = db.Column(db.String(5), default="")
    recurring = db.Column(db.String(100), default="")
    completed = db.Column(db.Boolean, default=False)
    description = db.Column(db.Text, nullable=True)
    assignee = db.Column(db.String(100), nullable=True)
    checklist = db.Column(db.Text, nullable=True) # JSON string
    is_private = db.Column(db.Boolean, default=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "team_id": self.team_id,
            "title": self.title,
            "project": self.project,
            "label": self.label,
            "priority": self.priority,
            "due_date": self.due_date,
            "due_time": self.due_time,
            "recurring": self.recurring,
            "completed": self.completed,
            "is_private": self.is_private,
            "description": self.description,
            "assignee": self.assignee,
            "checklist": self.checklist,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
