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

For the first upgrade to per-person profile choices, follow the ordered steps below before starting the new release. For later updates:

```bash
cd safeos
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The SQLite database and the downloaded models live in named volumes (`safeos-data`, `ollama-models`) and survive the rebuild.

##### Upgrading to the proxy network and per-person profile choices

This release moves Caddy onto a proxy network of its own, keeps each person's active monitoring profile apart from everyone else's, hides monitoring profiles that have no owner, and mounts email sign-in. Upgrade a server that runs an earlier release in this order.

1. **Back up the database.** From the repository directory, stop Caddy and the API and archive the data volume outside it. Keep this shell open for the remaining steps:

   ```bash
   backup_dir="$(pwd)/../safeos-backups/$(date -u +%Y%m%dT%H%M%SZ)"
   mkdir -p "$backup_dir"
   chmod 700 "$backup_dir"
   git rev-parse HEAD > "$backup_dir/revision"
   cp docker-compose.prod.yml .env "$backup_dir/"
   docker compose -f docker-compose.prod.yml stop caddy api
   docker run --rm --volumes-from safeos-api:ro alpine:3.20 \
     tar -C /app/db_data -czf - . > "$backup_dir/database.tar.gz"
   ```

2. **Pull the release and check the proxy subnet.** The production file creates `proxy-network` on `172.30.0.0/24`, gives Caddy `172.30.0.2` and hands other containers addresses from `172.30.0.128/25` only. The API trusts a forwarded client address only from `172.30.0.2` (`SAFEOS_TRUST_PROXY`). Inspect host routes and existing Docker networks with the commands below. If another network overlaps this subnet, change the subnet, the `ip_range`, Caddy's `ipv4_address` and `SAFEOS_TRUST_PROXY` together in `docker-compose.prod.yml`. The dynamic range must exclude Caddy's address.

   ```bash
   git pull
   ip -4 route
   docker network ls -q | xargs -r docker network inspect \
     --format '{{.Name}} {{json .IPAM.Config}}'
   ${EDITOR:-vi} docker-compose.prod.yml
   ```

3. **Recreate the API and Caddy.** Remove the old Compose containers and networks, keeping named volumes, then recreate the stack. This also replaces an existing proxy network whose allocation range has changed. On first start the API copies each person's own active monitoring profile into the new per-person table:

   ```bash
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml ps
   docker inspect safeos-caddy --format '{{range $n, $c := .NetworkSettings.Networks}}{{$n}} {{$c.IPAddress}}{{"\n"}}{{end}}'
   ```

   Check that the API is healthy and Caddy is running. The last command must list a network ending in `_proxy-network` with `172.30.0.2` (or the address chosen in step 2). Its prefix is the Compose project name. Never add `--volumes` to `down` during an upgrade. A server that runs the API behind another proxy sets `SAFEOS_TRUST_PROXY` to that proxy's exact IP addresses, comma-separated; the earlier hop count `1` now trusts no proxy, so every client would share the proxy's rate limit.

4. **Assign an owner to each monitoring profile that has none.** Profiles created before profiles had owners stay hidden from everyone, the operator included, until they have one. Open the database:

   ```bash
   docker run --rm -it --volumes-from safeos-api alpine:3.20 \
     sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /app/db_data/safeos.sqlite3'
   ```

   List them, then give each to the person it belongs to. A person's profile id is the `id` that `GET /api/auth/profile` returns for their session.

   ```sql
   SELECT id, name, scenario, created_at FROM monitoring_profiles
   WHERE owner_id IS NULL
     AND id NOT IN ('profile-baby-default', 'profile-pet-default', 'profile-elderly-default');

   UPDATE monitoring_profiles SET owner_id = '<user profile id>'
   WHERE id = '<monitoring profile id>' AND owner_id IS NULL
     AND id NOT IN ('profile-baby-default', 'profile-pet-default', 'profile-elderly-default')
     AND EXISTS (SELECT 1 FROM user_profiles WHERE id = '<user profile id>');

   .quit
   ```

   Replace both placeholders with the selected IDs before running the update. Leave the three built-in defaults without an owner. A profile nobody claims stays hidden. Active choices for owners that no longer exist are not imported; choices for existing owners carry over.

5. **Ask people to choose their shared default again.** A person's own active custom profile carries over. The earlier release kept one active flag on each built-in default for everyone, which names nobody, so it is not carried over: each person selects the built-in default they want once. Each person can use their own session token with the API:

   ```bash
   read -r -p 'Public API base URL (https): ' api_url
   read -r -s -p 'Your session token: ' session_token; printf '\n'
   read -r -p 'Default profile ID (profile-baby-default, profile-pet-default or profile-elderly-default): ' profile_id
   curl --fail-with-body -X POST -H "X-Session-Token: $session_token" \
     "${api_url%/}/api/profiles/$profile_id/activate"
   unset session_token
   ```

6. **Configure account mail before offering email sign-up.** Email sign-in is served at `/api/auth/email`, and its verification and reset links point at this API (`<api>/api/auth/email/verify` and `/reset-password`), not at the web app. Set `RESEND_API_KEY`, `EMAIL_FROM` and an https `SAFEOS_API_PUBLIC_URL` (or `SAFEOS_DOMAIN`) in `.env`, then run `docker compose -f docker-compose.prod.yml up -d`. Without them the server sends no account mail, and an account registered meanwhile cannot be verified. Guest sessions need no mail.

   ```bash
   ${EDITOR:-vi} .env
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml ps
   ```

Keep the backup archive, saved revision, Compose file and environment file until the upgrade is accepted. A rollback must stop the API and restore the whole data volume from that archive along with the saved release and configuration; do not mix a restored database with newer SQLite journal files.

A successful guest resume rotates its token in place; clients must persist the returned token because the previous one stops working immediately. Email registration returns a generic response for both new and existing addresses. Password resets and changes enforce the registration password requirements. Account-link forms support an API public URL with a path prefix. Existing email accounts receive a persistent profile at their first successful login; password resets end the account's existing sessions.

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

Install Bash and the SQLite CLI. Run the host commands as the service user
(`sudo -u safeos -H bash`, then `cd /opt/safeos`) or as root, with write access
to the working directory and `db_data`. Run from the API working directory (or
from a directory containing the mounted `db_data` volume). `test -s` refuses to
create an empty database when the source path is wrong. SQLite's backup command
makes a consistent snapshot even when the live database uses WAL; do not copy
only a live database file.

```bash
set -eu
umask 077
test -s db_data/app.sqlite3
mkdir -p backup
chmod 700 backup
if test -e backup/safeos.sqlite3; then chmod 600 backup/safeos.sqlite3; fi
sqlite3 db_data/app.sqlite3 ".backup 'backup/safeos.sqlite3'"
test "$(sqlite3 backup/safeos.sqlite3 'PRAGMA integrity_check;')" = ok
chmod 600 backup/safeos.sqlite3
```

Keep dated copies off the host and restrict access: a backup contains account
and session data and may contain frames still in the ten-minute buffer. Cleanup
in the running API does not delete frames from old backups. Use a separate
backup expiration policy and periodically exercise the restore procedure.

### Database Restore

Stop the API before restoring (`sudo systemctl stop safeos`, or stop the API
container). Preserve the existing data directory as a rollback copy, including
any `-wal` and `-shm` sidecars. Run these commands from the API working directory
with the backup file available at `backup/safeos.sqlite3`. The commands reject empty or unrelated snapshots before moving the existing
database and sidecars into a private rollback directory. They restore into a
fresh file, including when the previous database is corrupt or missing.

```bash
set -eu
umask 077
test -s backup/safeos.sqlite3
chmod 700 backup
chmod 600 backup/safeos.sqlite3
test "$(sqlite3 backup/safeos.sqlite3 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 backup/safeos.sqlite3 "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('user_profiles','streams','alerts','analysis_queue');")" = 4
mkdir -p db_data
chmod 700 db_data
rollback=$(mktemp -d backup/before-restore.XXXXXX)
for file in app.sqlite3 app.sqlite3-wal app.sqlite3-shm; do
  if test -e "db_data/$file"; then mv "db_data/$file" "$rollback/$file"; fi
done
sqlite3 db_data/app.sqlite3 ".restore 'backup/safeos.sqlite3'"
test "$(sqlite3 db_data/app.sqlite3 'PRAGMA integrity_check;')" = ok
chmod 600 db_data/app.sqlite3
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
umask 077
SAFEOS_API_CONTAINER=$("${SAFEOS_COMPOSE[@]}" ps -aq api)
test -n "$SAFEOS_API_CONTAINER"
SAFEOS_DATA_VOLUME=$(docker inspect "$SAFEOS_API_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/db_data"}}{{.Name}}{{end}}{{end}}')
test -n "$SAFEOS_DATA_VOLUME"
docker volume inspect "$SAFEOS_DATA_VOLUME" >/dev/null
mkdir -p backup
chmod 700 backup
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
docker run --rm -i \
  --mount "type=volume,src=$SAFEOS_DATA_VOLUME,dst=/data" \
  --mount "type=bind,src=$SAFEOS_BACKUP_DIR,dst=/backup" \
  alpine:3 sh -eu <<'SAFEOS_SQLITE'
    umask 077
    chmod 700 /backup
    apk add --no-cache sqlite >/dev/null
    test -s /data/app.sqlite3
    test ! -e /backup/safeos.sqlite3
    sqlite3 /data/app.sqlite3 ".backup /backup/safeos.sqlite3"
    test "$(sqlite3 /backup/safeos.sqlite3 "PRAGMA integrity_check;")" = ok
    chmod 600 /backup/safeos.sqlite3
SAFEOS_SQLITE
"${SAFEOS_COMPOSE[@]}" start api
```

Move the previous `backup/safeos.sqlite3` to a dated, protected location before
the next backup. To restore, select the same Compose setup and resolve its volume
as above. Place the chosen snapshot at `backup/safeos.sqlite3`. The following
preserves the stopped volume, including any WAL sidecars, in a unique rollback
archive before restoring. It refuses a missing, empty, unrelated or invalid snapshot before changing the
volume. After archiving, it removes the old database and sidecars so a damaged
destination cannot prevent restoration into a fresh file.

```bash
"${SAFEOS_COMPOSE[@]}" stop api
docker run --rm -i \
  --mount "type=volume,src=$SAFEOS_DATA_VOLUME,dst=/data" \
  --mount "type=bind,src=$SAFEOS_BACKUP_DIR,dst=/backup" \
  alpine:3 sh -eu <<'SAFEOS_SQLITE'
    umask 077
    chmod 700 /backup
    apk add --no-cache sqlite >/dev/null
    test -s /backup/safeos.sqlite3
    chmod 600 /backup/safeos.sqlite3
    test "$(sqlite3 /backup/safeos.sqlite3 "PRAGMA integrity_check;")" = ok
    test "$(sqlite3 /backup/safeos.sqlite3 "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('user_profiles','streams','alerts','analysis_queue');")" = 4
    rollback=$(mktemp /backup/before-restore.XXXXXX)
    tar -C /data -cf "$rollback" .
    chmod 600 "$rollback"
    rm -f /data/app.sqlite3 /data/app.sqlite3-wal /data/app.sqlite3-shm
    sqlite3 /data/app.sqlite3 ".restore /backup/safeos.sqlite3"
    test "$(sqlite3 /data/app.sqlite3 "PRAGMA integrity_check;")" = ok
    chmod 600 /data/app.sqlite3
SAFEOS_SQLITE
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

For the systemd installation, provision `/backups/safeos` for the `safeos`
service user and run as that user (or root), with write access to both directories.
The script validates each snapshot before compression or expiration of older
backups; a failed check leaves older copies in place.
Install `sqlite3` on the host first. For containers, use the named-volume
procedure above instead of this host-path script.

```bash
#!/bin/bash
set -eu
umask 077
SOURCE_DB=/opt/safeos/db_data/app.sqlite3
BACKUP_DIR=/backups/safeos
STAMP=$(date -u +%Y%m%d_%H%M%S)

test -s "$SOURCE_DB"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
find "$BACKUP_DIR" -type f -name 'safeos-*' -exec chmod 600 {} +
test ! -e "$BACKUP_DIR/safeos-$STAMP.sqlite3"
test ! -e "$BACKUP_DIR/safeos-$STAMP.sqlite3.gz"
sqlite3 "$SOURCE_DB" ".backup '$BACKUP_DIR/safeos-$STAMP.sqlite3'"
test "$(sqlite3 "$BACKUP_DIR/safeos-$STAMP.sqlite3" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$BACKUP_DIR/safeos-$STAMP.sqlite3" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('user_profiles','streams','alerts','analysis_queue');")" = 4
gzip "$BACKUP_DIR/safeos-$STAMP.sqlite3"
chmod 600 "$BACKUP_DIR/safeos-$STAMP.sqlite3.gz"

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
