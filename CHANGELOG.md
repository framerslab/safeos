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
- The site title, description, social card and manifest describe motion and sound alerts in the browser; the word AI is kept for the Security and Wildlife detectors, which run COCO-SSD. Every public page, Security, Lost & Found and Setup included, has its own title, description, canonical address and social card, and the old support address asks search engines not to index it.
- safeos.sh asks for no money: the page that asked for it, its header button and its wording are gone, `/donate` is a short page that says SafeOS is free and moves on to About, and the free promise is scoped to safeos.sh and the MIT-licensed code. The notice about a future paid service is gone.
- The footer links Privacy and Terms on every page. The Privacy page says how the site treats Do Not Track and Global Privacy Control, that GitHub Pages logs visitors' IP addresses, and who operates safeos.sh.
- The sitemap lists `/tutorial` and the integration guides and leaves out the old support address.
- Below 1280 px the header keeps the logo, the theme button, the bell and the menu in one row of 44 px targets; the page links, GitHub and keyboard shortcuts are in the menu.
- The notification prompt waits until setup is finished, and appears once it is, with no reload.
- The header menu scrolls inside itself on a short screen, Escape closes it, and focus goes back to the Menu button when it closes.
- The home page's Security card opens the Security page, and the other quick-start links name only presets that exist.
- Lost & Found offers a pet or an item; subjects saved with the person type keep showing. The processing choice that only slowed the same matcher is gone.

### Fixed
- A queued action the server confirmed and the browser could not save keeps the server's answer and counts no failed try. The next sync applies that answer without a new request, and the five-try limit does not drop it; if the queue cannot be written either, the action stays as it was.
- A failed acknowledgement of a saved engine alert is retried with no clear stamp, so Clear all in any tab, which keeps engine alerts, does not cancel it. After Clear All Local Data or a sign-out the record is gone, and the retry writes nothing.
- Privacy distinguishes browser records from records kept on a configured server; clearing browser data or signing out does not delete server records.
- Browser alert history belongs to the browser: every page and tab shows the same saved alerts in any load order, whatever session is current, until someone signs out or clears local data. Alerts saved before this version stay until dismissed or cleared, whatever their date, outside the limits; later alerts are limited to 100 monitoring alerts and 500 overall, acknowledged ones leaving first, oldest first. No alert is removed for its age. Tabs still open from the previous version keep its 100-alert monitoring limit until they are closed or reloaded; the upgrade protects the records that exist when it runs. Acknowledgements and later writes keep an alert's media, creation time and protection; ids made in the browser carry a random part.
- A failed history read keeps the alerts on screen, and a failed save keeps the alert on screen and retries at the next read; an acknowledgement updates a pending save, and dismiss and clear drop it. An acknowledgement never puts back an alert that is no longer saved: the alert leaves that tab's list instead. Clear All Local Data, a sign-out or Clear all in any tab cancels every tab's pending saves: each clear writes a new clear generation in the database, and a retry writes only when it finds the generation its save holds or, for a save that holds none, the same marker in local storage; a browser that shows another tab's local storage write a moment late leaves a race in the instant of a clear. The upgrade keeps an unreadable creation date beside a usable one; if it cannot finish it changes nothing and the page says so. The alert engine alerts first and saves afterwards, and an acknowledgement made as the alert arrives is saved.
- A tab closes its database connection when a newer version opens in another tab, a tab held back by an older tab says so instead of waiting, and a database newer than the tab's code asks for a reload too. These notices ask for a reload and say what is paused until then. Whenever the database cannot be opened, a tab that holds a session for a configured server keeps it and makes no new one, also when a session request was already in flight; a tab that holds none, or whose session the server has ended, makes one. A session that ran out on this device just as a notice came is kept too, and the server's alerts pause in that tab until it is reloaded. Reload guidance remains readable in both light and dark looks.
- Profile and full exports omit unreadable or non-object monitoring and user notification settings, report separate omission counts, and leave stored rows unchanged. The export page reports both kinds of omissions and states the single-kind record limits. Export guidance distinguishes notification-setting merges from whole monitoring-setting replacements.
- Full server exports keep the newest limited rows and include total, included and truncated counts for streams, alerts and analysis results. Both profile and full exports redact provider credentials from monitoring settings while preserving readable settings' JSON-string format and stored values.
- Profile and full exports include owned monitoring profiles and personal active choices by ownership, with matching export guidance and documented record limits. Profiles with unreadable settings remain included with null settings and a count of omitted settings; exporting leaves stored rows unchanged.
- Full-export lists and their totals use the same database statement during monitoring writes. Profile and full downloads report omitted unreadable settings on the export page.
- Push registration verifies the incoming session's live profile binding in the same write that saves the registration.
- Before-and-after picture capture also runs when a pull request opens.
- The public pages say what the code does: the Lost & Found matcher compares colours, a coarse edge grid and size on your own camera, so anything of similar colour can match; the browser keeps three frames; the sound alert is a loudness threshold; Wildlife knows ten kinds of animal and saves still frames; the detection model is 18.6 MB everywhere; the blog post describes only code the app runs. Security's model runs on movement, and every five seconds while an alert is on. Setup's scenario cards, the status banner, the Resend and Ollama guides, Privacy and the README say the same.
- The pages claim only the alerts that run: motion, sound level and an optional no-movement alert. Pages that name babies carry the safe-sleep statement and link the NIH safe-sleep page; pages that describe watching another adult say to ask first. The setup notice and the footer status line make no claim the site cannot back.
- Help and Tutorials give the sensitivity direction the monitor uses: a higher sensitivity means a lower threshold and more alerts.
- The theme button changes the page on a device set to light; before, the theme store failed to hydrate there and the button changed only its icon.
- From about 800 to 1100 px the header no longer runs off the screen and hides its controls.
- The home hero's "Guardian", the feature-card tags and setup's warning heading reach 4.5 to 1 contrast in the light look.
- A missing address shows a not-found page in the site's own look with a way home.
- Help's empty video block is gone, and its email address is the team@frame.dev every other page gives.
- Telegram text and photo requests close after 15 seconds of transport inactivity.
- Reviewers and operators can restore another owner's banned stream through the status PATCH route without gaining owner access to reads, deletion or sockets. Non-owner updates require a status and return only the stream id and status; owner responses are unchanged.
- Settings, notification settings, scheduling and email setup guidance describe high and critical alerts as bypassing quiet hours without promising delivery.
- Browser clients retry recoverable socket policy closes, preserve one opening socket, and ignore events from replaced sockets.
- Browser push preserves registrations owned by another live session. The 32-endpoint limit counts live registrations only, and every session-removal path removes its push registrations.
- Telegram availability reflects the caller's saved personal bot token, with settings and setup guidance describing the same delivery rule.
- Socket frames and queued delivery require an active owned stream; restarting the API retains the socket payload limit, and repeated startup leaves live work intact.
- Alert delivery starts a five-minute cooldown only after a channel succeeds. Each channel has a 15-second deadline; critical alerts bypass the 32-delivery capacity check. Quiet hours skip low and medium delivery in the saved local time zone and chosen days without deferring it; high and critical alerts bypass quiet hours.
- Only reviewers and operators can change a banned stream status.
- Startup recovers interrupted analysis jobs without duplicating saved results or alerts.
- Provider secrets are write-only in profile, session and export responses. Push unsubscribe preserves other devices, and notification settings requests carry the session token.
- The legacy-profile upgrade command opens `app.sqlite3`, matching the adapter. Image jobs stop after 30 minutes.
- The Resend idempotency key went out as a header inside the mail, where Resend ignores it; it is now sent as the request's `Idempotency-Key`.
- The pull request preview comment job can write its comment, and skips pull requests from forks, whose token is read-only.
- The production compose file passes `SAFEOS_DOMAIN` and `CORS_ORIGIN` to Caddy, which serves `{$SAFEOS_DOMAIN}`.
- `GET /api/auth/session` and the profile routes read the stored session row, so a returning guest gets their profile, `isGuest` and `expiresAt` back.
- Email sign-in is mounted at `/api/auth/email`; its sessions carry a profile, its links open forms served by the API, and a password reset ends the account's other sessions.
- A saved server session that the server answers with `401` is deleted from the browser before a new session is made, so the next page load does not send it again. A session that lives only in this browser is kept, and when no new session can be made the page goes on with it, so a reload adds no saved session. A page load restores the session this browser last used when it is saved and unexpired.
- A session check that answers neither OK nor `401` (a `503`, a `429`) keeps the saved session, as when the server cannot be reached, and asks for no new session.
- A profile save that was not taken fails instead of reporting success. Profile saves under one session run one after another, and a change that was not taken is put back to the profile the save before it left. For a session on a server the server's answer decides, a profile request with no answer within 15 seconds counts as not taken, and with no server address set the save fails; for a session that lives only in this browser, this browser's write decides. Settings says "Failed to save settings."; Notification Settings says "The server did not take the change. Save again when you are connected." or "Notification settings were not saved. Try again.", and its switches keep what was set, so Save again sends that. The account menu's display name and the settings panel say a failed save where it was made. A page restored without the server's answer shows the last saved profile from this browser.
- A session answer that arrives after Log Out or Clear All Local Data, in this tab or another, is dropped: nothing is saved, a session saved meanwhile is deleted, and the tab is signed out with no session token kept, unless it has made a new session since, which is kept as it is. A profile change answered after such a clear is not written to this browser, including a write that waited for the clear to finish, and a browser-only change that was not written fails as not saved. A change made before such a clear, or under an earlier session, is neither sent nor written when its turn comes afterwards, and fails as not saved. A save under a new session does not wait for an earlier session's saves. Clearing the alert history on Monitor drops neither.

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
