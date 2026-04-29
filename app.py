"""
Productivity Hub — Unified Productivity Web Application
========================================================
A single app to manage your schedule, focus sessions, tasks,
progress tracking, and weekly planning. Built with Flask + SQLite.

Run:
    pip install -r requirements.txt
    python app.py

Then open http://localhost:5000 in your browser.
"""

import os
from flask import Flask, render_template, send_from_directory
from flask_login import LoginManager

from config import Config
from models import db
from models.user import User, Team, TeamMember
from models.schedule import ScheduleBlock
from models.schedule_mode import ScheduleMode
from models.pomodoro import PomodoroSession
from models.tracker import DailyLog, AIMLLog, KPILog
from models.planner import WeeklyPlan
from models.task import Task
from models.lead import Lead
from models.invite import Invite
from models.notification import Notification

from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.schedule import schedule_bp
from routes.pomodoro import pomodoro_bp
from routes.tracker import tracker_bp
from routes.planner import planner_bp
from routes.tasks import tasks_bp
from routes.team import team_bp
from routes.leads import leads_bp
from routes.invites import invites_bp
from routes.notifications import notifications_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Ensure the instance folder exists for the database
    os.makedirs(app.instance_path, exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    login_manager = LoginManager(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, user_id)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(pomodoro_bp)
    app.register_blueprint(tracker_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(team_bp)
    app.register_blueprint(leads_bp)
    app.register_blueprint(invites_bp)
    app.register_blueprint(notifications_bp)

    # Page routes
    @app.route("/")
    def index():
        return render_template("app.html")

    # Create tables
    with app.app_context():
        db.create_all()
        
        # Auto-migrate tasks table to add day_type if missing
        try:
            import sqlite3
            db_path = os.path.join(app.instance_path, 'database.db')
            print("Attempting to migrate DB at:", db_path)
            conn = sqlite3.connect(db_path)
            conn.execute("ALTER TABLE tasks ADD COLUMN day_type VARCHAR(50) DEFAULT 'any'")
            conn.commit()
            conn.close()
            print("Migration successful: added day_type to tasks.")
        except Exception as e:
            print("Migration skipped or failed:", e)

    return app


if __name__ == "__main__":
    app = create_app()
    host = app.config.get("HOST", "0.0.0.0")
    port = app.config.get("PORT", 5000)
    debug = app.config.get("DEBUG", False)
    
    print(f"\n  Productivity Hub running at http://{host}:{port}")
    print(f"  Debug Mode: {'Enabled' if debug else 'Disabled'}\n")
    
    app.run(host=host, port=port, debug=debug)
