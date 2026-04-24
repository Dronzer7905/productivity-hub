import json
from datetime import datetime, timezone

from models import db


class WeeklyPlan(db.Model):
    __tablename__ = "weekly_plans"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    week_key = db.Column(db.String(10), nullable=False)  # "2026-04-14" (Monday)
    goals_json = db.Column(db.Text, default="{}")
    priorities_json = db.Column(db.Text, default="{}")
    review_json = db.Column(db.Text, default="{}")
    reflection = db.Column(db.Text, default="")
    numbers_json = db.Column(db.Text, default="{}")
    habits_json = db.Column(db.Text, default="{}")

    __table_args__ = (
        db.UniqueConstraint("user_id", "week_key", name="uq_user_week"),
    )

    def _load_json(self, field):
        try:
            return json.loads(field) if field else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def to_dict(self):
        return {
            "id": self.id,
            "week_key": self.week_key,
            "goals": self._load_json(self.goals_json),
            "priorities": self._load_json(self.priorities_json),
            "review": self._load_json(self.review_json),
            "reflection": self.reflection,
            "numbers": self._load_json(self.numbers_json),
            "habits": self._load_json(self.habits_json),
        }
