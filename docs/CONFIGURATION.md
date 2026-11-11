# SafeOS Guardian - Configuration Reference

Complete reference for all configuration options, environment variables, and thresholds.

---

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SAFEOS_PORT` | `3001` | API server port |
| Database file | `db_data/app.sqlite3` | Relative to the API working directory; `SAFEOS_DB_PATH` is ignored by the current setup |

### Ollama (Local AI)

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |

### Cloud LLM Fallback (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No | OpenRouter API key for Gemini Flash |
| `OPENAI_API_KEY` | No | OpenAI API key for GPT-4o-mini |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for Claude 3 Haiku |

### Notification Channels (Optional)

#### SMS (Twilio)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Sender phone number (E.164 format) |

#### Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |

#### Email (Resend)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for the server's own mail |
| `EMAIL_FROM` | Sender, e.g. `SafeOS Guardian <alerts@yourdomain.com>` (a domain verified in Resend) |
| `EMAIL_REPLY_TO` | Reply-to address; the unsubscribe page names it as the contact for account deletion |
| `SAFEOS_API_PUBLIC_URL` | https address of this API server. Every mail's Unsubscribe link and `List-Unsubscribe` header point at `<this>/api/mail/unsubscribe/<token>`. Falls back to `https://SAFEOS_DOMAIN`; with neither, no mail is sent |
| `SAFEOS_DOMAIN` | Domain the bundled Caddy serves the API on (also used for the unsubscribe link when `SAFEOS_API_PUBLIC_URL` is unset) |

#### Browser Push

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | VAPID public key for web push |
| `VAPID_PRIVATE_KEY` | VAPID private key for web push |

---

## Rate Limits & Thresholds

### WebSocket Rate Limiting

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MAX_FRAMES_PER_MINUTE` | 30 | Frame attempts per profile across all connections and sessions |
| `FRAME_WINDOW_MS` | 60000 | Time window for rate limiting (1 minute); reconnects retain it |
| `MAX_FRAME_BYTES` | 2097152 | Image bytes before base64 encoding (2 MiB) |
| `MAX_FRAME_PIXELS` | 16000000 | Maximum decoded image pixels |
| `MAX_WS_PAYLOAD` | 3145728 | Maximum complete WebSocket message bytes (3 MiB) |
| `MAX_PENDING_MESSAGES` | 32 | Maximum pending messages per connection |
| `MAX_CHANNEL_LENGTH` | 128 | Maximum channel characters; ASCII letters, digits, colon, underscore and hyphen only |
| `MAX_SUBSCRIPTIONS` | 32 | Maximum distinct channel subscriptions per connection |
| `MAX_CONCURRENT_FRAME_DECODES` | 2 | Process-wide image decoder slots; busy attempts receive `RATE_LIMITED` |
| `WS_HEARTBEAT_INTERVAL` | 30000 | Heartbeat ping interval (30 seconds) |
| `MAX_MISSED_HEARTBEATS` | 3 | Disconnect after more than 3 missed heartbeats |

The frame allowance is held per API process and resets on restart. Images must
fully decode as single JPEG, PNG or WebP images; invalid attempts consume the
allowance. See [WebSocket API](API.md#websocket-api) for authentication and errors.

### Analysis Queue

| Parameter | Value | Description |
|-----------|-------|-------------|
| `concurrency` | 2 | Max parallel analysis jobs |
| `maxRetries` | 3 | Retry count for failed jobs |
| `retryDelay` | 5000 | Delay between retries (5 seconds) |

### Default Detection Thresholds

| Parameter | Default | Description |
|-----------|---------|-------------|
| `motionThreshold` | 10 | Pixel difference threshold for motion detection |
| `audioThreshold` | 15 | dB threshold for audio detection |

---

## Database Configuration

### Frame Buffer

| Parameter | Value | Description |
|-----------|-------|-------------|
| `BUFFER_MINUTES` | 10 | Rolling buffer duration for privacy |

The server removes expired frame-buffer rows on startup and every second, even
without new uploads. Deletion runs on the next sweep after the ten-minute
cutoff. It does not erase historical backups or guarantee forensic erasure.

### Supported Scenarios

| Scenario | Description |
|----------|-------------|
| `pet` | Pet monitoring (eating, bathroom, distress) |
| `baby` | Baby/toddler monitoring (crying, movement, safety) |
| `elderly` | Elderly care (falls, confusion, inactivity) |

### Concern Levels

Analysis results are tagged with one of these concern levels:

| Level | Description |
|-------|-------------|
| `none` | No concerns detected |
| `low` | Minor observation, likely normal |
| `medium` | Warrants attention |
| `high` | Immediate attention recommended |
| `critical` | Urgent - requires immediate response |

### Alert Severities

| Severity | Description |
|----------|-------------|
| `info` | Informational only |
| `low` | Low priority |
| `medium` | Medium priority |
| `high` | High priority |
| `critical` | Critical - escalates rapidly |

---

## Monitoring Profiles

### Pet Profile

```typescript
{
  motionSensitivity: 'medium',
  audioSensitivity: 'medium',
  detectionTypes: ['eating', 'bathroom', 'distress', 'illness', 'stillness'],
  inactivityAlertMinutes: 60,
}
```

### Baby Profile

```typescript
{
  motionSensitivity: 'high',
  audioSensitivity: 'high',
  detectionTypes: ['crying', 'movement', 'breathing', 'safety_hazard'],
  inactivityAlertMinutes: 30,
}
```

### Elderly Profile

```typescript
{
  motionSensitivity: 'high',
  audioSensitivity: 'medium',
  detectionTypes: ['fall', 'confusion', 'distress', 'prolonged_stillness'],
  inactivityAlertMinutes: 30,
}
```

---

## Alert Escalation

Alert volume escalates over time if not acknowledged:

| Level | Delay | Volume Multiplier | Sound |
|-------|-------|-------------------|-------|
| 1 | 0s | 0.3x | Soft chime |
| 2 | 30s | 0.5x | Medium tone |
| 3 | 60s | 0.7x | Attention tone |
| 4 | 90s | 0.9x | Urgent tone |
| 5 | 120s | 1.0x | Continuous alarm |

---

## API Pagination

All list endpoints support pagination:

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `limit` | 50 | 100 | Items per page |
| `offset` | 0 | - | Starting offset |

Response includes:
```json
{
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Example .env File

```env
# Server
SAFEOS_PORT=3001
# Database: db_data/app.sqlite3 relative to the API working directory

# Ollama (optional - for LLM-enhanced analysis)
OLLAMA_HOST=http://localhost:11434

# Cloud Fallback (optional)
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# SMS Notifications (optional)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# Telegram Notifications (optional)
TELEGRAM_BOT_TOKEN=...

# Email via Resend (optional)
RESEND_API_KEY=re_...
EMAIL_FROM="SafeOS Guardian <alerts@yourdomain.com>"
EMAIL_REPLY_TO=team@yourdomain.com
SAFEOS_API_PUBLIC_URL=https://safeos-api.yourdomain.com

# Browser Push (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

---

## See Also

- [Quick Start Guide](./QUICKSTART.md)
- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)


### Server vision model defaults

Provider catalogs checked on 11 November 2026. Local analysis continues to use
[`moondream`](https://ollama.com/library/moondream) for triage and
[`llava:7b`](https://ollama.com/library/llava:7b) for detailed analysis; both remain
listed as vision models. When local analysis is unavailable, configured cloud
providers are tried in this order:

| Provider | Model | Provider reference |
| --- | --- | --- |
| OpenRouter | `google/gemini-2.5-flash` | [Current model catalog](https://openrouter.ai/api/v1/models) |
| OpenAI | `gpt-5.6-terra` | [Model and supported endpoints](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| Anthropic | `claude-haiku-5-5` | [Current models](https://platform.claude.com/docs/en/models/overview) |

These models accept image input. The OpenAI request uses
`max_completion_tokens: 4096`, including reasoning tokens, on Chat Completions.
The provider catalog does not guarantee that an individual account has access.
Model defaults and prices change; check the linked catalog before deployment.
CI checks request construction through the worker with provider stubs; it does
not spend credits or assert live account access. The newer OpenAI model has a
higher published token price than the former default.


### Push destination policy

Registration and delivery accept HTTPS on port 443 only. The following vendor
pages were checked on 11 November 2026. These are service hosts, not arbitrary
notification destinations; subscription paths and queries remain opaque.

| Service | Allowed host | Vendor documentation |
|---------|--------------|----------------------|
| Chrome and other FCM browsers | `fcm.googleapis.com` | [Configure your Network for FCM](https://firebase.google.com/docs/cloud-messaging/network-configuration) |
| Firefox | `updates.push.services.mozilla.com` | [Mozilla Autopush: HTTP Endpoints for Notifications](https://mozilla-services.github.io/autopush-rs/http.html) |
| Safari | subdomains of `push.apple.com` | [Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) |
| Edge / Windows Notification Service | subdomains of `notify.windows.com` | [Windows Push Notification Services overview](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview) and [Re-engage users with push messages](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push) |

Other hosts, IP literals, credentials in URLs, fragments, non-default ports,
and private, loopback or link-local DNS answers are refused. DNS failure also
refuses registration or skips delivery; a two-second deadline bounds resolution.
Delivery resolves again and pins the
checked public address for the TLS connection, retaining hostname verification.
Redirects are not followed. Legacy rows receive the same checks. The legacy
`android.googleapis.com` endpoint and Mozilla development/staging hosts are
excluded; they were not confirmed as current production endpoints in these
vendor references.

### Server-funded alert recipients

Server SMS uses only the owner's verified `phone_numbers` row. Server email is
reserved for an operator owner because profiles do not have verified email
addresses. Registering a Telegram chat is not verification, so queued alerts
skip the server bot. Personal Resend keys, complete Twilio credentials and
Telegram bot tokens may be saved through the profile route; see API.md for
field names. Registering a profile or enabling a channel does not authorize a
recipient. Skips log the channel and a fixed reason without the recipient.

Push registration requires an active session and is limited to 32 endpoints per
profile. A browser endpoint transfers to the latest registering profile/session,
and logout revokes that session's registrations. Legacy unbound rows must be
registered again. Personal-key mail needs an explicit sender or a complete server
mail configuration to supply the fallback sender.


### Alert delivery limits and quiet hours

The server sends only for an active stream. It saves each alert while limiting
repeated external delivery to one attempt per stream and severity within five
minutes of an unacknowledged same-or-higher severity attempt. Escalation is
immediate. The per-process delivery cap is 32 unsettled alerts; capacity skips
are recorded in alert metadata and are not queued for a later retry. Slow
providers do not occupy analysis workers or delay server shutdown.

Quiet hours hold low and medium server alerts only. High and critical alerts
always bypass the window. Settings saves the browser's IANA time zone as
`quietHoursTimeZone`, the chosen local weekdays as `quietHoursDays` (Sunday = 0),
and `quietHoursStart` / `quietHoursEnd` as `HH:mm`. The current local weekday
must be selected, including the after-midnight portion of an overnight window.
The start is inclusive and the end exclusive; missing, invalid or equal times
disable the window. Missing days or an empty day list holds nothing. A legacy
profile with a window but no saved time zone holds nothing; the server logs
one fixed message without personal data explaining why. Saving settings adds
the zone and days. Browser sound settings continue to use the device clock.

Provider credentials saved with the profile
are write-only in API and export responses; presence flags indicate which are set.
