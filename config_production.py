"""
Production Configuration for Productivity Hub
Use this configuration when deploying to Ubuntu VPS
"""

import os
from datetime import timedelta

class ProductionConfig:
    """Production-ready configuration"""
    
    # Flask settings
    DEBUG = False
    TESTING = False
    ENV = 'production'
    
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY', 'please-set-env-variable-SECRET_KEY')
    SESSION_COOKIE_SECURE = True  # Only send cookie over HTTPS
    SESSION_COOKIE_HTTPONLY = True  # Prevent JavaScript from accessing cookies
    SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    # Database
    SQLALCHEMY_DATABASE_URI = 'sqlite:////var/www/productivity-hub/productivity.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False  # Don't log SQL queries in production
    
    # Application settings
    JSON_SORT_KEYS = False
    JSONIFY_PRETTYPRINT_REGULAR = False  # Smaller response size
    
    # CORS settings (if needed)
    CORS_ORIGINS = ['https://commandflow.devtailored.com']


class DevelopmentConfig:
    """Development configuration (for local testing)"""
    
    DEBUG = True
    TESTING = False
    ENV = 'development'
    
    SECRET_KEY = 'dev-secret-key-not-for-production'
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    SQLALCHEMY_DATABASE_URI = 'sqlite:///productivity.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = True
    SQLALCHEMY_ECHO = True


class TestingConfig:
    """Testing configuration"""
    
    DEBUG = True
    TESTING = True
    
    SECRET_KEY = 'test-secret-key'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


# Select config based on environment
config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config(env=None):
    """Get configuration based on environment"""
    if env is None:
        env = os.environ.get('FLASK_ENV', 'development')
    return config.get(env, config['default'])
