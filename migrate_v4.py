import sqlite3
import os

def migrate():
    db_path = 'database.db'
    if not os.path.exists(db_path):
        print("Database not found. Skipping migration.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Adding 'is_private' column to tasks table...")
    try:
        # Default to 1 (True) for existing tasks to keep them private
        cursor.execute("ALTER TABLE tasks ADD COLUMN is_private BOOLEAN DEFAULT 1")
        print("Column 'is_private' added successfully.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("Column 'is_private' already exists.")
        else:
            print(f"Error: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
