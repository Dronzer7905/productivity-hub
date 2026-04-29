from models import db

class ScheduleMode(db.Model):
    __tablename__ = "schedule_modes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False)
    slug = db.Column(db.String(20), nullable=False) # e.g., 'college', 'free'
    label = db.Column(db.String(50), nullable=False) # e.g., 'College Day'
    icon = db.Column(db.String(30), default="event")
    days_of_week = db.Column(db.String(50), default="") # Comma-separated like "1,2,3" for Mon,Tue,Wed
    sort_order = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "slug": self.slug,
            "label": self.label,
            "icon": self.icon,
            "days_of_week": [int(d) for d in self.days_of_week.split(",") if d.strip().isdigit()],
            "sort_order": self.sort_order
        }
