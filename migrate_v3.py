import sqlite3
import os

db_path = 'database.db'

def migrate():
    if not os.path.exists(db_path):
        print("Database not found. Please run the app first to create it.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Checking for schema updates...")

    # 1. Update Tasks table
    # We add columns one by one. SQLite doesn't support adding multiple columns in one ALTER TABLE.
    columns_to_add = [
        ('description', 'TEXT'),
        ('assignee', 'TEXT'),
        ('checklist', 'TEXT')
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
            print(f"Added column '{col_name}' to 'tasks' table.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column '{col_name}' already exists.")
            else:
                print(f"Error adding column '{col_name}': {e}")

    # 2. Create Invites table if it doesn't exist
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL,
                recipient_email TEXT NOT NULL,
                section TEXT DEFAULT 'team-grid',
                role TEXT DEFAULT 'Member',
                status TEXT DEFAULT 'pending',
                token TEXT UNIQUE,
                created_at DATETIME,
                FOREIGN KEY(sender_id) REFERENCES users(id)
            )
        ''')
        print("Ensured 'invites' table exists.")
    except Exception as e:
        print(f"Error creating invites table: {e}")

    conn.commit()
    conn.close()
    print("\n✅ Migration complete! Your data is preserved and the new features are enabled.")

if __name__ == "__main__":
    migrate()
