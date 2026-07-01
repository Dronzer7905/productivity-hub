from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    print(f"Migrating database at: {app.config['SQLALCHEMY_DATABASE_URI']}")
    
    commands = [
        "ALTER TABLE leads ADD COLUMN email VARCHAR(120)",
        "ALTER TABLE leads ADD COLUMN phone VARCHAR(20)",
        "ALTER TABLE leads ADD COLUMN source_link VARCHAR(500)",
        "ALTER TABLE leads ADD COLUMN category VARCHAR(100)",
        "ALTER TABLE leads ADD COLUMN identified_by VARCHAR(100)"
    ]
    
    for cmd in commands:
        try:
            db.session.execute(text(cmd))
            print(f"Successfully added column via: {cmd}")
        except Exception as e:
            # If the column already exists or another error occurs, we catch it here
            print(f"Skipped (column may already exist): {str(e).split(')')[0]})")
            
    db.session.commit()
    print("Migration complete!")
