from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user

from models import db
from models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    display_name = data.get("display_name") or username

    if not username or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(username=username, email=email, display_name=display_name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Seed default schedule for new users
    # _seed_default_schedule(user.id)

    login_user(user, remember=True)
    return jsonify({"user": user.to_dict()}), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    identifier = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()

    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user, remember=True)
    return jsonify({"user": user.to_dict()})


@auth_bp.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out"})


@auth_bp.route("/api/auth/me")
def me():
    if current_user.is_authenticated:
        return jsonify({"user": current_user.to_dict()})
    return jsonify({"user": None}), 401


@auth_bp.route("/api/auth/profile", methods=["PUT"])
@login_required
def update_profile():
    data = request.get_json()
    if data.get("display_name"):
        current_user.display_name = data["display_name"]
    if data.get("avatar_color"):
        current_user.avatar_color = data["avatar_color"]
    if data.get("timezone"):
        current_user.timezone = data["timezone"]
    db.session.commit()
    return jsonify({"user": current_user.to_dict()})


def _seed_default_schedule(user_id):
    """Create a default schedule for new users based on the original system."""
    from models.schedule import ScheduleBlock

    defaults = [
        ("07:15", "08:50", "🌅 Wake Up + Morning Routine", "personal", "blue", "Freshen up, breakfast, get ready", 0),
        ("08:50", "10:00", "🚌 Commute — Learning Time", "learning", "orange", "Watch lectures, podcasts, audiobooks", 1),
        ("10:00", "16:30", "🎓 Work / College", "work", "purple", "Classes, meetings, primary work", 2),
        ("16:30", "17:45", "🚌 Commute Home — Learning", "learning", "orange", "Continue learning, plan evening", 3),
        ("17:45", "18:15", "🍽️ Recharge Break", "personal", "blue", "Eat, freshen up, short walk", 4),
        ("18:15", "19:45", "🔥 Deep Work #1", "deepwork", "green", "Primary project — focused coding session", 5),
        ("19:45", "20:45", "⚡ Skill Practice", "learning", "orange", "Hands-on practice, experiments", 6),
        ("20:45", "21:15", "🎮 FREE TIME", "free", "yellow", "Your personal time — guilt free", 7),
        ("21:15", "22:00", "🏪 Light Tasks", "personal", "blue", "Errands, replies, light admin", 8),
        ("22:00", "00:00", "🌙 Night Grind — Deep Work #2", "deepwork", "red", "Heavy coding, strategy, study", 9),
        ("00:00", "01:00", "📊 Daily Review + Sleep", "personal", "yellow", "Review day, log progress, sleep", 10),
    ]

    for start, end, title, cat, color, desc, order in defaults:
        block = ScheduleBlock(
            user_id=user_id,
            start_time=start,
            end_time=end,
            title=title,
            category=cat,
            color=color,
            description=desc,
            sort_order=order,
        )
        db.session.add(block)
    db.session.commit()
