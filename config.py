import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

class Config:
    # ── SECURITY ──────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-key-for-local-testing-only")
    
    # ── DATABASE ──────────────────────────────────────────
    # Handle SQLAlchemy URL compatibility (especially for Postgres on production)
    database_url = os.environ.get("DATABASE_URL")
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    SQLALCHEMY_DATABASE_URI = database_url or f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'database.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── SERVER CONFIG ─────────────────────────────────────
    ENV = os.environ.get("FLASK_ENV", "production")
    DEBUG = os.environ.get("DEBUG", "False").lower() == "true" or ENV == "development"
    PORT = int(os.environ.get("PORT", 5000))
    HOST = os.environ.get("HOST", "0.0.0.0")

    # ── SESSION & SECURITY HEADERS ────────────────────────
    # Only send cookies over HTTPS in production
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "True").lower() == "true" if ENV == "production" else False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 604800 # 7 days
