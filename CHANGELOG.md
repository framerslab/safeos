# Changelog

All notable changes to SafeOS Guardian will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Every mail the API server sends (alerts, the settings test message, account verification, password reset) ends with a visible Unsubscribe link and carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- `GET /api/mail/unsubscribe/:token` shows a page that asks and changes nothing; `POST` stops the mail at once (a blank `200` for a mailbox's one-click POST). No mail is sent to confirm an unsubscribe.
- A suppression list in the SafeOS database, read before every send. It stores only SHA-256 hashes of addresses and tokens.
- `src/cli/mail-suppress.ts` stops all mail, account mail included, to the addresses piped into it.
- `SAFEOS_API_PUBLIC_URL`: the https address the unsubscribe link points at (falls back to `https://SAFEOS_DOMAIN`).

### Changed
- Without an https address for the unsubscribe link the server sends no mail; `/api/notifications/test-email` answers `400` with the setting to add, and `409` for an address that unsubscribed.
- A mail to several recipients goes out as one mail per recipient, each with its own link.
- Footer and fine-print text in every mail is 13px or larger.

### Fixed
- The Resend idempotency key went out as a header inside the mail, where Resend ignores it; it is now sent as the request's `Idempotency-Key`.
- The pull request preview comment job can write its comment.

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
