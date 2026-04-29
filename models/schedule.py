from datetime import datetime, timezone

from models import db


class ScheduleBlock(db.Model):
    __tablename__ = "schedule_blocks"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    start_time = db.Column(db.String(5), nullable=False)  # "07:15"
    end_time = db.Column(db.String(5), nullable=False)    # "08:50"
    title = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), default="personal")
    color = db.Column(db.String(20), default="blue")
    description = db.Column(db.Text, default="")
    icon = db.Column(db.String(10), default="📌")
    day_type = db.Column(db.String(20), default="daily")  # college / free / saturday / sunday / daily
    sort_order = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "title": self.title,
            "category": self.category,
            "color": self.color,
            "description": self.description,
            "icon": self.icon,
            "day_type": self.day_type,
            "sort_order": self.sort_order,
        }
