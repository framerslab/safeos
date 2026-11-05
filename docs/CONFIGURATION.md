# SafeOS Guardian - Configuration Reference

Complete reference for all configuration options, environment variables, and thresholds.

---

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SAFEOS_PORT` | `3001` | API server port |
| `SAFEOS_DB_PATH` | `db_data/safeos.sqlite3` | SQLite database file path |

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
| `MAX_FRAMES_PER_MINUTE` | 30 | Maximum frames a client can submit per minute |
| `FRAME_WINDOW_MS` | 60000 | Time window for rate limiting (1 minute) |
| `WS_HEARTBEAT_INTERVAL` | 30000 | Heartbeat ping interval (30 seconds) |
| `MAX_MISSED_HEARTBEATS` | 3 | Disconnect after 3 missed heartbeats |

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

Frames older than this are automatically cleaned up for privacy compliance.

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
SAFEOS_DB_PATH=db_data/safeos.sqlite3

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
