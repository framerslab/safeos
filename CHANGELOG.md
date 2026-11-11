# Changelog

All notable changes to SafeOS Guardian will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Every mail the API server sends (alerts, the settings test message, account verification, password reset) ends with a visible Unsubscribe link and carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- `GET /api/mail/unsubscribe/:token` shows a page that asks and changes nothing; `POST` stops the mail at once (a blank `200` for a mailbox's one-click POST). No mail is sent to confirm an unsubscribe.
- A suppression list in the SafeOS database, read before every send. It stores only SHA-256 hashes of addresses and tokens.
- `src/cli/mail-suppress.ts` stops all mail, account mail included, to the addresses piped into it; with `--resubscribe` it lifts the unsubscribes of a person who asks for mail again (manual stops stay).
- `EmailSendError` lists the recipients that already got a mail when a send fails part-way.
- The API request log and the bundled Caddy access log print `[token]` in place of an unsubscribe token.
- `SAFEOS_API_PUBLIC_URL`: the https address the unsubscribe link points at (falls back to `https://SAFEOS_DOMAIN`).

### Changed
- Without an https address for the unsubscribe link the server sends no mail; `/api/notifications/test-email` answers `400` with the setting to add, and `409` for an address that unsubscribed.
- A mail to several recipients goes out as one mail per recipient, each with its own link.
- Footer and fine-print text in every mail is 13px or larger.
- Upgrading needs operator steps, in order: [Upgrading to the proxy network and per-person profile choices](docs/DEPLOYMENT.md#upgrading-to-the-proxy-network-and-per-person-profile-choices).
- `SAFEOS_TRUST_PROXY` takes exact proxy IP addresses only; a hop count, a range or an invalid value trusts no proxy. The production compose file puts Caddy at `172.30.0.2` on its own `proxy-network`, whose other containers get addresses from `172.30.0.128/25`.
- Each person has their own active monitoring profile per scenario, built-in defaults included. Monitoring profiles with no owner other than the three built-in defaults are hidden until the operator assigns an owner.
- Resuming a guest profile with `POST /api/auth/session` needs that session's live token for the same device; the token is replaced in place.

### Fixed
- Browser clients retry recoverable socket policy closes, preserve one opening socket, and ignore events from replaced sockets.
- Browser push preserves registrations owned by another live session. The 32-endpoint limit counts live registrations only, and every session-removal path removes its push registrations.
- Telegram availability reflects the caller's saved personal bot token, with settings and setup guidance describing the same delivery rule.
- Socket frames and queued delivery require an active owned stream; restarting the API retains the socket payload limit, and repeated startup leaves live work intact.
- Alert delivery starts a five-minute cooldown only after a channel succeeds. Each channel has a 15-second deadline; critical alerts bypass the 32-delivery capacity check. Quiet hours skip low and medium delivery in the saved local time zone and chosen days without deferring it; high and critical alerts always go out.
- Only reviewers and operators can change a banned stream status.
- Startup recovers interrupted analysis jobs without duplicating saved results or alerts.
- Provider secrets are write-only in profile, session and export responses. Push unsubscribe preserves other devices, and notification settings requests carry the session token.
- The legacy-profile upgrade command opens `app.sqlite3`, matching the adapter. Image jobs stop after 30 minutes.
- The Resend idempotency key went out as a header inside the mail, where Resend ignores it; it is now sent as the request's `Idempotency-Key`.
- The pull request preview comment job can write its comment, and skips pull requests from forks, whose token is read-only.
- The production compose file passes `SAFEOS_DOMAIN` and `CORS_ORIGIN` to Caddy, which serves `{$SAFEOS_DOMAIN}`.
- `GET /api/auth/session` and the profile routes read the stored session row, so a returning guest gets their profile, `isGuest` and `expiresAt` back.
- Email sign-in is mounted at `/api/auth/email`; its sessions carry a profile, its links open forms served by the API, and a password reset ends the account's other sessions.

## [0.1.0] - 2025-01-08

### Added
- Initial release of SafeOS Guardian
- **Local-First AI Monitoring**
  - TensorFlow.js COCO-SSD for person and animal detection
  - Transformers.js for enhanced vision analysis (browser-based)
  - Motion detection with configurable sensitivity
  - Audio pattern detection (crying, barking, glass breaking)
- **Privacy-Focused Design**
  - All processing happens locally in the browser
  - No server required for core functionality
  - IndexedDB for offline data storage
- **PWA Support**
  - Install as native app on any device
  - Full offline functionality via Service Worker
  - Web Push notifications for alerts
- **Deployment Options**
  - GitHub Pages static deployment (free)
  - Optional Linode backend for cloud sync
  - Docker Compose production configuration
- **Alert System**
  - Visual fingerprinting for subject recognition
  - Configurable alert thresholds
  - Escalating audio alerts
  - Local alert history with IndexedDB
- **Multi-Scenario Support**
  - Baby monitoring mode
  - Pet monitoring mode
  - Elderly care mode
  - Security monitoring mode

### Security
- Local-only data storage by default
- Optional encrypted cloud sync
- No third-party analytics or tracking
