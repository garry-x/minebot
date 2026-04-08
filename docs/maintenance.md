# MineBot Maintenance and Troubleshooting Guide

## 1. Daily Operations

### Startup:
```bash
npm start
curl http://localhost:9500/api/health
```

### Shutdown:
```bash
# Graceful
pkill -f "node bot_server.js"

# Emergency
pkill -9 -f "node.*minebot"
```

## 2. Common Issues

### Bot Connection Failures:
- Check Minecraft server is running: `netstat -tlnp | grep :25565`
- Verify authentication configuration
- Check firewall rules

### Database Issues:
```bash
# Repair corrupted database
sqlite3 data/bot_config.db ".recover" | sqlite3 data/bot_config.fixed
mv data/bot_config.fixed data/bot_config.db
```

### Memory Problems:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

## 3. Backup Procedures

```bash
# Manual backup
cp data/*.db backups/
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/

# Automated (crontab)
0 2 * * * /opt/minebot/scripts/backup.sh
```

## 4. Performance Tuning

### Database Optimization:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -2000;
VACUUM;
```

### Memory Management:
```bash
export DATABASE_CONNECTION_LIMIT=20
export WEBSOCKET_MAX_CONNECTIONS=50
```

## 5. Security Maintenance

### Weekly Tasks:
- Review logs for suspicious activity
- Check for unauthorized access
- Verify file permissions

### Monthly Tasks:
- Rotate credentials
- Review firewall rules
- Test backup recovery

## 6. Update Procedures

### Minor Updates:
```bash
git pull origin main
npm install
node scripts/migrate.js
pm2 restart minebot
```

### Major Updates:
1. Full backup
2. Review changelog
3. Test in staging
4. Execute migration

## 7. Troubleshooting Tools

### System Diagnostics:
```bash
# Check processes
ps aux | grep -E "(node|minebot)"

# Check ports
netstat -tlnp | grep -E "(9500|25565)"

# Check logs
tail -50 logs/error.log
```

### Debug Mode:
```bash
LOG_LEVEL=debug npm start
DEBUG=minebot:* npm start
```

## 8. Recovery Procedures

### Database Recovery:
1. Stop MineBot
2. Restore from backup
3. Run integrity check
4. Start services

### Full System Recovery:
1. Provision new server
2. Install MineBot
3. Restore backup
4. Verify functionality

---

*Refer to specific documentation for detailed implementation.*