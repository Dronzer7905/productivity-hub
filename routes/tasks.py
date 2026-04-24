from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timezone

from models import db
from models.notification import Notification
from models.task import Task
from models.user import User

tasks_bp = Blueprint("tasks", __name__)


def _normalize_assignee(value):
    return (value or "").strip().lower()


def _resolve_user_from_assignee(assignee):
    assignee_key = _normalize_assignee(assignee)
    if not assignee_key:
        return None

    return User.query.filter(
        (User.username.ilike(assignee_key))
        | (User.email.ilike(assignee_key))
        | (User.display_name.ilike(assignee_key))
    ).first()


def _create_assignment_notification(task, assignee, actor_name):
    recipient = _resolve_user_from_assignee(assignee)
    if not recipient:
        return

    note = Notification(
        user_id=recipient.id,
        type="task_assignment",
        title="Task assigned to you",
        message=f"{actor_name} assigned \"{task.title}\" to you.",
        data_json=str(task.id),
    )
    db.session.add(note)


@tasks_bp.route("/api/tasks")
@login_required
def get_tasks():
    # 1. Get user's explicit team IDs
    from models.user import TeamMember
    user_team_ids = [m.team_id for m in current_user.team_memberships]
    
    # 2. Get IDs of users who have shared their 'team-grid' or 'all' with this user
    from models.invite import Invite
    shares = Invite.query.filter_by(recipient_email=current_user.email, status='accepted').all()
    shared_user_ids = [s.sender_id for s in shares if s.section in ['team-grid', 'all']]

    # 3. Build Query
    # Base: my tasks + shared with me
    q_filter = (Task.user_id == current_user.id) | (Task.team_id.in_(user_team_ids)) | (Task.user_id.in_(shared_user_ids))
    
    show = request.args.get("show", "active")  # active / completed / all
    
    # Special case: Team Radar (show=all) should NOT show current user's PRIVATE tasks
    if show == "all":
        # Show: (My Public Tasks) OR (Tasks from Others)
        q = Task.query.filter(
            ((Task.user_id == current_user.id) & (Task.is_private == False)) | 
            (Task.user_id != current_user.id)
        ).filter(q_filter)
    elif show == "hub":
        # Task Hub: Show EVERYTHING belonging to me + anything explicitly assigned to me
        q = Task.query.filter(q_filter)
    else:
        # Priority Hub: Show ALL my tasks
        q = Task.query.filter(q_filter)
        if show == "active":
            q = q.filter_by(completed=False)
        elif show == "completed":
            q = q.filter_by(completed=True)
            
    tasks = q.order_by(Task.priority, Task.due_date, Task.created_at.desc()).all()
    return jsonify([t.to_dict() for t in tasks])


@tasks_bp.route("/api/tasks", methods=["POST"])
@login_required
def add_task():
    data = request.get_json()
    if not data.get("title"):
        return jsonify({"error": "Title is required"}), 400

    task = Task(
        user_id=current_user.id,
        team_id=data.get("team_id"),
        title=data["title"],
        project=data.get("project", "Personal"),
        label=data.get("label", ""),
        priority=data.get("priority", 4),
        due_date=data.get("due_date", ""),
        due_time=data.get("due_time", ""),
        recurring=data.get("recurring", ""),
        description=data.get("description", ""),
        assignee=data.get("assignee", ""),
        checklist=data.get("checklist", ""),
    )
    db.session.add(task)
    db.session.flush()
    _create_assignment_notification(
        task, task.assignee, current_user.display_name or current_user.username
    )
    db.session.commit()
    return jsonify(task.to_dict()), 201


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PUT"])
@login_required
def update_task(task_id):
    from models.user import TeamMember
    user_team_ids = [m.team_id for m in current_user.team_memberships]
    
    task = Task.query.filter(
        (Task.id == task_id) & 
        ((Task.user_id == current_user.id) | (Task.team_id.in_(user_team_ids)))
    ).first_or_404()
    data = request.get_json()
    previous_assignee = task.assignee

    for key in ["title", "project", "label", "priority", "due_date",
                "due_time", "recurring", "description", "assignee", "checklist", "is_private"]:
        if key in data:
            setattr(task, key, data[key])

    if "completed" in data:
        task.completed = data["completed"]
        task.completed_at = datetime.now(timezone.utc) if data["completed"] else None

    if "assignee" in data and _normalize_assignee(data["assignee"]) != _normalize_assignee(previous_assignee):
        _create_assignment_notification(
            task, data["assignee"], current_user.display_name or current_user.username
        )

    db.session.commit()
    return jsonify(task.to_dict())


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@login_required
def delete_task(task_id):
    from models.user import TeamMember
    user_team_ids = [m.team_id for m in current_user.team_memberships]
    
    task = Task.query.filter(
        (Task.id == task_id) & 
        ((Task.user_id == current_user.id) | (Task.team_id.in_(user_team_ids)))
    ).first_or_404()
    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@tasks_bp.route("/api/tasks/projects")
@login_required
def get_projects():
    """Get unique project names for the current user."""
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    projects = list(set(t.project for t in tasks if t.project))
    if not projects:
        projects = ["Personal", "Work", "Learning"]
    return jsonify(sorted(projects))
