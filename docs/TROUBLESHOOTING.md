# SafeOS Guardian - Troubleshooting Guide

Common issues and solutions for SafeOS Guardian.

---

## Quick Diagnostics

### Check System Status

```bash
# API health
curl http://localhost:3001/health

# Ollama status
curl http://localhost:11434/api/version

# Database exists
ls -la db_data/app.sqlite3
```

---

## Connection Issues

### "Ollama not connected"

**Symptoms:**
- "Ollama unavailable" error in logs
- Analysis falls back to cloud or fails

**Solutions:**

1. **Check if Ollama is running:**
   ```bash
   curl http://localhost:11434/api/version
   ```

2. **Start Ollama:**
   ```bash
   ollama serve
   ```

3. **Verify models are installed:**
   ```bash
   ollama list
   # Should show: moondream, llava:7b
   ```

4. **Pull missing models:**
   ```bash
   ollama pull moondream
   ollama pull llava:7b
   ```

5. **Check OLLAMA_HOST environment variable:**
   ```bash
   echo $OLLAMA_HOST
   # Should be: http://localhost:11434 (or your custom host)
   ```

### "WebSocket connection failed"

**Symptoms:**
- UI shows "Disconnected" status
- Frame submissions fail

**Solutions:**

1. **Check API server is running:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Verify port is correct:**
   - Default API port: 3001
   - Check `SAFEOS_PORT` in .env

3. **Check for firewall blocking:**
   ```bash
   # macOS
   sudo pfctl -s rules | grep 3001

   # Linux
   sudo iptables -L | grep 3001
   ```

4. **Check browser console for CORS errors:**
   - If running UI separately, ensure API allows the origin

### "Camera not working"

**Symptoms:**
- Black video feed
- "Camera access denied" error

**Solutions:**

1. **Check browser permissions:**
   - Click the lock icon in the address bar
   - Ensure camera permission is "Allow"

2. **Check if another app is using the camera:**
   - Close Zoom, Teams, or other video apps
   - Restart browser

3. **Try a different browser:**
   - Chrome/Chromium recommended
   - Firefox has known WebRTC issues

4. **Test camera directly:**
   ```javascript
   // In browser console
   navigator.mediaDevices.getUserMedia({ video: true })
     .then(stream => console.log('Camera works!', stream))
     .catch(err => console.error('Camera error:', err));
   ```

---

## Performance Issues

### "Slow analysis"

**Symptoms:**
- Long wait times for analysis results
- UI feels unresponsive

**Causes and Solutions:**

1. **First analysis is always slower:**
   - Models need to load into memory
   - Subsequent analyses are faster

2. **Low system resources:**
   ```bash
   # Check memory usage
   free -h  # Linux
   vm_stat  # macOS
   ```

3. **Ollama model too large:**
   - Use smaller model for faster triage:
     ```bash
     # moondream is faster than llava:7b
     ollama pull moondream
     ```

4. **Too many concurrent analyses:**
   - Default concurrency is 2
   - Reduce in queue config if needed

### "High CPU usage"

**Symptoms:**
- System fans running constantly
- Other apps slow down

**Solutions:**

1. **Reduce frame rate:**
   - In settings, lower motion detection frequency
   - Current limit: 30 frames/minute

2. **Use lighter AI models:**
   - Browser-only mode uses TensorFlow.js (lighter)
   - Disable Ollama if not needed

3. **Check for memory leaks:**
   ```bash
   # Monitor process memory
   watch -n 1 'ps aux | grep node'
   ```

### "Too many false alerts"

**Symptoms:**
- Constant alerts for normal activity
- Alert fatigue

**Solutions:**

1. **Lower motion sensitivity:**
   - Settings > Motion Sensitivity
   - Try values like 5-10 (lower = less sensitive)

2. **Adjust audio threshold:**
   - Settings > Audio Sensitivity
   - Increase to filter out background noise

3. **Use detection zones:**
   - Settings > Zones
   - Only monitor specific areas

4. **Calibrate baseline:**
   - Monitor page > Calibrate Baseline
   - Auto-detects room's normal activity levels

5. **Check for environmental factors:**
   - Moving curtains/shadows
   - Reflections from screens
   - HVAC vents causing movement

---

## Database Issues

### "Database locked"

**Symptoms:**
- "SQLITE_BUSY: database is locked" errors
- Operations fail intermittently

**Solutions:**

1. **Check for multiple processes:**
   ```bash
   lsof db_data/app.sqlite3
   ```

2. **Restart API server:**
   ```bash
   pm2 restart safeos-api
   # or
   pkill -f "node.*safeos"
   npm run api
   ```

3. **Check disk space:**
   ```bash
   df -h .
   ```

### "Database corrupted"

**Symptoms:**
- "SQLITE_CORRUPT" errors
- Missing data

**Solutions:**

1. **Try integrity check:**
   ```bash
   sqlite3 db_data/app.sqlite3 "PRAGMA integrity_check;"
   ```

2. **Recover from backup:**
   Stop the API and follow the database restore procedure in the deployment
   guide. Preserve the existing database and any WAL sidecars for rollback;
   use SQLite's `.restore` command with a checked backup before restarting.

3. **Export and recreate:**
   ```bash
   # Export what you can
   sqlite3 db_data/app.sqlite3 ".dump" > backup.sql

   # Delete and restart (will recreate schema)
   rm db_data/app.sqlite3
   npm run api
   ```

---

## Authentication Issues

### "Unauthorized" errors

**Symptoms:**
- 401 responses on API calls
- "Session expired" messages

**Solutions:**

1. **Check session token:**
   - Ensure `X-Session-Token` header is included
   - Token should match a valid session in database

2. **Session expired:**
   - Sessions have expiry times
   - Re-authenticate to get a new token

3. **Database session table issue:**
   ```bash
   sqlite3 db_data/app.sqlite3 "SELECT * FROM sessions LIMIT 5;"
   ```

---

## Notification Issues

### "SMS not sending"

**Symptoms:**
- Twilio configured but no SMS received

**Solutions:**

1. **Check Twilio credentials:**
   ```bash
   # Verify env vars are set
   echo $TWILIO_ACCOUNT_SID
   echo $TWILIO_AUTH_TOKEN
   echo $TWILIO_FROM_NUMBER
   ```

2. **Check Twilio console:**
   - Verify account has credits
   - Check message logs for errors

3. **Verify phone number format:**
   - Must be E.164 format: `+15551234567`

### "Telegram not working"

**Symptoms:**
- Bot configured but no messages received

**Solutions:**

1. **Start conversation with bot:**
   - Send `/start` to your bot first
   - This registers the chat ID

2. **Check bot token:**
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
   ```

3. **Verify chat ID is saved:**
   ```bash
   sqlite3 db_data/app.sqlite3 "SELECT * FROM telegram_chats;"
   ```

### "Browser notifications not working"

**Symptoms:**
- No browser push notifications

**Solutions:**

1. **Check browser permissions:**
   - Site Settings > Notifications > Allow

2. **Ensure HTTPS (required for push):**
   - Localhost works for testing
   - Production needs HTTPS

3. **Check VAPID keys:**
   ```bash
   echo $VAPID_PUBLIC_KEY
   echo $VAPID_PRIVATE_KEY
   ```

4. **Test notification API:**
   ```javascript
   // In browser console
   Notification.requestPermission().then(p => console.log('Permission:', p));
   new Notification('Test', { body: 'This is a test' });
   ```

---

## Browser Compatibility

### Supported Browsers

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | Fully supported |
| Firefox | 90+ | Supported (some WebRTC quirks) |
| Safari | 15+ | Supported (limited WebRTC) |
| Edge | 90+ | Fully supported |

### Known Browser Issues

**Safari:**
- WebRTC may require additional permissions
- IndexedDB can be cleared by "Prevent cross-site tracking"

**Firefox:**
- Some WebSocket features may differ
- Camera selection UI different from Chrome

**Mobile Browsers:**
- Background tabs may be throttled
- Use "Add to Home Screen" for better experience

---

## Debug Logging

### Enable Debug Output

```bash
# API server with debug logging
DEBUG=safeos:* npm run api

# Specific components
DEBUG=safeos:analysis npm run api
DEBUG=safeos:alerts npm run api
DEBUG=safeos:websocket npm run api
```

### Browser Console Logging

```javascript
// Enable verbose logging
localStorage.setItem('safeos_debug', 'true');
location.reload();
```

### Check Server Logs

```bash
# PM2
pm2 logs safeos-api

# Docker
docker logs safeos-api -f

# Systemd
journalctl -u safeos -f
```

---

## Getting Help

### Before Asking for Help

1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Gather diagnostic info:
   - Browser and version
   - OS and version
   - Error messages (console, logs)
   - Steps to reproduce

### Where to Get Help

- **GitHub Issues:** [Report bugs](https://github.com/framerslab/safeos/issues)
- **Email:** team@frame.dev

### Reporting Bugs

Include:
1. Steps to reproduce
2. Expected vs actual behavior
3. Browser/OS info
4. Console errors
5. Server logs (sanitized of secrets)

---

## See Also

- [Quick Start Guide](./QUICKSTART.md)
- [Configuration Reference](./CONFIGURATION.md)
- [Development Guide](./DEVELOPMENT.md)
