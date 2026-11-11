# SafeOS Guardian - Deployment Guide

**Where to start**

- **Run your own server** (the Settings panel's "Deploy your own server" step): go to [Production server with Docker Compose](#production-server-with-docker-compose). Six steps take a fresh Linux machine to an HTTPS API that the web app connects to.
- **Try the whole stack on one computer**: go to [One machine with Docker Compose](#one-machine-with-docker-compose).
- **Host only the web app** (no server; detection runs in the browser): go to [Option A: Static PWA Deployment](#option-a-static-pwa-deployment-recommended).

Every compose file in this repository publishes ports beyond the machine itself only through the Caddy reverse proxy in `docker-compose.prod.yml`. Ollama, Redis and the API are published on `127.0.0.1` or not at all, and CI fails a change that publishes them anywhere but on loopback. Read [Before you open Ollama to another machine](#before-you-open-ollama-to-another-machine) before changing that.

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

The API server adds SMS, Telegram and email alerts, Ollama scene analysis and multi-device sync. The web app connects to it from Settings, under Server Configuration.

### Production server with Docker Compose

This is the path the Settings panel's "Deploy your own server" step points to. It runs `docker-compose.prod.yml`: the API (the `backend` stage of the repository's `Dockerfile`), Ollama, a one-shot job that downloads the vision models, and Caddy, which serves the API over HTTPS with a Let's Encrypt certificate. Caddy is the only service with published ports (80 and 443). The API and Ollama are reached over the compose network and are not published at all.

**You need:** a Linux server with 8 GB of RAM or more (the production file caps Ollama at 6 GB, enough for the default `moondream` and `llava:7b`), a domain or subdomain you control, and SSH access to the server. The commands below are for Ubuntu 24.04 or Debian 12.

#### 1. Point the domain at the server

Create a DNS `A` record (and an `AAAA` record if the server has IPv6) for the API's name, for example `safeos-api.example.com`, pointing at the server's address. Caddy can only get a certificate once this name resolves to the server.

#### 2. Install Docker and close the firewall

Install Docker Engine 28 or later with the Compose plugin by following Docker's guide for your distribution: <https://docs.docker.com/engine/install/>. Let your SSH user run Docker without `sudo` (<https://docs.docker.com/engine/install/linux-postinstall/>), then log out and back in:

```bash
sudo usermod -aG docker "$USER"
```

Then confirm both are present:

```bash
docker --version
docker compose version
```

Allow only SSH, HTTP and HTTPS through the host firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Docker publishes container ports ahead of ufw's rules (Docker's documentation: "traffic to and from that container gets diverted before it goes through the ufw firewall settings", <https://docs.docker.com/engine/network/packet-filtering-firewalls/>). ufw therefore cannot close a port that a compose file publishes. That is why only Caddy publishes ports in `docker-compose.prod.yml`, and why CI rejects a compose file in which any other service publishes a port beyond loopback.

#### 3. Check the repository out

```bash
git clone https://github.com/framerslab/safeos.git
cd safeos
```

#### 4. Set the domain and the environment

```bash
cp .env.example .env
```

Edit `.env`. Docker Compose reads it from the project folder when it starts the stack.

| Variable | Set it to |
|---|---|
| `SAFEOS_DOMAIN` | The name from step 1, without `https://`, for example `safeos-api.example.com`. Caddy serves this name, and the API builds the unsubscribe links in its mail from it. Leaving the placeholder `safeos-api.yourdomain.com` means no certificate and no mail. |
| `CORS_ORIGIN` | The origin you serve the web app from (see [Connect the web app](#connect-the-web-app)), for example `https://safeos.example.com`. Caddy sends it as `Access-Control-Allow-Origin`. |
| `OLLAMA_MODELS` | The models to download on first start. The default `moondream llava:7b` is about 6 GB. |
| Alert keys (optional) | `RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_*`, `TELEGRAM_BOT_TOKEN`, `VAPID_*`: see [CONFIGURATION.md](./CONFIGURATION.md). |

`.env` holds secrets: keep it out of version control (the repository's `.gitignore` already excludes it) and readable only by you (`chmod 600 .env`).

#### 5. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first start builds the API image, starts Ollama, downloads the models and then starts the API and Caddy, in that order. The download takes several minutes. Follow it with:

```bash
docker compose -f docker-compose.prod.yml logs -f ollama-pull api caddy
```

On a server with an NVIDIA GPU and the NVIDIA Container Toolkit installed, add the GPU override:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d --build
```

#### 6. Check that it answers

```bash
docker compose -f docker-compose.prod.yml ps
curl https://safeos-api.example.com/health
# {"status":"ok","timestamp":"..."}
```

`ps` lists `safeos-api` as healthy and `safeos-caddy` as running. If `curl` fails with a certificate error, check that step 1's record resolves to this server and that ports 80 and 443 are open; `docker compose -f docker-compose.prod.yml logs caddy` shows the certificate request.

From another machine, confirm that only Caddy answers. These two requests must time out or be refused:

```bash
curl --max-time 5 http://safeos-api.example.com:3001/health
curl --max-time 5 http://safeos-api.example.com:11434/api/version
```

#### Connect the web app

The web app decides at load time whether it may use a server. The copy on safeos.sh, and any copy served from a `*.github.io`, `*.pages.dev`, `*.netlify.app` or `*.vercel.app` address, runs in browser-only mode and ignores a server URL entered in Settings. To use your server, serve your own build of the web app from a domain of your own:

```bash
cd apps/guardian-ui
npm ci
NEXT_PUBLIC_API_URL=https://safeos-api.example.com \
NEXT_PUBLIC_WS_URL=wss://safeos-api.example.com \
npm run build
```

Serve the resulting `out/` folder from that domain (for example `safeos.example.com`; see [Any Static Host](#any-static-host)), and set `CORS_ORIGIN` in step 4 to it. Leave `NEXT_PUBLIC_STATIC_MODE` unset. That build uses your server. Settings reports semantic analysis (Ollama) as unavailable, because that status is checked from the browser and Ollama is not published; do not publish Ollama to change that (see below).

#### Updating

```bash
cd safeos
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The SQLite database and the downloaded models live in named volumes (`safeos-data`, `ollama-models`) and survive the rebuild.

### One machine with Docker Compose

`docker-compose.yml` builds and runs the API, the web app, Ollama and the model download on one computer:

```bash
git clone https://github.com/framerslab/safeos.git
cd safeos
cp .env.example .env        # optional: fill in only the keys you want
docker compose up -d --build
```

Open <http://localhost:3000>. The web app, the API (`localhost:3001`) and Ollama (`localhost:11434`) are published on `127.0.0.1`, so they answer on this computer and on no other. That holds on Docker Engine 28 or later; in older releases, hosts on the same network segment can reach ports published to localhost (<https://docs.docker.com/engine/network/port-publishing/>). `docker-compose.ghcr.yml` does the same from the published images without building. [DOCKER.md](./DOCKER.md) has the details. To serve other devices, use the production server above.

### Local development

```bash
git clone https://github.com/framerslab/safeos.git
cd safeos
npm install --legacy-peer-deps
(cd apps/guardian-ui && npm ci)

# Start API + UI
npm run dev

# Or separately:
npm run api  # Port 3001
npm run ui   # Port 3000
```

See [DEVELOPMENT.md](./DEVELOPMENT.md).

### Without Docker (systemd)

The API runs its TypeScript sources through `tsx`. `npm run build` writes `dist/`, but that output does not run under `node` (the `Dockerfile` explains why), so no step here uses it. Install with the development dependencies, which carry `tsx`:

```bash
sudo useradd --system --home /opt/safeos --shell /usr/sbin/nologin safeos
sudo git clone https://github.com/framerslab/safeos.git /opt/safeos
sudo chown -R safeos:safeos /opt/safeos
cd /opt/safeos
sudo -u safeos -H npm install --legacy-peer-deps
```

```ini
# /etc/systemd/system/safeos.service
[Unit]
Description=SafeOS Guardian API
After=network.target

[Service]
Type=simple
User=safeos
WorkingDirectory=/opt/safeos
ExecStart=/usr/bin/env npm run start:api
Restart=on-failure
RestartSec=10
StateDirectory=safeos
Environment=NODE_ENV=production
Environment=SAFEOS_PORT=3001
Environment=SAFEOS_DB_PATH=/var/lib/safeos/safeos.sqlite3
Environment=OLLAMA_HOST=http://127.0.0.1:11434

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now safeos
curl http://localhost:3001/health
```

The API listens on every interface on `SAFEOS_PORT`. Without Docker, ufw does govern it: keep port 3001 closed (step 2's rules do) and serve it through Caddy or Nginx as shown under [HTTPS & Certificates](#https--certificates).

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

In the compose stacks, the `ollama-pull` service downloads the models in `OLLAMA_MODELS` for you.

### Docker with GPU

Apply `docker-compose.gpu.yml` on top of any of the compose files; it reserves the host's NVIDIA GPUs for the `ollama` service and publishes nothing:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

### Before you open Ollama to another machine

Ollama's API has no authentication. Anyone who can reach its port can list, download and delete models and run them on your hardware. Ollama binds `127.0.0.1:11434` by default, and setting `OLLAMA_HOST=0.0.0.0` opens it on every interface (<https://docs.ollama.com/faq>). In Docker, a published port also skips the host firewall, as step 2 above explains.

If another machine must use your Ollama, protect it first:

- Keep it bound to `127.0.0.1` and reach it from the other machine through an SSH tunnel (`ssh -N -L 11434:127.0.0.1:11434 you@server`) or a VPN such as WireGuard or Tailscale. Never publish it as `"11434:11434"` or on one of the server's own addresses.
- Or put it behind a reverse proxy that requires authentication over HTTPS, and publish only the proxy.
- On a native install without Docker, allow only the client machine's address through the firewall. A Docker-published port is not covered by ufw.

The compose check in CI fails any compose file in this repository in which a service other than the proxy publishes a port on anything but a loopback address (`127.0.0.0/8` or `::1`).

---

## HTTPS & Certificates

`docker-compose.prod.yml` already runs Caddy with the repository's `Caddyfile`; the examples below are for the API run without Docker.

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
curl http://localhost:3001/health          # one machine, or without Docker
curl https://safeos-api.example.com/health # production server, through Caddy
# {"status":"ok","timestamp":"..."}
```

### Ollama Check

```bash
curl http://localhost:11434/api/version                          # one machine, or a native install
docker compose -f docker-compose.prod.yml exec ollama ollama list # production server (Ollama is not published)
```

---

## Monitoring & Logs

### Docker Logs

```bash
docker compose -f docker-compose.prod.yml logs -f       # production server
docker compose logs -f                                  # one machine
docker logs safeos-api -f
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

### Session and monitoring profile upgrade

Production Compose gives Caddy `172.30.0.2` on a dedicated `172.30.0.0/24` proxy network and sets `SAFEOS_TRUST_PROXY` to that address. The API also joins the service network to reach Ollama. If that subnet overlaps your infrastructure, change the proxy network subnet, Caddy address and API trust setting together. Recreate the API and Caddy after changing the network. Other reverse proxies must use explicit IP addresses in `SAFEOS_TRUST_PROXY`; the previous hop-count setting `1` now trusts no proxy.

On startup, migrations create `active_monitoring_profiles` and import existing owned active choices once. Each person selects shared defaults independently; a previous global default selection cannot be attributed to a person and is not imported. Legacy custom monitoring profiles with no owner stay hidden until the operator assigns `monitoring_profiles.owner_id` to a `user_profiles.id`. Leave the three built-in default IDs unowned.

Email sign-in is mounted at `/api/auth/email`. Configure Resend and `SAFEOS_API_PUBLIC_URL` (https), or `SAFEOS_DOMAIN`, before offering registration. Verification and reset links are served by the same API, so the static frontend needs no account-link pages. Accounts require email verification; guest sessions remain available without mail. Existing email accounts get a persistent profile at first successful login. Resetting a password ends the account's existing sessions. A device ID cannot restore a guest profile without its live session token.

A successful guest resume rotates its token in place; clients must persist the returned token because the previous one stops working immediately. Email registration returns a generic response for both new and existing addresses. Password resets and changes enforce the registration password requirements. Account-link forms also support an API public URL with a path prefix.
