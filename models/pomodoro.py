from datetime import datetime, timezone

from models import db


class PomodoroSession(db.Model):
    __tablename__ = "pomodoro_sessions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    task_name = db.Column(db.String(300), default="Deep work session")
    mode = db.Column(db.String(10), default="work")  # work / short / long
    duration = db.Column(db.Integer, default=25)  # minutes
    completed_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "task_name": self.task_name,
            "mode": self.mode,
            "duration": self.duration,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
