import os
import sys
from datetime import datetime

os.environ["FLASK_APP"] = "app.py"
from app import create_app
from models import db
from models.user import User
from models.schedule import ScheduleBlock
from models.task import Task
from models.pomodoro import PomodoroSession
from models.tracker import DailyLog

def seed_db():
    app = create_app()
    with app.app_context():
        # Get or create primary user 'ansh'
        user = User.query.filter_by(username="ansh").first()
        if not user:
            print("No user found. Creating default user 'ansh'...")
            user = User(username="ansh", email="ansh@devtailored.com", display_name="Ansh")
            user.set_password("ansh123")
            db.session.add(user)
            db.session.commit()

        print(f"Applying V3 Blueprint for user {user.username}...")

        # 1. WIPE OLD DATA
        print("Clearing old schedule blocks and tasks...")
        ScheduleBlock.query.filter_by(user_id=user.id).delete()
        Task.query.filter_by(user_id=user.id, recurring="daily").delete()
        
        # Keep non-recurring tasks if they want, but let's wipe for a clean slate
        # Uncomment to wipe all tasks: Task.query.filter_by(user_id=user.id).delete()

        # 2. SEED SCHEDULE BLOCKS
        print("Seeding College Day blocks...")
        blocks = [
            {"s": "07:15", "e": "08:50", "t": "Wake Up + Morning Routine", "c": "personal", "clr": "blue", "dsc": "Freshen up, don't miss bus."},
            {"s": "08:50", "e": "10:00", "t": "Bus to College - AI/ML", "c": "transit", "clr": "orange", "dsc": "Watch 1 lecture theory/practical on phone."},
            {"s": "10:00", "e": "16:30", "t": "College", "c": "college", "clr": "purple", "dsc": "Classes, lunch break replies to leads."},
            {"s": "16:30", "e": "17:45", "t": "Bus Home - AI/ML", "c": "transit", "clr": "orange", "dsc": "Continue lecture, plan Todoist."},
            {"s": "17:45", "e": "18:15", "t": "Home - Recharge", "c": "personal", "clr": "blue", "dsc": "Dinner, screen-free walk."},
            {"s": "18:15", "e": "19:45", "t": "Deep Work #1 - DevTailored", "c": "dt", "clr": "green", "dsc": "Heavy coding, Snapfix, SEO."},
            {"s": "19:45", "e": "20:45", "t": "AI/ML Hands-On", "c": "ai", "clr": "orange", "dsc": "Colab / Kaggle API experiment."},
            {"s": "20:45", "e": "21:15", "t": "FREE TIME", "c": "free", "clr": "yellow", "dsc": "Watch, game, relax."},
            {"s": "21:15", "e": "22:00", "t": "Shop - Light Brain Work", "c": "personal", "clr": "blue", "dsc": "Leads, founder podcasts."},
            {"s": "22:00", "e": "00:00", "t": "Night Grind - Deep Work #2", "c": "night", "clr": "red", "dsc": "Quiet heavy coding, strategy."},
            {"s": "00:00", "e": "01:00", "t": "Daily Review + Sleep", "c": "free", "clr": "yellow", "dsc": "Todoist, log hours, sleep."},
        ]

        for i, b in enumerate(blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon="⚡",
                day_type="college",
                sort_order=i
            )
            db.session.add(sb)

        print("Seeding Break Day blocks (Bonus)...")
        break_blocks = [
            {"s": "09:00", "e": "10:00", "t": "Wake Up + Breakfast", "c": "personal", "clr": "blue", "dsc": "Slow morning."},
            {"s": "10:00", "e": "13:00", "t": "Deep Work - Extended", "c": "bonus", "clr": "green", "dsc": "Huge code pushes for DevTailored."},
            {"s": "13:00", "e": "14:00", "t": "Lunch & Relax", "c": "free", "clr": "yellow", "dsc": "Break."},
            {"s": "14:00", "e": "17:00", "t": "AI/ML Deep Dive", "c": "bonus", "clr": "orange", "dsc": "Project building in AI."},
            {"s": "17:00", "e": "22:00", "t": "Shop / Personal", "c": "personal", "clr": "blue", "dsc": "Help at shop, family time."},
            {"s": "22:00", "e": "00:00", "t": "Night Grind", "c": "night", "clr": "red", "dsc": "Strategy and final codes."},
        ]
        
        for i, b in enumerate(break_blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon="🏠",
                day_type="break",
                sort_order=i
            )
            db.session.add(sb)

        # 3. SEED RECURRING TASKS
        print("Seeding recurring tasks with enhanced descriptions...")
        tasks = [
            {
                "t": "Reply DevTailored WhatsApp leads", 
                "p": 1, "r": "daily", "prj": "Leads", "asn": "Ansh Gautam",
                "dsc": "Check incoming messages from the landing page. Prioritize high-value project inquiries and move to CRM."
            },
            {
                "t": "Deep Work #1: Core Coding Sprint", 
                "p": 1, "r": "daily", "prj": "Snapfix", "asn": "Ansh Gautam",
                "dsc": "Focus on main engine logic. No distractions. Targets: Memory optimization and port check implementation."
            },
            {
                "t": "Watch 1 AI/ML Lecture (Bus/Transit)", 
                "p": 2, "r": "daily", "prj": "Learning", "asn": "Ansh Gautam",
                "dsc": "Utilize transit time for theory. Focus on Transformer architectures or LLM fine-tuning strategies."
            },
            {
                "t": "Implement 1 AI/ML mini-project / script", 
                "p": 2, "r": "daily", "prj": "AI/ML", "asn": "Sourabh",
                "dsc": "Hands-on application of learned theory. Build a small utility or experiment with a new Kaggle dataset."
            },
            {
                "t": "Update Google Sheet & Daily Review", 
                "p": 3, "r": "daily", "prj": "Admin", "asn": "Aditya",
                "dsc": "Log hours, update velocity charts, and prepare the mission list for the following day."
            },
            {
                "t": "Weekly Backup & Git Pushes", 
                "p": 2, "r": "weekly", "prj": "DevOps", "asn": "Saurav",
                "dsc": "Ensure all local branches are pushed to remote and local backups are synchronized with the cloud."
            },
        ]

        today = datetime.now().date().isoformat()
        for t in tasks:
            # Default checklist structure
            default_checklist = [
                {"label": "Initialize Protocol", "done": True},
                {"label": "Executing Parameters", "done": False},
                {"label": "Final Validation", "done": False}
            ]
            import json
            
            task = Task(
                user_id=user.id,
                title=t["t"],
                priority=t["p"],
                recurring=t["r"],
                project=t.get("prj", "Personal"),
                assignee=t.get("asn", "Ansh Gautam"),
                description=t.get("dsc", ""),
                checklist=json.dumps(default_checklist),
                due_date=today,
                completed=False
            )
            db.session.add(task)

        # 4. SEED SAMPLE INVITES
        print("Seeding sample invitations...")
        from models.invite import Invite
        import uuid
        
        inv1 = Invite(
            sender_id=user.id,
            recipient_email="colleague@devtailored.com",
            section="team-grid",
            role="Member",
            status="pending",
            token=uuid.uuid4().hex
        )
        inv2 = Invite(
            sender_id="other-user-id", # Mock sender
            recipient_email=user.email,
            section="schedule",
            role="Viewer",
            status="pending",
            token=uuid.uuid4().hex
        )
        db.session.add(inv1)
        db.session.add(inv2)

        db.session.commit()
        print("V3 Blueprint applied successfully!")

if __name__ == "__main__":
    seed_db()
