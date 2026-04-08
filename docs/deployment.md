# MineBot Deployment and Configuration Guide

| Version | Date | Status | Author |
| :--- | :--- | :--- | :--- |
| v1.0 | 2026-04-07 | Basic Guide | Sisyphus AI Agent |

## 1. Quick Start

### 1.1 Manual Installation

```bash
# Clone repository
git clone https://github.com/your-org/minebot.git
cd minebot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start services
npm start           # Bot Server
npm run cli         # Admin Console
```

### 1.2 Docker Installation

```bash
# Using Docker Compose
docker-compose up -d

# Using Docker directly
docker run -p 9500:9500 -v $(pwd)/data:/app/data your-org/minebot
```

## 2. Configuration

### 2.1 Environment Variables

**Essential Settings**:
```bash
# Bot Server
HOST=0.0.0.0
PORT=9500
LOG_DIR=logs

# Minecraft Server
MINECRAFT_SERVER_HOST=localhost
MINECRAFT_SERVER_PORT=25565

# LLM Integration
VLLM_URL=http://localhost:8000
USE_FALLBACK=false

# Logging
LOG_LEVEL=info
```

### 2.2 Database Setup

**Initialization**:
```bash
# Initialize SQLite databases
node scripts/init-db.js

# Run migrations
node scripts/migrate.js
```

## 3. Deployment Options

### 3.1 Development

```bash
npm run dev          # Hot reload
npm test            # Run tests
npm run test:watch  # Watch mode
```

### 3.2 Production

**Process Management (PM2)**:
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Systemd Service**:
```ini
[Unit]
Description=MineBot Service
After=network.target

[Service]
Type=simple
User=minebot
WorkingDirectory=/opt/minebot
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 4. Monitoring

### 4.1 Health Checks

```bash
# API health
curl http://localhost:9500/api/health

# System status
curl http://localhost:9500/api/system/status
```

### 4.2 Logs

**Log Locations**:
- `logs/bot_server.log` - Server logs
- `logs/bot_*.log` - Individual bot logs
- `logs/error.log` - Error logs

**Log Rotation**:
```bash
# Configure logrotate
sudo nano /etc/logrotate.d/minebot
```

## 5. Security

### 5.1 Basic Security

```bash
# Firewall rules
sudo ufw allow 22/tcp
sudo ufw allow 9500/tcp
sudo ufw allow 25565/tcp
sudo ufw enable

# File permissions
chmod 600 .env
chmod 750 config/
chmod 640 config/*.js
```

### 5.2 Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name minebot.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name minebot.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:9500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 6. Maintenance

### 6.1 Backup

```bash
# Database backup
node scripts/backup.js

# Manual backup
cp data/*.db backups/
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/
```

### 6.2 Updates

```bash
# Update process
git pull origin main
npm install
npm run db:migrate
pm2 restart minebot
```

## 7. Troubleshooting

### 7.1 Common Issues

**Port Already in Use**:
```bash
# Check process using port
sudo lsof -i :9500
# Kill process
sudo kill -9 <PID>
```

**Database Issues**:
```bash
# Repair SQLite database
sqlite3 data/bot_config.db ".recover" | sqlite3 data/bot_config.fixed
mv data/bot_config.fixed data/bot_config.db
```

**Memory Issues**:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### 7.2 Debug Mode

```bash
# Enable verbose logging
LOG_LEVEL=debug npm start

# Debug specific component
DEBUG=minebot:* npm start
```

## 8. Scaling

### 8.1 Multiple Bots

**Environment Variables**:
```bash
MAX_CONCURRENT_BOTS=10
BOT_HEARTBEAT_INTERVAL=5000
DATABASE_CONNECTION_LIMIT=20
```

### 8.2 Load Balancing

**Multiple Instances**:
```bash
# Start multiple instances on different ports
PORT=9501 npm start
PORT=9502 npm start

# Use load balancer
upstream minebot_servers {
    server localhost:9501;
    server localhost:9502;
}
```

---

*For detailed architecture and testing information, refer to architecture.md and testing.md in this directory.*