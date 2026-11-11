# SafeOS Guardian - Deployment Guide

This guide covers deploying SafeOS Guardian in various configurations.

---

## Deployment Options

| Option | Server Required | Features | Best For |
|--------|-----------------|----------|----------|
| **Static PWA** | No | Browser AI, local storage | Privacy-focused, offline use |
| **Full Stack** | Yes | SMS/Telegram, Ollama, multi-device | Advanced features |

---

## Option A: Static PWA Deployment (Recommended)

The Guardian UI is a standalone Progressive Web App that requires no server.

### Build

```bash
cd apps/guardian-ui
npm install
npm run build
```

This creates a static `out/` folder ready for deployment.

### GitHub Pages

1. Create a new repository or use an existing one
2. Enable GitHub Pages in Settings > Pages
3. Deploy the `out/` folder:

```bash
# Option 1: Manual upload
# Drag and drop 'out' contents to repo

# Option 2: GitHub Actions
# Add .github/workflows/deploy.yml:
```

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: apps/guardian-ui/package-lock.json

      - name: Install & Build
        run: |
          cd apps/guardian-ui
          npm ci
          npm run build

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: apps/guardian-ui/out
```

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/guardian-ui
vercel --prod
```

Or connect your repo at [vercel.com](https://vercel.com) for automatic deployments.

### Netlify

1. Go to [netlify.com](https://netlify.com)
2. Click "Add new site" > "Deploy manually"
3. Drag and drop the `out/` folder

Or use CLI:
```bash
npm i -g netlify-cli
cd apps/guardian-ui
netlify deploy --prod --dir=out
```

### Cloudflare Pages

```bash
# Via Cloudflare dashboard
# 1. Connect repo
# 2. Build command: cd apps/guardian-ui && npm run build
# 3. Output directory: apps/guardian-ui/out
```

### Any Static Host

The `out/` folder contains only static files. Upload to any web server, CDN, or hosting platform that serves static content.

---

## Option B: Full Stack Deployment

Deploy the API server for SMS/Telegram alerts, Ollama LLM, and multi-device sync.

### Prerequisites

- Node.js 20+
- Ollama (optional)
- SMS/Telegram credentials (optional)

### Local Development

```bash
cd safeos

# Install dependencies
npm install

# Start API + UI
npm run dev

# Or separately:
npm run api  # Port 3001
npm run ui   # Port 3000
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

**Build and run:**
```bash
docker build -t safeos-api .
docker run -p 3001:3001 \
  -e SAFEOS_PORT=3001 \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  -v ./db_data:/app/db_data \
  safeos-api
```

### Docker Compose

```yaml
version: '3.8'

services:
  safeos-api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - SAFEOS_PORT=3001
      - SAFEOS_DB_PATH=/data/safeos.sqlite3
      - OLLAMA_HOST=http://ollama:11434
    volumes:
      - safeos-data:/data
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

  guardian-ui:
    build:
      context: ./apps/guardian-ui
    ports:
      - "3000:3000"
    depends_on:
      - safeos-api

volumes:
  safeos-data:
  ollama-data:
```

### PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Build
cd safeos
npm run build

# Start with PM2
pm2 start dist/index.js --name safeos-api

# Save configuration
pm2 save

# Auto-restart on reboot
pm2 startup
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'safeos-api',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      SAFEOS_PORT: 3001,
    },
  }],
};
```

### Systemd Service

```ini
# /etc/systemd/system/safeos.service
[Unit]
Description=SafeOS Guardian API
After=network.target

[Service]
Type=simple
User=safeos
WorkingDirectory=/opt/safeos
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=SAFEOS_PORT=3001
Environment=SAFEOS_DB_PATH=/var/lib/safeos/safeos.sqlite3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable safeos
sudo systemctl start safeos
```

---

## Ollama Setup

### Local Installation

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download
```

### Start and Pull Models

```bash
# Start Ollama server
ollama serve &

# Pull models (one-time)
ollama pull moondream    # Fast triage (~1.7GB)
ollama pull llava:7b     # Detailed analysis (~4GB)
ollama pull llama3.2-vision:11b  # Complex reasoning (~7GB)
```

### Docker with GPU

```yaml
# docker-compose.yml with GPU support
ollama:
  image: ollama/ollama
  ports:
    - "11434:11434"
  volumes:
    - ollama-data:/root/.ollama
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

---

## HTTPS & Certificates

### Let's Encrypt with Caddy

```
# Caddyfile
safeos.yourdomain.com {
    reverse_proxy localhost:3001
}

guardian.yourdomain.com {
    root * /var/www/guardian-ui
    file_server
}
```

### Nginx with Certbot

```nginx
server {
    listen 80;
    server_name safeos.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name safeos.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/safeos.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/safeos.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Health Checks

### API Health Endpoint

```bash
curl http://localhost:3001/health
# {"status":"healthy","timestamp":"..."}
```

### Ollama Check

```bash
curl http://localhost:11434/api/version
# {"version":"..."}
```

---

## Monitoring & Logs

### PM2 Logs

```bash
pm2 logs safeos-api
pm2 logs safeos-api --lines 100
```

### Docker Logs

```bash
docker logs safeos-api -f
docker-compose logs -f
```

### Systemd Logs

```bash
journalctl -u safeos -f
journalctl -u safeos --since "1 hour ago"
```

---

## Backup & Recovery

### Database Backup

```bash
# Simple copy
cp db_data/safeos.sqlite3 backup/safeos-$(date +%Y%m%d).sqlite3

# With compression
sqlite3 db_data/safeos.sqlite3 ".backup 'backup.db'"
gzip backup.db
```

### Automated Backup Script

```bash
#!/bin/bash
BACKUP_DIR=/backups/safeos
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /var/lib/safeos/safeos.sqlite3 $BACKUP_DIR/safeos-$DATE.sqlite3
gzip $BACKUP_DIR/safeos-$DATE.sqlite3

# Keep only last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
```

---

## See Also

- [Configuration Reference](./CONFIGURATION.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
