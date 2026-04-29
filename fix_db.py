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

        # List of columns to check/add
        migrations = [
            ("day_type", "VARCHAR(50) DEFAULT 'any'"),
            ("is_private", "BOOLEAN DEFAULT 1"),
            ("poms_target", "INTEGER DEFAULT 1"),
            ("poms_done", "INTEGER DEFAULT 0")
        ]
        
        # Check if the columns already exist
        cursor.execute("PRAGMA table_info(tasks)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        
        for col_name, col_type in migrations:
            if col_name not in existing_columns:
                print(f"Column '{col_name}' not found in {db_path}. Adding it now...")
                conn.execute(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
                conn.commit()
                print(f"Successfully added '{col_name}' column!")
            else:
                print(f"Column '{col_name}' already exists in {db_path}.")
            
        conn.close()
    except Exception as e:
        print(f"An error occurred with {db_path}: {e}")

print("Database check complete.")
