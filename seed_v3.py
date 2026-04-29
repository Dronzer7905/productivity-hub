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
        print(f"Using database: {app.config['SQLALCHEMY_DATABASE_URI']}")
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

        # ═══════════════════════════════════════════════════════
        # 2. SEED SCHEDULE BLOCKS — Based on ansh_clean_schedule_v2
        # Weekly structure: Mon-Wed=College, Thu-Fri=Free, Sat=Weekend, Sun=Rest
        # ═══════════════════════════════════════════════════════

        # ─── COLLEGE DAY (Mon, Tue, Wed) ─────────────────────
        # Stats: 2h Learning · 1.5h DevTailored · 1.5h Shop · 1.5h Free · 6.5h Sleep
        print("Seeding College Day blocks (Mon-Wed)...")
        college_blocks = [
            # Morning
            {"s": "06:00", "e": "07:00", "t": "Exercise", "c": "personal", "clr": "#8b7fff", "dsc": "Walk, gym, or home workout. Non-negotiable — sets energy for the day.", "icon": "🏃"},
            {"s": "07:00", "e": "08:30", "t": "Fresh up + Breakfast", "c": "personal", "clr": "#8b7fff", "dsc": "Shower, get ready, eat properly. Pack bag. Leave home by 8:30.", "icon": "🍳"},
            # Commute to college
            {"s": "08:30", "e": "09:00", "t": "Bus stop wait → Anki cards", "c": "learning", "clr": "#4d96ff", "dsc": "Review 20-30 Anki flashcards on phone. Spaced repetition — 30 min adds up over a week.", "icon": "📚"},
            {"s": "09:00", "e": "10:00", "t": "Bus ride → Watch / Read", "c": "learning", "clr": "#4d96ff", "dsc": "StatQuest video, Kaggle Learn lesson, or FastAPI docs on phone. Download content night before for offline.", "icon": "📖"},
            # College
            {"s": "10:00", "e": "13:00", "t": "Morning lectures", "c": "college", "clr": "#8b7fff", "dsc": "Free periods: LeetCode Easy on phone or re-read notes.", "icon": "🎓"},
            {"s": "13:00", "e": "14:00", "t": "Lunch break → DevTailored outreach", "c": "dt", "clr": "#00e5a0", "dsc": "Client follow-ups, Instagram DMs, WhatsApp outreach, lead responses. Use college WiFi.", "icon": "📱"},
            {"s": "14:00", "e": "16:30", "t": "Afternoon lectures", "c": "college", "clr": "#8b7fff", "dsc": "Free periods: Anki review or LeetCode Easy.", "icon": "🎓"},
            # Commute home
            {"s": "16:50", "e": "17:50", "t": "Bus ride home → Passive review", "c": "learning", "clr": "#4d96ff", "dsc": "Re-watch morning's video or skim notes. Brain is tired — passive only, no problem solving.", "icon": "📖"},
            # Evening — main work blocks
            {"s": "17:50", "e": "18:15", "t": "Home — freshen up + eat", "c": "personal", "clr": "#8b7fff", "dsc": "Snack or light meal. 20 min rest. No screens.", "icon": "🏠"},
            {"s": "18:15", "e": "19:15", "t": "DevTailored — coding block", "c": "dt", "clr": "#00e5a0", "dsc": "Feature development, bug fixes, Vidya Tools, Online Dukan. 1 focused hour. No context switching.", "icon": "💻"},
            {"s": "19:15", "e": "19:30", "t": "Break", "c": "personal", "clr": "#8b7fff", "dsc": "Walk around, water, eyes off screen.", "icon": "☕"},
            {"s": "19:30", "e": "20:30", "t": "DevTailored — social media block", "c": "dt", "clr": "#00e5a0", "dsc": "Instagram posts, carousels, LinkedIn content, scheduling. Sourabh/Saurav coordination if needed.", "icon": "📲"},
            {"s": "20:30", "e": "21:00", "t": "Free time", "c": "free", "clr": "#ffd166", "dsc": "Family, relax, scroll. Real downtime before shop.", "icon": "🎮"},
            # Shop + night
            {"s": "21:00", "e": "22:30", "t": "Shop duty", "c": "shop", "clr": "#ff9f4a", "dsc": "If quiet: Anki on phone. Shop comes first always.", "icon": "🏪"},
            {"s": "22:30", "e": "23:00", "t": "Learning — concept block", "c": "learning", "clr": "#4d96ff", "dsc": "Watch 1 video or read 1 docs section for tomorrow's topic. Prep tomorrow's bus content (download offline).", "icon": "🧠"},
            {"s": "23:00", "e": "23:30", "t": "Plan tomorrow + wind down", "c": "personal", "clr": "#8b7fff", "dsc": "Todoist: set 3 tasks for tomorrow. Add new Anki cards. Git commit if any code done.", "icon": "📝"},
            {"s": "23:30", "e": "06:00", "t": "Sleep — 6.5 hrs", "c": "sleep", "clr": "#6c757d", "dsc": "Minimum 6 hrs on college days. No phone after lights out.", "icon": "😴"},
        ]

        for i, b in enumerate(college_blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon=b.get("icon", "⚡"),
                day_type="college",
                sort_order=i
            )
            db.session.add(sb)

        # ─── FREE DAY (Thu & Fri) ────────────────────────────
        # Stats: 4.5h Learning · 3h DevTailored · 1.5h Shop · 2h Free · 7h Sleep
        print("Seeding Free Day blocks (Thu-Fri)...")
        free_blocks = [
            # Morning
            {"s": "06:30", "e": "07:30", "t": "Exercise", "c": "personal", "clr": "#8b7fff", "dsc": "Full workout — more time than college days. Walk, gym, or yoga.", "icon": "🏃"},
            {"s": "07:30", "e": "08:30", "t": "Fresh up + Breakfast", "c": "personal", "clr": "#8b7fff", "dsc": "Proper breakfast. Slow morning. No rushing.", "icon": "🍳"},
            # Morning — deep learning block
            {"s": "08:30", "e": "09:30", "t": "Learning — concept block", "c": "learning", "clr": "#4d96ff", "dsc": "1 focused topic: StatQuest video, CS50P lecture, Kaggle Learn lesson, or FastAPI docs. Watch/read only — no coding yet.", "icon": "📚"},
            {"s": "09:30", "e": "11:30", "t": "Learning — coding / build block", "c": "learning", "clr": "#4d96ff", "dsc": "Apply what you just learned. Project feature, Kaggle notebook, or LeetCode problems. Pomodoro 25/5. Phone in another room. This is the most important block of your week.", "icon": "💻"},
            {"s": "11:30", "e": "12:00", "t": "Break + snack", "c": "personal", "clr": "#8b7fff", "dsc": "Walk outside if possible. Eyes off screen. Brain reset.", "icon": "☕"},
            # Midday — DevTailored
            {"s": "12:00", "e": "13:00", "t": "DevTailored — client outreach", "c": "dt", "clr": "#00e5a0", "dsc": "Cold DMs, WhatsApp follow-ups, lead generation, proposal sends. Pure outreach — no coding.", "icon": "📱"},
            {"s": "13:00", "e": "14:00", "t": "Lunch + rest", "c": "personal", "clr": "#8b7fff", "dsc": "Proper meal. 20-30 min nap optional — genuinely improves afternoon focus.", "icon": "🍽️"},
            {"s": "14:00", "e": "15:30", "t": "DevTailored — coding block", "c": "dt", "clr": "#00e5a0", "dsc": "Feature development: Vidya Tools, Online Dukan, MVP Lab, or client project. 1.5 hrs deep work. No social media during this block.", "icon": "💻"},
            {"s": "15:30", "e": "16:00", "t": "DevTailored — social media", "c": "dt", "clr": "#00e5a0", "dsc": "Instagram carousels, LinkedIn posts, stories, scheduling content. Coordinate with Saurav.", "icon": "📲"},
            # Afternoon — learning block 2
            {"s": "16:00", "e": "16:15", "t": "Break", "c": "personal", "clr": "#8b7fff", "dsc": "Short break between DevTailored and learning.", "icon": "☕"},
            {"s": "16:15", "e": "17:45", "t": "Learning — build / practice", "c": "learning", "clr": "#4d96ff", "dsc": "Continue project, Kaggle notebook, or DSA practice (Neetcode). Write Notion log: 3 bullets — learned, broke, next. Git commit.", "icon": "🧪"},
            {"s": "17:45", "e": "19:00", "t": "Free time", "c": "free", "clr": "#ffd166", "dsc": "Friends, family, cricket, YouTube. Real free time — no guilt.", "icon": "🎮"},
            # Evening
            {"s": "19:00", "e": "20:00", "t": "Dinner + family time", "c": "personal", "clr": "#8b7fff", "dsc": "Eat well. Off screens. Family conversations.", "icon": "🍽️"},
            {"s": "20:00", "e": "21:00", "t": "Learning — review + Anki", "c": "learning", "clr": "#4d96ff", "dsc": "Review today's learning. Add 10 Anki cards. Read one article or rewatch a short clip. Light, no heavy coding.", "icon": "📚"},
            # Shop + night
            {"s": "21:00", "e": "22:30", "t": "Shop duty", "c": "shop", "clr": "#ff9f4a", "dsc": "If quiet: Anki review on phone.", "icon": "🏪"},
            {"s": "22:30", "e": "00:00", "t": "Learning — night concept block", "c": "learning", "clr": "#4d96ff", "dsc": "Watch next topic's video, read docs for tomorrow, or do 1-2 LeetCode problems. Bonus time — use it but don't force if tired.", "icon": "🧠"},
            {"s": "00:00", "e": "00:30", "t": "Plan tomorrow + wind down", "c": "personal", "clr": "#8b7fff", "dsc": "Todoist tasks set. Anki cards synced. Git commit. Lights off.", "icon": "📝"},
            {"s": "00:30", "e": "06:30", "t": "Sleep — 6-7 hrs", "c": "sleep", "clr": "#6c757d", "dsc": "Free days allow slightly more sleep. Use it.", "icon": "😴"},
        ]

        for i, b in enumerate(free_blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon=b.get("icon", "⚡"),
                day_type="free",
                sort_order=i
            )
            db.session.add(sb)

        # ─── SATURDAY ────────────────────────────────────────
        # Stats: 3.5h Learning · 2h DevTailored · 1.5h Shop · 3h Free · 7.5h Sleep
        print("Seeding Saturday blocks...")
        saturday_blocks = [
            # Morning
            {"s": "07:00", "e": "08:00", "t": "Exercise + fresh up", "c": "personal", "clr": "#8b7fff", "dsc": "Full morning routine. Breakfast included.", "icon": "🏃"},
            {"s": "08:00", "e": "10:30", "t": "Learning — biggest block of the week", "c": "learning", "clr": "#4d96ff", "dsc": "2.5 hrs unbroken. Tackle the hardest concept or biggest project chunk of the week. Pomodoro 25/5. Saturday morning is your superpower.", "icon": "🚀"},
            {"s": "10:30", "e": "11:00", "t": "Break + snack", "c": "personal", "clr": "#8b7fff", "dsc": "Walk outside. Brain reset.", "icon": "☕"},
            # Midday — DevTailored weekly block
            {"s": "11:00", "e": "12:00", "t": "DevTailored — weekly review + planning", "c": "dt", "clr": "#00e5a0", "dsc": "Review all open client leads, pending tasks, next week's content plan. Assign tasks to Aditya, Sourabh, Saurav in Notion.", "icon": "📋"},
            {"s": "12:00", "e": "13:00", "t": "DevTailored — coding or outreach", "c": "dt", "clr": "#00e5a0", "dsc": "Pick whichever is most urgent: feature dev or client outreach push.", "icon": "💻"},
            {"s": "13:00", "e": "14:00", "t": "Lunch + rest", "c": "personal", "clr": "#8b7fff", "dsc": "Proper meal. Rest well.", "icon": "🍽️"},
            # Afternoon — learning + free
            {"s": "14:00", "e": "15:00", "t": "Learning — weekly review", "c": "learning", "clr": "#4d96ff", "dsc": "Review the whole week: what phase are you in, what's done, what's behind? Catch up on any missed task. Kaggle or project work.", "icon": "📊"},
            {"s": "15:00", "e": "18:00", "t": "Free time — full rest", "c": "free", "clr": "#ffd166", "dsc": "Go out, friends, cricket, movies. Real weekend. You earned it.", "icon": "🎮"},
            {"s": "18:00", "e": "19:30", "t": "Dinner + family time", "c": "personal", "clr": "#8b7fff", "dsc": "Off screens. Relax.", "icon": "🍽️"},
            # Evening
            {"s": "19:30", "e": "20:30", "t": "Learning — Anki + light review", "c": "learning", "clr": "#4d96ff", "dsc": "Review all this week's Anki cards. No heavy coding — light reading or 1 short video only.", "icon": "📚"},
            {"s": "20:30", "e": "21:00", "t": "Free time", "c": "free", "clr": "#ffd166", "dsc": "Relax before shop.", "icon": "🎮"},
            # Shop + night
            {"s": "21:00", "e": "22:30", "t": "Shop duty", "c": "shop", "clr": "#ff9f4a", "dsc": "Light Anki or reading if quiet.", "icon": "🏪"},
            {"s": "22:30", "e": "23:30", "t": "Plan next week", "c": "personal", "clr": "#8b7fff", "dsc": "Set 3 learning goals for next week in Todoist. Which phase? What's the project milestone? Download content for Monday's bus.", "icon": "📝"},
            {"s": "23:30", "e": "07:00", "t": "Sleep — 7.5 hrs", "c": "sleep", "clr": "#6c757d", "dsc": "Best sleep of the week. Brain consolidates everything learned.", "icon": "😴"},
        ]

        for i, b in enumerate(saturday_blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon=b.get("icon", "⚡"),
                day_type="saturday",
                sort_order=i
            )
            db.session.add(sb)

        # ─── SUNDAY ──────────────────────────────────────────
        # Stats: 1.5h Learning · 0h DevTailored · 1.5h Shop · 5h Free · 8h Sleep
        print("Seeding Sunday blocks...")
        sunday_blocks = [
            # Morning — slow start
            {"s": "07:30", "e": "08:30", "t": "Wake up — no alarm", "c": "personal", "clr": "#8b7fff", "dsc": "Let body rest. Slow breakfast. No phone for 30 min after waking.", "icon": "☀️"},
            {"s": "08:30", "e": "09:30", "t": "Exercise (light)", "c": "personal", "clr": "#8b7fff", "dsc": "Walk, stretching, or light yoga only. No intense workout — rest day.", "icon": "🧘"},
            # Midday — free day
            {"s": "09:30", "e": "14:00", "t": "Full free time", "c": "free", "clr": "#ffd166", "dsc": "Family, outing, rest, friends. Sunday is your real off day. No DevTailored. No coding pressure.", "icon": "🎮"},
            {"s": "14:00", "e": "15:00", "t": "Lunch + nap", "c": "personal", "clr": "#8b7fff", "dsc": "Big Sunday lunch. Nap — you've earned it.", "icon": "🍽️"},
            # Afternoon — teach-back + prep
            {"s": "15:00", "e": "16:00", "t": "Learning — teach-back session", "c": "learning", "clr": "#4d96ff", "dsc": "Pick 1 concept from this week. Explain it out loud — voice note or write in Notion. If you can't explain it, you don't know it. Highest ROI learning activity.", "icon": "🎤"},
            {"s": "16:00", "e": "17:30", "t": "Free time", "c": "free", "clr": "#ffd166", "dsc": "YouTube, walk, cricket, family.", "icon": "🎮"},
            {"s": "17:30", "e": "19:00", "t": "Week prep — Anki + Todoist", "c": "learning", "clr": "#4d96ff", "dsc": "Review all Anki cards from the week. Set Mon-Sun tasks in Todoist. Download Monday's bus content offline. Prep college bag. This 90 min sets your entire next week.", "icon": "📋"},
            # Evening
            {"s": "19:00", "e": "21:00", "t": "Dinner + family time", "c": "personal", "clr": "#8b7fff", "dsc": "Early dinner. Off screens. Relaxed evening.", "icon": "🍽️"},
            # Shop + night
            {"s": "21:00", "e": "22:30", "t": "Shop duty", "c": "shop", "clr": "#ff9f4a", "dsc": "Complete rest — no Anki, no phone learning. Just be present.", "icon": "🏪"},
            {"s": "22:30", "e": "23:30", "t": "Wind down", "c": "personal", "clr": "#8b7fff", "dsc": "No screens after 11pm. Lights off by 11:30 — college at 8:30am tomorrow.", "icon": "🌙"},
            {"s": "23:30", "e": "07:30", "t": "Sleep — 8 hrs", "c": "sleep", "clr": "#6c757d", "dsc": "Best sleep night of the week. Full recovery before the college week starts.", "icon": "😴"},
        ]

        for i, b in enumerate(sunday_blocks):
            sb = ScheduleBlock(
                user_id=user.id,
                start_time=b["s"],
                end_time=b["e"],
                title=b["t"],
                category=b["c"],
                color=b["clr"],
                description=b["dsc"],
                icon=b.get("icon", "⚡"),
                day_type="sunday",
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
                "t": "Anki flashcard review (20-30 cards)", 
                "p": 2, "r": "daily", "prj": "Learning", "asn": "Ansh Gautam",
                "dsc": "Spaced repetition review. Do during commute, shop quiet time, or before bed. Consistency over volume."
            },
            {
                "t": "Watch 1 learning video / read 1 docs section", 
                "p": 2, "r": "daily", "prj": "Learning", "asn": "Ansh Gautam",
                "dsc": "StatQuest, CS50P, Kaggle Learn, or FastAPI docs. Download offline for bus. Focus on understanding, not speed."
            },
            {
                "t": "LeetCode Easy or DSA practice", 
                "p": 3, "r": "daily", "prj": "Learning", "asn": "Ansh Gautam",
                "dsc": "At least 1 problem during free periods at college or evening. Use Neetcode roadmap for structure."
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
            {
                "t": "DevTailored social media content", 
                "p": 2, "r": "daily", "prj": "DevTailored", "asn": "Ansh Gautam",
                "dsc": "Instagram carousels, LinkedIn posts, stories. Coordinate with Sourabh/Saurav. Schedule content in advance."
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
        print("─" * 50)
        print("Schedule modes available:")
        print("  🎓 College Day (Mon-Wed)")
        print("  💻 Free Day (Thu-Fri)")  
        print("  ⚡ Saturday")
        print("  🔋 Sunday")
        print("─" * 50)

if __name__ == "__main__":
    seed_db()
