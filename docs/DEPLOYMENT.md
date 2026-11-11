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

The current adapter writes `db_data/app.sqlite3` relative to the API process's
working directory. For the systemd unit above that is
`/opt/safeos/db_data/app.sqlite3`; in the container it is
`/app/db_data/app.sqlite3` inside the mounted data volume. `SAFEOS_DB_PATH` is not
read by this version of the adapter setup and does not move the database.

Install the SQLite CLI. Run the following from the API working directory (or
from a directory containing the mounted `db_data` volume). `test -f` refuses to
create an empty database when the source path is wrong. SQLite's backup command
makes a consistent snapshot even when the live database uses WAL; do not copy
only a live database file.

```bash
set -eu
test -f db_data/app.sqlite3
mkdir -p backup
sqlite3 db_data/app.sqlite3 ".backup 'backup/safeos.sqlite3'"
sqlite3 backup/safeos.sqlite3 "PRAGMA integrity_check;"
```

Keep dated copies off the host and restrict access: a backup contains account
and session data and may contain frames still in the ten-minute buffer. Cleanup
in the running API does not delete frames from old backups. Use a separate
backup expiration policy and periodically exercise the restore procedure.

### Database Restore

Stop the API before restoring (`sudo systemctl stop safeos`, or stop the API
container). Preserve the existing data directory as a rollback copy, including
any `-wal` and `-shm` sidecars. Run these commands from the API working directory
with the backup file available at `backup/safeos.sqlite3`. They also work when
the destination database does not exist yet.

```bash
set -eu
test -f backup/safeos.sqlite3
mkdir -p db_data
test "$(sqlite3 backup/safeos.sqlite3 'PRAGMA integrity_check;')" = ok
sqlite3 db_data/app.sqlite3 ".restore 'backup/safeos.sqlite3'"
test "$(sqlite3 db_data/app.sqlite3 'PRAGMA integrity_check;')" = ok
```

Restore ownership of `db_data` to the API service user, then start the API again.
Startup runs migrations and purges expired frames before accepting traffic.
Verify `/health`, sign in, and check a known stream through `/api/streams` before
retiring the rollback copy. CI creates a stream through HTTP, executes these
backup commands, restores into a fresh file and reads the stream through HTTP.

### Docker named-volume backup and restore

Run these commands in Bash from the directory containing the Compose files.
Select the same setup and project options used to create the running API:

```bash
# Local build:
SAFEOS_COMPOSE=(docker compose -f docker-compose.yml)
# Prebuilt images: use this instead of the line above.
# SAFEOS_COMPOSE=(docker compose -f docker-compose.ghcr.yml)
# Production: use this instead.
# SAFEOS_COMPOSE=(docker compose -f docker-compose.prod.yml)
# Local build with the GPU override: use this instead.
# SAFEOS_COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.gpu.yml)
# Prebuilt images with the GPU override: use this instead.
# SAFEOS_COMPOSE=(docker compose -f docker-compose.ghcr.yml -f docker-compose.gpu.yml)
```

Each base file mounts the `safeos-data` volume at `/app/db_data`. The local and
prebuilt files declare project name `safeos`, so their default volume name is
`safeos_safeos-data`. Production uses Compose's project name (normally the
checkout directory name), giving `<project>_safeos-data`. A `-p` option or
`COMPOSE_PROJECT_NAME` changes that prefix. Include any original `-p` option in
`SAFEOS_COMPOSE`. The GPU override only changes Ollama's devices.

Read the actual volume name from the selected API container. This also handles
custom project names and refuses to create a new, empty source volume:

```bash
set -eu
SAFEOS_API_CONTAINER=$("${SAFEOS_COMPOSE[@]}" ps -aq api)
test -n "$SAFEOS_API_CONTAINER"
SAFEOS_DATA_VOLUME=$(docker inspect "$SAFEOS_API_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/db_data"}}{{.Name}}{{end}}{{end}}')
test -n "$SAFEOS_DATA_VOLUME"
docker volume inspect "$SAFEOS_DATA_VOLUME" >/dev/null
mkdir -p backup
SAFEOS_BACKUP_DIR=$(cd backup && pwd)
```

The backend Dockerfile uses `/app` as its working directory and installs the
SQLite runtime libraries, but not the `sqlite3` CLI. A temporary Alpine helper
installs the CLI and mounts the existing volume. The database in that volume is
`app.sqlite3`, despite the unused `SAFEOS_DB_PATH` setting in Compose.

For backup, stop the selected API, make a consistent SQLite snapshot, then
restart that API. Ollama and the UI can stay running. The helper needs network
access to install SQLite. If any command fails, leave the API stopped until the
failure is understood.

```bash
"${SAFEOS_COMPOSE[@]}" stop api
docker run --rm \
  --mount "type=volume,src=$SAFEOS_DATA_VOLUME,dst=/data" \
  --mount "type=bind,src=$SAFEOS_BACKUP_DIR,dst=/backup" \
  alpine:3 sh -eu -c '
    apk add --no-cache sqlite >/dev/null
    test -f /data/app.sqlite3
    test ! -e /backup/safeos.sqlite3
    sqlite3 /data/app.sqlite3 ".backup /backup/safeos.sqlite3"
    test "$(sqlite3 /backup/safeos.sqlite3 "PRAGMA integrity_check;")" = ok
    chmod 600 /backup/safeos.sqlite3
  '
"${SAFEOS_COMPOSE[@]}" start api
```

Move the previous `backup/safeos.sqlite3` to a dated, protected location before
the next backup. To restore, select the same Compose setup and resolve its volume
as above. Place the chosen snapshot at `backup/safeos.sqlite3`. The following
preserves the stopped volume, including any WAL sidecars, in a unique rollback
archive before restoring. It refuses a missing or invalid snapshot.

```bash
"${SAFEOS_COMPOSE[@]}" stop api
docker run --rm \
  --mount "type=volume,src=$SAFEOS_DATA_VOLUME,dst=/data" \
  --mount "type=bind,src=$SAFEOS_BACKUP_DIR,dst=/backup" \
  alpine:3 sh -eu -c '
    apk add --no-cache sqlite >/dev/null
    test -f /backup/safeos.sqlite3
    test "$(sqlite3 /backup/safeos.sqlite3 "PRAGMA integrity_check;")" = ok
    rollback=$(mktemp /backup/before-restore.XXXXXX.tar)
    tar -C /data -cf "$rollback" .
    chmod 600 "$rollback"
    sqlite3 /data/app.sqlite3 ".restore /backup/safeos.sqlite3"
    test "$(sqlite3 /data/app.sqlite3 "PRAGMA integrity_check;")" = ok
  '
"${SAFEOS_COMPOSE[@]}" start api
"${SAFEOS_COMPOSE[@]}" exec -T api wget -q -O - http://localhost:3001/health
```

The supplied backend runs as root, matching the helper's file ownership. If you
have customized the API user, restore that user's ownership before restarting.
Check a known stream through the API before removing the rollback archive.
These Docker commands were traced against all Compose files and the Dockerfile;
they have not been run, and CI does not execute them. The separate host SQLite
backup/restore commands above are exercised in CI.

### Automated Backup Script

For the systemd installation, run as a user with access to both directories.
Install `sqlite3` on the host first. For containers, use the named-volume
procedure above instead of this host-path script.

```bash
#!/bin/bash
set -eu
SOURCE_DB=/opt/safeos/db_data/app.sqlite3
BACKUP_DIR=/backups/safeos
STAMP=$(date -u +%Y%m%d_%H%M%S)

test -f "$SOURCE_DB"
mkdir -p "$BACKUP_DIR"
sqlite3 "$SOURCE_DB" ".backup '$BACKUP_DIR/safeos-$STAMP.sqlite3'"
gzip "$BACKUP_DIR/safeos-$STAMP.sqlite3"

# Keep only the agreed seven-day backup window.
find "$BACKUP_DIR" -name 'safeos-*.sqlite3.gz' -mtime +7 -delete
```

Decompress a selected dated backup to `backup/safeos.sqlite3` before following the
restore procedure. The script does not schedule itself or copy data off-host;
configure those steps in the deployment's backup service.

---

## See Also

- [Configuration Reference](./CONFIGURATION.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
