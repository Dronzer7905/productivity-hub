from datetime import datetime, timezone

from models import db


class DailyLog(db.Model):
    __tablename__ = "daily_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.String(10), nullable=False)  # "2026-04-16"
    dt_hours = db.Column(db.Float, default=0)
    ai_hours = db.Column(db.Float, default=0)
    pomodoros = db.Column(db.Integer, default=0)
    mood = db.Column(db.Integer, default=0)
    commits = db.Column(db.Integer, default=0)
    top_win = db.Column(db.String(500), default="")
    blocker = db.Column(db.String(500), default="")

    __table_args__ = (
        db.UniqueConstraint("user_id", "date", name="uq_user_date"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date,
            "dt_hours": self.dt_hours,
            "ai_hours": self.ai_hours,
            "pomodoros": self.pomodoros,
            "mood": self.mood,
            "commits": self.commits,
            "top_win": self.top_win,
            "blocker": self.blocker,
        }


class AIMLLog(db.Model):
    __tablename__ = "aiml_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    topic = db.Column(db.String(300), nullable=False)
    source = db.Column(db.String(300), default="")
    applied_to = db.Column(db.String(100), default="No")
    notes = db.Column(db.Text, default="")

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date,
            "topic": self.topic,
            "source": self.source,
            "applied_to": self.applied_to,
            "notes": self.notes,
        }


class KPILog(db.Model):
    __tablename__ = "kpi_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    week_date = db.Column(db.String(10), nullable=False)
    leads = db.Column(db.Integer, default=0)
    clients = db.Column(db.Integer, default=0)
    revenue = db.Column(db.Float, default=0)
    commits = db.Column(db.Integer, default=0)
    blogs = db.Column(db.Integer, default=0)
    stars = db.Column(db.Integer, default=0)
    big_win = db.Column(db.String(500), default="")
    next_goal = db.Column(db.String(500), default="")

    def to_dict(self):
        return {
            "id": self.id,
            "week_date": self.week_date,
            "leads": self.leads,
            "clients": self.clients,
            "revenue": self.revenue,
            "commits": self.commits,
            "blogs": self.blogs,
            "stars": self.stars,
            "big_win": self.big_win,
            "next_goal": self.next_goal,
        }
