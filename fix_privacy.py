import sqlite3
import os

def fix_privacy():
    db_path = 'database.db'
    if not os.path.exists(db_path):
        print("Database not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Converting all existing tasks to 'Shared' (is_private = 0)...")
    try:
        # We set is_private to 0 (False) for all existing tasks so they reappear in the Team Radar
        cursor.execute("UPDATE tasks SET is_private = 0")
        print(f"Updated {cursor.rowcount} tasks.")
    except Exception as e:
        print(f"Error: {e}")

    conn.commit()
    conn.close()
    print("Repair complete. All tasks are now visible in the Team Radar.")

if __name__ == "__main__":
    fix_privacy()
