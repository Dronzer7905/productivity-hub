import sqlite3
import os

db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'database.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

print(f"Connecting to database at {db_path}...")
try:
    conn = sqlite3.connect(db_path)
    # Check if the column already exists
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(tasks)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "day_type" not in columns:
        print("Column 'day_type' not found. Adding it now...")
        conn.execute("ALTER TABLE tasks ADD COLUMN day_type VARCHAR(50) DEFAULT 'any'")
        conn.commit()
        print("Successfully added 'day_type' column to the 'tasks' table!")
    else:
        print("Column 'day_type' already exists in the 'tasks' table.")
        
    conn.close()
except Exception as e:
    print(f"An error occurred: {e}")
