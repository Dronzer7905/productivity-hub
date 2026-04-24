#!/bin/bash

# Productivity Hub - Ubuntu VPS Deployment Script
# This script automates the setup on a fresh Ubuntu VPS
# Usage: bash deploy.sh

set -e  # Exit on any error

echo "🚀 Productivity Hub Deployment Script"
echo "======================================"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root"
   exit 1
fi

echo "📦 Step 1: Update system packages..."
apt-get update
apt-get upgrade -y

echo "🐍 Step 2: Install Python and dependencies..."
apt-get install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx

echo "📁 Step 3: Create application directory..."
mkdir -p /var/www/productivity-hub
cd /var/www/productivity-hub

echo "🔄 Step 4: Clone repository (if not already cloned)..."
if [ ! -d .git ]; then
    git clone https://github.com/dronzer7905/productivity-hub.git .
else
    git pull origin master
fi

echo "🔐 Step 5: Set up virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "📦 Step 6: Install Python requirements..."
pip install -r requirements.txt
pip install gunicorn

echo "👤 Step 7: Set up permissions..."
chown -R www-data:www-data /var/www/productivity-hub
chmod -R 755 /var/www/productivity-hub
chmod -R 775 /var/www/productivity-hub/  # Allow writes to app

echo "🔑 Step 8: Generate SECRET_KEY..."
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
echo "SECRET_KEY=$SECRET_KEY" > /var/www/productivity-hub/.env
chmod 600 /var/www/productivity-hub/.env
echo "✅ SECRET_KEY saved to .env file"

echo "⚙️  Step 9: Create systemd service file..."
cat > /etc/systemd/system/productivity-hub.service << 'EOF'
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
    --access-logfile /var/log/productivity-hub/access.log \
    --error-logfile /var/log/productivity-hub/error.log \
    app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "📋 Step 10: Create log directory..."
mkdir -p /var/log/productivity-hub
chown www-data:www-data /var/log/productivity-hub
chmod 755 /var/log/productivity-hub

echo "🔗 Step 11: Create Nginx configuration..."
cat > /etc/nginx/sites-available/productivity-hub << 'EOF'
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

# Enable the configuration
if [ ! -L /etc/nginx/sites-enabled/productivity-hub ]; then
    ln -s /etc/nginx/sites-available/productivity-hub /etc/nginx/sites-enabled/
fi

echo "🔍 Step 12: Test Nginx configuration..."
nginx -t

echo "🚀 Step 13: Enable and start services..."
systemctl daemon-reload
systemctl enable productivity-hub
systemctl start productivity-hub
systemctl reload nginx

echo ""
echo "✅ Deployment Complete!"
echo "======================================"
echo "📱 Your app is ready at: https://commandflow.devtailored.com"
echo "🔐 Setting up SSL with Let's Encrypt..."
echo ""
echo "Run this command manually to set up SSL:"
echo "  sudo certbot --nginx -d commandflow.devtailored.com"
echo ""
echo "Monitor the app:"
echo "  sudo systemctl status productivity-hub"
echo "  sudo journalctl -u productivity-hub -f"
echo ""
echo "View logs:"
echo "  sudo tail -f /var/log/productivity-hub/access.log"
echo "  sudo tail -f /var/log/productivity-hub/error.log"
