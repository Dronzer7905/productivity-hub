import sqlite3
import os

# Possible database locations
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
db_locations = [
    os.path.join(BASE_DIR, 'instance', 'database.db'),
    os.path.join(BASE_DIR, 'database.db')
]

for db_path in db_locations:
    if not os.path.exists(db_path):
        continue
        
    print(f"Connecting to database at {db_path}...")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if tasks table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
        if not cursor.fetchone():
            print(f"Table 'tasks' not found in {db_path}. Skipping.")
            conn.close()
            continue

        # Check if the column already exists
        cursor.execute("PRAGMA table_info(tasks)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if "day_type" not in columns:
            print(f"Column 'day_type' not found in {db_path}. Adding it now...")
            conn.execute("ALTER TABLE tasks ADD COLUMN day_type VARCHAR(50) DEFAULT 'any'")
            conn.commit()
            print("Successfully added 'day_type' column!")
        else:
            print(f"Column 'day_type' already exists in {db_path}.")
            
        conn.close()
    except Exception as e:
        print(f"An error occurred with {db_path}: {e}")

print("Database check complete.")
