# 🚀 Ubuntu VPS Deployment Guide

## Quick Deployment (Recommended)

If you have a fresh Ubuntu VPS, use the automated deployment script:

### One-Command Deployment
```bash
# SSH into your VPS
ssh root@your_vps_ip

# Download and run the deployment script
cd /var/www
curl -O https://raw.githubusercontent.com/dronzer7905/productivity-hub/master/deploy.sh
chmod +x deploy.sh
sudo bash deploy.sh
```

This script will:
- ✅ Install all dependencies (Python, Nginx, Certbot)
- ✅ Clone the repository
- ✅ Set up Python virtual environment
- ✅ Create systemd service for auto-restart
- ✅ Configure Nginx as reverse proxy
- ✅ Generate secure SECRET_KEY
- ✅ Set up logging

---

## Manual Deployment Steps

If you prefer to deploy manually or need to troubleshoot:

### Prerequisites
- Ubuntu 18.04 or newer
- Root or sudo access
- Domain pointing to your VPS (commandflow.devtailored.com)

### Step-by-Step Installation

**1. SSH into VPS**
```bash
ssh root@your_vps_ip
```

**2. Update system**
```bash
apt-get update && apt-get upgrade -y
```

**3. Install dependencies**
```bash
apt-get install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx
```

**4. Clone repository**
```bash
cd /var/www
git clone https://github.com/dronzer7905/productivity-hub.git
cd productivity-hub
```

**5. Set up virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

**6. Set permissions**
```bash
chown -R www-data:www-data /var/www/productivity-hub
chmod -R 755 /var/www/productivity-hub
```

**7. Create .env file with SECRET_KEY**
```bash
cat > .env << 'EOF'
SECRET_KEY=your-very-long-random-secret-key-here
FLASK_ENV=production
EOF
chmod 600 .env
```

Generate a good SECRET_KEY:
```python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**8. Create systemd service**

Create `/etc/systemd/system/productivity-hub.service`:
```ini
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
ExecStart=/var/www/productivity-hub/venv/bin/gunicorn \
    -w 4 \
    -b 127.0.0.1:5001 \
    --timeout 60 \
    app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**9. Create log directory**
```bash
mkdir -p /var/log/productivity-hub
chown www-data:www-data /var/log/productivity-hub
```

**10. Configure Nginx**

Create `/etc/nginx/sites-available/productivity-hub`:
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
    }

    location /static {
        alias /var/www/productivity-hub/static;
        expires 30d;
    }
}
```

Enable it:
```bash
ln -s /etc/nginx/sites-available/productivity-hub /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

**11. Start the service**
```bash
systemctl daemon-reload
systemctl enable productivity-hub
systemctl start productivity-hub
```

**12. Set up SSL (Let's Encrypt)**
```bash
certbot --nginx -d commandflow.devtailored.com
# Follow prompts to set up HTTPS
```

---

## ✅ Verification

**Check service status:**
```bash
systemctl status productivity-hub
```

**Test the app:**
```bash
curl http://commandflow.devtailored.com
# or visit in browser: https://commandflow.devtailored.com
```

**View logs:**
```bash
journalctl -u productivity-hub -f
tail -f /var/log/productivity-hub/access.log
```

---

## 🔄 Updates & Maintenance

**Pull latest code:**
```bash
cd /var/www/productivity-hub
git pull origin master
source venv/bin/activate
pip install -r requirements.txt
systemctl restart productivity-hub
```

**Restart service:**
```bash
systemctl restart productivity-hub
```

**View real-time logs:**
```bash
sudo journalctl -u productivity-hub -f
```

**Database backup:**
```bash
cp /var/www/productivity-hub/productivity.db /var/backups/productivity.db.$(date +%Y%m%d_%H%M%S)
```

---

## 🐛 Troubleshooting

### Service won't start
```bash
# Check for errors
journalctl -u productivity-hub -n 50
systemctl status productivity-hub

# Restart systemd
systemctl daemon-reload
systemctl restart productivity-hub
```

### 502 Bad Gateway
```bash
# Check if Gunicorn is running
ps aux | grep gunicorn

# Check if port 5001 is listening
netstat -tuln | grep 5001

# Restart both services
systemctl restart productivity-hub nginx
```

### Permission denied
```bash
# Fix ownership
chown -R www-data:www-data /var/www/productivity-hub
chmod -R 755 /var/www/productivity-hub
```

### Database locked
```bash
# Restart service to reset connection
systemctl restart productivity-hub

# Or clear database and restart
rm /var/www/productivity-hub/productivity.db
systemctl restart productivity-hub
```

### SSL certificate issues
```bash
# Renew certificate
certbot renew --dry-run

# Or manually
certbot certonly --nginx -d commandflow.devtailored.com
```

---

## 📊 Monitoring

### Check memory/CPU usage
```bash
top -p $(pgrep -f "gunicorn")
```

### Check disk space
```bash
df -h
du -sh /var/www/productivity-hub/
```

### Monitor access logs
```bash
tail -f /var/log/nginx/access.log | grep productivity
```

---

## 🔒 Security Checklist

- ✅ Use HTTPS/SSL (Let's Encrypt)
- ✅ Set strong SECRET_KEY
- ✅ Keep permissions correct (755 dirs, 644 files)
- ✅ Run as www-data user (not root)
- ✅ Enable firewall
- ✅ Disable SSH password login (use keys)
- ✅ Regular backups of database

```bash
# Example firewall setup
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

---

## 📞 Support

If you encounter issues:
1. Check logs: `journalctl -u productivity-hub -f`
2. Check Nginx: `nginx -t` and `systemctl status nginx`
3. Test app locally: `python app.py`
4. Open issue on GitHub

---

**Happy deploying! 🎉**
