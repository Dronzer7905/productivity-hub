# 📋 Manual Setup Commands for Ubuntu VPS

Complete copy-paste ready commands to deploy Productivity Hub manually.

---

## 🔧 Step 1: Connect to VPS

```bash
ssh root@your_vps_ip
# or if you use a specific user:
ssh username@your_vps_ip
```

---

## 📦 Step 2: Update System & Install Dependencies

```bash
apt-get update
apt-get upgrade -y
apt-get install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx
```

---

## 📁 Step 3: Clone Repository

```bash
cd /var/www
git clone https://github.com/dronzer7905/productivity-hub.git
cd productivity-hub
```

---

## 🐍 Step 4: Setup Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

---

## 🔑 Step 5: Create .env File with SECRET_KEY

```bash
# Generate a secure SECRET_KEY
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo "SECRET_KEY=$SECRET_KEY" > .env
echo "FLASK_ENV=production" >> .env
chmod 600 .env
cat .env  # Verify the SECRET_KEY was created
```

---

## 👤 Step 6: Set File Permissions

```bash
chown -R www-data:www-data /var/www/productivity-hub
chmod -R 755 /var/www/productivity-hub
chmod -R 777 /var/www/productivity-hub  # Allow writes if needed
```

---

## 📋 Step 7: Create Systemd Service File

```bash
sudo tee /etc/systemd/system/productivity-hub.service > /dev/null << 'EOF'
[Unit]
Description=Productivity Hub Application
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/productivity-hub
Environment="PATH=/var/www/productivity-hub/venv/bin"
Environment="FLASK_ENV=production"
EnvironmentFile=/var/www/productivity-hub/.env
ExecStart=/var/www/productivity-hub/venv/bin/gunicorn -w 4 -b 127.0.0.1:5001 --timeout 60 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

---

## 📂 Step 8: Create Log Directory

```bash
mkdir -p /var/log/productivity-hub
chown www-data:www-data /var/log/productivity-hub
chmod 755 /var/log/productivity-hub
```

---

## 🌐 Step 9: Configure Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/sites-available/productivity-hub > /dev/null << 'EOF'
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

    location /static {
        alias /var/www/productivity-hub/static;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
```

---

## ✅ Step 10: Enable Nginx Configuration

```bash
sudo ln -s /etc/nginx/sites-available/productivity-hub /etc/nginx/sites-enabled/
sudo nginx -t  # Test the configuration
sudo systemctl reload nginx
```

---

## 🚀 Step 11: Enable & Start the Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable productivity-hub
sudo systemctl start productivity-hub
sudo systemctl status productivity-hub
```

---

## 🔐 Step 12: Setup SSL with Let's Encrypt (IMPORTANT!)

```bash
# Request SSL certificate
sudo certbot --nginx -d commandflow.devtailored.com

# Follow the prompts:
# 1. Enter email
# 2. Agree to terms
# 3. Agree to share email
# 4. Select redirect (choose 2 to redirect to HTTPS)

# Enable auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## ✨ Verification Steps

### Check if service is running:
```bash
sudo systemctl status productivity-hub
```

### Check if port 5001 is listening:
```bash
netstat -tuln | grep 5001
```

### Check Nginx is working:
```bash
curl -I http://commandflow.devtailored.com
```

### View application logs:
```bash
sudo journalctl -u productivity-hub -f
```

### Test the application:
```bash
curl http://127.0.0.1:5001
```

---

## 🔄 Common Commands After Setup

### Restart the application:
```bash
sudo systemctl restart productivity-hub
```

### View logs in real-time:
```bash
sudo journalctl -u productivity-hub -f
```

### Stop the application:
```bash
sudo systemctl stop productivity-hub
```

### Check service status:
```bash
sudo systemctl status productivity-hub
```

### View last 50 lines of logs:
```bash
sudo journalctl -u productivity-hub -n 50
```

---

## 🔄 Update Application

When you push new code to GitHub:

```bash
cd /var/www/productivity-hub
source venv/bin/activate
git pull origin master
pip install -r requirements.txt
sudo systemctl restart productivity-hub
```

---

## 🐛 Troubleshooting Commands

### If service won't start:
```bash
# Check for errors
sudo journalctl -u productivity-hub -n 50

# Check systemd syntax
sudo systemd-analyze verify /etc/systemd/system/productivity-hub.service

# Restart systemd
sudo systemctl daemon-reload
```

### If you get "502 Bad Gateway":
```bash
# Check if Gunicorn is running
ps aux | grep gunicorn

# Check if port 5001 is open
netstat -tuln | grep 5001

# Restart both services
sudo systemctl restart productivity-hub
sudo systemctl restart nginx
```

### If database is locked:
```bash
# Restart the service
sudo systemctl restart productivity-hub

# Or clear and restart
rm /var/www/productivity-hub/productivity.db
sudo systemctl restart productivity-hub
```

### Check Nginx configuration:
```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Monitor resource usage:
```bash
top -p $(pgrep -f "gunicorn")
```

---

## 📊 Check Disk Space & Backups

### Check disk usage:
```bash
df -h
du -sh /var/www/productivity-hub/
```

### Backup database:
```bash
sudo cp /var/www/productivity-hub/productivity.db /var/backups/productivity.db.$(date +%Y%m%d_%H%M%S)
```

### List backups:
```bash
ls -lah /var/backups/productivity.db.*
```

---

## 🔒 Security Checklist

### Setup firewall:
```bash
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

### Verify HTTPS is working:
```bash
curl -I https://commandflow.devtailored.com
```

### Check SSL certificate validity:
```bash
sudo certbot certificates
```

### Verify SECRET_KEY is set:
```bash
cat /var/www/productivity-hub/.env
```

---

## 📱 Test the Application

### From your local machine:
```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://commandflow.devtailored.com

# Test HTTPS
curl -I https://commandflow.devtailored.com

# Or open in browser:
https://commandflow.devtailored.com
```

---

## 🚨 Emergency Commands

### If you need to kill the process:
```bash
pkill -f "gunicorn"
```

### If you need to disable the service temporarily:
```bash
sudo systemctl stop productivity-hub
```

### To see what services are running:
```bash
sudo systemctl list-units --type=service --state=running
```

### Full service restart (nuclear option):
```bash
sudo systemctl stop productivity-hub
sudo systemctl stop nginx
sleep 2
sudo systemctl start nginx
sudo systemctl start productivity-hub
sudo systemctl status productivity-hub
```

---

## 📝 Notes

- Replace `commandflow.devtailored.com` with your actual domain
- Port 5001 is internal (not exposed to internet), traffic goes through Nginx
- Database is at: `/var/www/productivity-hub/productivity.db`
- Logs are at: `/var/log/productivity-hub/`
- Always use HTTPS in production
- Keep `.env` file private - add to `.gitignore` in your repo

---

**Setup complete! 🎉**

Your app should now be running at: **https://commandflow.devtailored.com**
