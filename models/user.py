import uuid
from datetime import datetime, timezone

import bcrypt
from flask_login import UserMixin

from models import db


def _uuid():
    return uuid.uuid4().hex


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(32), primary_key=True, default=_uuid)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(120), default="")
    avatar_color = db.Column(db.String(7), default="#7c6aff")
    timezone = db.Column(db.String(50), default="Asia/Kolkata")
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    team_memberships = db.relationship("TeamMember", backref="user", lazy=True)
    schedule_blocks = db.relationship("ScheduleBlock", backref="user", lazy=True)
    pomodoro_sessions = db.relationship("PomodoroSession", backref="user", lazy=True)
    daily_logs = db.relationship("DailyLog", backref="user", lazy=True)
    aiml_logs = db.relationship("AIMLLog", backref="user", lazy=True)
    weekly_plans = db.relationship("WeeklyPlan", backref="user", lazy=True)
    kpi_logs = db.relationship("KPILog", backref="user", lazy=True)
    tasks = db.relationship("Task", backref="user", lazy=True)

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    def check_password(self, password):
        return bcrypt.checkpw(
            password.encode("utf-8"), self.password_hash.encode("utf-8")
        )

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name or self.username,
            "avatar_color": self.avatar_color,
            "timezone": self.timezone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Team(db.Model):
    __tablename__ = "teams"

    id = db.Column(db.String(32), primary_key=True, default=_uuid)
    name = db.Column(db.String(120), nullable=False)
    invite_code = db.Column(db.String(12), unique=True, nullable=False)
    created_by = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    members = db.relationship("TeamMember", backref="team", lazy=True)
    creator = db.relationship("User", backref="created_teams", foreign_keys=[created_by])

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "invite_code": self.invite_code,
            "created_by": self.created_by,
            "member_count": len(self.members),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TeamMember(db.Model):
    __tablename__ = "team_members"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.String(32), db.ForeignKey("teams.id"), nullable=False)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(20), default="member")  # admin / member
    joined_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )
