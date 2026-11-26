# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to: **security@frame.dev**

We will answer as soon as we can and keep you updated while we look into it.

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## What runs where

### In the browser

- Motion and sound compares camera frames and measures sound levels in the browser. That page runs no model.
- People and Wildlife run the COCO-SSD detection model with TensorFlow.js in the browser, and send nothing to a server.
- The browser downloads the detection model from Google's storage (`storage.googleapis.com`) only after you agree to it, and Google sees your IP address when it does.
- safeos.sh is hosted on GitHub Pages, which logs each visitor's IP address ([GitHub's words](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection)).
- People, Wildlife and Lost & Found speak their alerts through one of the browser's voices (Lost & Found while Image Flash Overlay shows the pet's photos). Some voices are an online service run by the browser's maker, which receives the words to speak: in Chrome, the voices named Google are ([Chromium's source](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/network_speech_synthesis/manifest.json)).
- The app loads no analytics or tracking script.

### With a server you run

- Once a server address is saved and the processing mode uses it, the monitor sends camera frames to that server over a WebSocket.
- The server analyses those frames with Ollama. With a cloud AI key set, it sends a frame to that provider when Ollama is down or its analysis fails.

## Data storage

- The browser keeps the settings, alerts, saved frames, pets and recorded sounds in its own storage for this site (localStorage and IndexedDB), and the detection model in its Cache Storage. The [privacy page](https://safeos.sh/privacy/) says which store keeps what.
- Anyone who can open SafeOS in this browser can see what it keeps.
- A server you run keeps its records in its own SQLite database, on that server.

## Authentication (server)

- Passwords are hashed with scrypt at Node's default cost (N=16384, r=8, p=1, [Node's documentation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)), with a 16-byte random salt and a 64-byte key.
- An account's session token is 32 random bytes from `crypto.randomBytes`; a guest session's token is a random UUID from `crypto.randomUUID`. Both sessions end after 30 days.
- The sign-in routes (`/api/auth` and `/api/auth/email`) allow five failed requests a minute from one address.
- WebSocket clients authenticate in their first message, or with the session header when they connect. A socket with no session after five seconds is closed.

## Network

- The server's CORS answers tell a browser which web pages may read its replies. An answer names the page's origin only when that origin is allowed. With `SAFEOS_ALLOWED_ORIGINS` unset or empty, the allowed origins are the hosted app (`https://safeos.sh`), the phone app shells (`capacitor://localhost` and `https://localhost`, from `capacitor.config.ts`) and `http://localhost`, `http://127.0.0.1` and `http://[::1]` at any port. Set `SAFEOS_ALLOWED_ORIGINS` to a comma-separated list, for example `https://safeos.example.com`, to allow those origins and no other. A page served from the server's own address needs no CORS answer.
- To have a proxy decide instead, put the server behind it and publish only the proxy. The bundled Caddy (`docker-compose.prod.yml`) answers preflight requests itself and sends the one origin in `CORS_ORIGIN` on every answer, in place of the server's own header.
- The app saves any server address it is given and does not require https. Serve your server over https, and its WebSocket over wss: the bundled Caddy gets a certificate for `SAFEOS_DOMAIN` (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- `docker-compose.prod.yml` publishes only Caddy's ports, 80 and 443.

## Best Practices

1. **Keep dependencies updated** - Run `npm audit` regularly
2. **Use https** - Serve the server only over https and wss
3. **Allow only your web app's origin** - Set `SAFEOS_ALLOWED_ORIGINS`, or `CORS_ORIGIN` behind the bundled Caddy, to the origin you serve the web app from
4. **Monitor logs** - Check for unusual access patterns
5. **Back up the server** - Follow the backup steps in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Known Limitations

- Service workers, which keep the app working offline, run only in a secure context such as an https address ([the specification](https://w3c.github.io/ServiceWorker/#secure-context)).

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities.
