# 📊 Productivity Hub

> A unified, full-stack productivity system for developers and teams. Consolidate your schedule, tasks, focus sessions, and progress tracking into one beautiful, skeuomorphic portal.

**👨‍💻 Created by**: **Dronzer** | Full-Stack Developer  
**📅 Last Updated**: April 2026  
**⭐ Please star this repo if you find it useful!**

---

## 🚀 Features

-   **Daily Schedule**: Visual timeline of your day with automated block detection.
-   **Pomodoro Timer**: Deep work timer with session logging and streak tracking.
-   **Task Manager**: Built-in priority-based task management with project grouping.
-   **Progress Tracker**: Log daily wins, focus hours, and AI/ML learning topics.
-   **Weekly Planner**: Reflection and intention setting for your weekly growth.
-   **Team Collaboration**: Create teams, join via invite codes, and sync progress with others.
-   **Skeuomorphic UI**: Premium, tactile design that feels like a physical workspace.
-   **Self-Hosted**: Built with Python (Flask) and SQLite for easy deployment and full privacy.
-   **PWA Support**: Progressive Web App capabilities for offline access.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.8+, Flask, SQLAlchemy |
| **Database** | SQLite (zero-config) |
| **Frontend** | Vanilla HTML5, CSS3 (Skeuomorphic), Vanilla JavaScript (SPA) |
| **Security** | Bcrypt, Session-based authentication |
| **PWA** | Service Workers, Web Manifest |

---

## 📦 Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- Git

### Step-by-Step Setup

1. **Clone the repository**:
    ```bash
    git clone https://github.com/dronzer7905/productivity-hub.git
    cd productivity-hub
    ```

2. **Create a Python virtual environment**:
    ```bash
    # On Windows
    python -m venv venv
    venv\Scripts\activate
    
    # On macOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3. **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4. **Initialize the database** (first time only):
    ```bash
    # The database will auto-create on first run, or manually:
    python -c "from app import db; db.create_all()"
    ```

5. **Configure the app** (optional):
    - Edit `config.py` to customize settings
    - Default uses SQLite in project root

6. **Run the application**:
    ```bash
    python app.py
    ```

7. **Access the Hub**:
    - Open `http://localhost:5000` in your browser
    - Create an account and start tracking!

---

## 📁 Project Structure

```
productivity-hub/
├── app.py                 # Main Flask application
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
├── models/                # Database models
│   ├── user.py
│   ├── task.py
│   ├── schedule.py
│   ├── pomodoro.py
│   ├── tracker.py
│   ├── planner.py
│   ├── notification.py
│   ├── lead.py
│   └── invite.py
├── routes/                # API endpoints & views
│   ├── auth.py
│   ├── tasks.py
│   ├── schedule.py
│   ├── pomodoro.py
│   ├── tracker.py
│   ├── dashboard.py
│   ├── team.py
│   └── notifications.py
├── static/                # Frontend assets
│   ├── js/app.js
│   ├── css/style.css
│   ├── sw.js              # Service worker (PWA)
│   └── manifest.json      # PWA manifest
└── templates/             # HTML templates
    └── app.html
```

---

## ⚙️ Configuration

Edit `config.py` to customize:

```python
# Database location
SQLALCHEMY_DATABASE_URI = 'sqlite:///productivity.db'

# Session settings
PERMANENT_SESSION_LIFETIME = timedelta(days=7)

# Debug mode
DEBUG = True  # Set to False in production
```

---

## 🚀 Running the Application

### Development Mode
```bash
python app.py
```
- Auto-reloads on file changes
- Debug mode enabled
- Runs on `http://localhost:5000`

### Production Deployment

#### ⚡ Quick Deploy (Recommended)

For Ubuntu VPS, use our automated deployment script:

```bash
# SSH into your VPS
ssh root@your_vps_ip

# One-command setup
curl -fsSL https://raw.githubusercontent.com/dronzer7905/productivity-hub/master/deploy.sh | sudo bash
```

**Complete deployment guides:**
- 📖 **[DEPLOYMENT.md](DEPLOYMENT.md)** - Detailed Ubuntu VPS setup guide
- 🔧 **[config_production.py](config_production.py)** - Production configuration template
- 🚀 **[deploy.sh](deploy.sh)** - Automated deployment script

---

#### Manual Ubuntu VPS Setup (commandflow.devtailored.com)

**1. SSH into your VPS**
```bash
ssh root@your_vps_ip
# or
ssh user@your_vps_ip
```

**2. Clone the repository**
```bash
cd /var/www
git clone https://github.com/dronzer7905/productivity-hub.git
cd productivity-hub
```

**3. Set up Python virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn  # production WSGI server
```

**4. Test the app locally on the VPS**
```bash
python app.py
# Should start on http://localhost:5000
# Press Ctrl+C to stop
```

**5. Create a Gunicorn service file** (`/etc/systemd/system/productivity-hub.service`)
```ini
[Unit]
Description=Productivity Hub Application
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/productivity-hub
Environment="PATH=/var/www/productivity-hub/venv/bin"
ExecStart=/var/www/productivity-hub/venv/bin/gunicorn -w 4 -b 127.0.0.1:5001 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**6. Enable and start the service**
```bash
sudo systemctl daemon-reload
sudo systemctl enable productivity-hub
sudo systemctl start productivity-hub
sudo systemctl status productivity-hub  # verify it's running
```

**7. Configure Nginx reverse proxy** (`/etc/nginx/sites-available/productivity-hub`)
```nginx
server {
    listen 80;
    server_name commandflow.devtailored.com;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files caching
    location /static {
        alias /var/www/productivity-hub/static;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**8. Enable the Nginx configuration**
```bash
sudo ln -s /etc/nginx/sites-available/productivity-hub /etc/nginx/sites-enabled/
sudo nginx -t  # test configuration
sudo systemctl reload nginx
```

**9. Set up SSL with Let's Encrypt** (highly recommended)
```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Generate SSL certificate
sudo certbot --nginx -d commandflow.devtailored.com

# Auto-renew certificates
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

**10. Configure application for production** (`config.py`)
```python
import os
from datetime import timedelta

class ProductionConfig:
    DEBUG = False
    TESTING = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:////var/www/productivity-hub/productivity.db'
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-change-this'
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
```

**11. Set environment variables** (add to `.env` file or systemd service)
```bash
export SECRET_KEY='your-very-long-random-secret-key-here'
export FLASK_ENV=production
```

---

#### **Monitoring & Maintenance**

**Check service status:**
```bash
sudo systemctl status productivity-hub
sudo journalctl -u productivity-hub -f  # view logs
```

**Restart the app after updates:**
```bash
cd /var/www/productivity-hub
git pull origin master
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart productivity-hub
```

**View Nginx logs:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**Backup the database:**
```bash
sudo cp /var/www/productivity-hub/productivity.db /var/backups/productivity.db.$(date +%Y%m%d)
```

---

#### **Multi-App Setup on Same VPS**

If you have 3 other apps running on your VPS, here's how they typically work:

```
App 1 (Port 5001) → commandflow.devtailored.com
App 2 (Port 5002) → app2.devtailored.com  
App 3 (Port 5003) → app3.devtailored.com
Productivity Hub (Port 5001) → commandflow.devtailored.com
```

Nginx routes requests to different internal ports based on the domain/subdomain. Each app has:
- Its own systemd service file
- Its own Python virtual environment
- Its own Nginx configuration pointing to different ports

---

#### **Using Gunicorn with Multiple Workers**
```bash
# For production, use 4+ workers based on CPU cores
gunicorn -w 4 \
         -b 127.0.0.1:5001 \
         --timeout 60 \
         --access-logfile /var/log/productivity-hub/access.log \
         --error-logfile /var/log/productivity-hub/error.log \
         app:app
```

---

## 📚 API Overview

### Authentication
- `POST /register` - Create new account
- `POST /login` - User login
- `POST /logout` - User logout

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/<id>` - Update task
- `DELETE /api/tasks/<id>` - Delete task

### Schedule
- `GET /api/schedule` - View daily schedule
- `POST /api/schedule` - Add schedule block
- `PUT /api/schedule/<id>` - Update block
- `DELETE /api/schedule/<id>` - Delete block

### Pomodoro
- `GET /api/pomodoro/stats` - Get session stats
- `POST /api/pomodoro/start` - Start new session
- `POST /api/pomodoro/complete` - Complete session

### Team
- `POST /api/team/create` - Create team
- `POST /api/team/invite` - Generate invite code
- `POST /api/team/join` - Join via invite code

---

## 🤝 Contributing

We welcome contributions! Here's how to get involved:

### Contribution Guidelines

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   git checkout -b bugfix/your-bug-fix
   ```

3. **Make your changes**
   - Follow the existing code style
   - Keep changes focused and atomic
   - Add comments for complex logic

4. **Test your changes**
   - Test locally before submitting
   - Ensure the app still runs: `python app.py`
   - Test the feature you added

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add dark mode support"
   git commit -m "fix: resolve schedule block overlap"
   git commit -m "docs: update installation guide"
   ```

6. **Push and submit a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   # Open PR on GitHub with a clear description
   ```

### Code Style Guidelines

- **Python**: Follow PEP 8
- **JavaScript**: Use clear, descriptive variable names
- **CSS**: Use BEM naming convention for classes
- **Commits**: Use conventional commits (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`)

### Types of Contributions

- 🐛 **Bug Fixes**: Found an issue? Submit a fix!
- ✨ **Features**: Have a great idea? Implement and share!
- 📖 **Documentation**: Improve guides and comments
- 🎨 **UI/UX**: Enhance the interface and user experience
- ⚡ **Performance**: Optimize slow operations
- 🧪 **Testing**: Add tests and test coverage

### Issue Labels

- `good first issue` - Great for beginners
- `help wanted` - Need community assistance
- `bug` - Something isn't working
- `enhancement` - Feature request
- `documentation` - Docs improvement needed

---

## 🐛 Troubleshooting

### Issue: "Port 5000 already in use"
```bash
# Use a different port
python app.py --port 5001
# Or kill the existing process
lsof -i :5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows
```

### Issue: "ModuleNotFoundError"
```bash
# Ensure virtual environment is activated
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
# Then reinstall requirements
pip install -r requirements.txt
```

### Issue: "Database locked"
```bash
# SQLite can have concurrency issues
# Delete the database and start fresh
rm productivity.db
python app.py
```

### Issue: "Port permission denied" (macOS/Linux)
```bash
# Ports below 1024 require sudo
# Use a higher port instead
python app.py --port 8000
```

---

## 📝 Development Setup

### Installing Development Dependencies
```bash
pip install -r requirements.txt
pip install pytest pytest-cov  # for testing
```

### Running Tests
```bash
pytest -v
pytest --cov=.  # with coverage
```

### Database Migrations
```bash
# For schema changes, update models and run:
python -c "from app import db; db.create_all()"
```

---

## 📜 License

This project is open source and available under the MIT License.

---

## 👨‍💻 Creator & Maintainer

**Dronzer** - Full-Stack Developer

- 💼 [GitHub](https://github.com/dronzer7905)
- 📧 For inquiries: [Open an issue on GitHub](https://github.com/dronzer7905/productivity-hub/issues)
- ⭐ If you found this helpful, please star the repo!

---

## 🙏 Acknowledgments

Built with passion for the developer and productivity community. Special thanks to everyone who contributes, reports bugs, and shares feedback!

---

**Last Updated**: April 24, 2026  
**Status**: ✅ Active Development  
*Built with ❤️ for builders by Dronzer*
