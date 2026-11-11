# SafeOS Guardian API Documentation

Complete API reference for the SafeOS Guardian backend.

## Base URL

```
Development: http://localhost:3001
Production: https://api.safeos.dev
```

## Authentication

Most endpoints require a session token, sent in the `X-Session-Token` header or as `Authorization: Bearer <token>`. A token in the query string is refused, since URLs reach access logs, browser history and `Referer` headers. An expired session is refused on every route.

```bash
curl -H "X-Session-Token: your-token-here" http://localhost:3001/api/streams
```

**Who may call a route.** Each route below says one of:

- **Anyone**: no session needed.
- **Signed in**: any valid session. Data routes return and change only the caller's own records: alerts and analysis results of streams the caller owns, monitoring profiles the caller created. Another owner's record answers `404`, as if it did not exist.
- **Reviewer or operator**: a session whose profile holds the `reviewer` or `operator` role. Any other session gets `403`.

Every profile starts with the role `user`. The operator grants a role in the database:

```sql
UPDATE user_profiles SET role = 'reviewer' WHERE id = '<profile id>';
```

Behind the bundled Caddy (`docker-compose.prod.yml`), `SAFEOS_TRUST_PROXY=1` tells the API that one proxy sits in front of it, so the rate limits count each client's own address. Leave it unset when clients reach the API directly; set it to the number of proxies only when nothing else can reach the API port.

---

## Endpoints

### Health & Status

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-21T00:00:00.000Z"
}
```

#### GET /api/status
Get detailed system status.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "version": "1.0.0",
  "stats": {
    "totalStreams": 10,
    "activeStreams": 2,
    "totalAlerts": 150,
    "pendingReviews": 3,
    "analysisToday": 1200,
    "cloudFallbackRate": 5.2
  },
  "ollama": {
    "status": "online",
    "models": ["moondream", "llava:7b"]
  }
}
```

---

### Authentication

#### POST /api/auth/session
Create a new session (guest or authenticated).

**Request:**
```json
{
  "displayName": "My Monitoring Station",
  "deviceId": "device-123"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "session-uuid",
    "token": "session-token",
    "isGuest": true,
    "expiresAt": "2024-12-28T00:00:00.000Z"
  },
  "profile": {
    "id": "profile-uuid",
    "displayName": "My Monitoring Station",
    "preferences": {...},
    "notificationSettings": {...}
  }
}
```

#### GET /api/auth/session
Get current session info.

**Headers:** `X-Session-Token: required`

#### DELETE /api/auth/session
End the current session.

**Headers:** `X-Session-Token: required`

#### GET /api/auth/profile
Get user profile.

**Headers:** `X-Session-Token: required`

#### PATCH /api/auth/profile
Update user profile.

**Headers:** `X-Session-Token: required`

**Request:**
```json
{
  "displayName": "New Name",
  "preferences": {
    "defaultScenario": "pet",
    "motionSensitivity": 0.6
  }
}
```

---

### Streams

#### GET /api/streams
List all streams.

**Query Parameters:**
- `status` - Filter by status: `active`, `ended`, `paused`
- `scenario` - Filter by scenario: `pet`, `baby`, `elderly`
- `limit` - Max results (default: 50)
- `offset` - Pagination offset

**Response:**
```json
{
  "success": true,
  "streams": [
    {
      "id": "stream-uuid",
      "scenario": "pet",
      "status": "active",
      "startedAt": "2024-12-21T00:00:00.000Z",
      "alertCount": 5
    }
  ],
  "total": 10
}
```

#### POST /api/streams
Create a new stream.

**Request:**
```json
{
  "scenario": "pet",
  "name": "Living Room Camera",
  "settings": {
    "motionSensitivity": 0.5,
    "audioSensitivity": 0.5,
    "analysisInterval": 5000
  }
}
```

**Response:**
```json
{
  "success": true,
  "stream": {
    "id": "stream-uuid",
    "scenario": "pet",
    "status": "active",
    "startedAt": "2024-12-21T00:00:00.000Z"
  }
}
```

#### GET /api/streams/:id
Get a specific stream.

#### DELETE /api/streams/:id
End a stream.

#### POST /api/streams/:id/pause
Pause a stream.

#### POST /api/streams/:id/resume
Resume a paused stream.

---

### Analysis

All analysis routes: **signed in**. `GET /api/analysis`, `GET /api/analysis/:id` and `GET /api/analysis/stats/summary` return results of the caller's own streams only; another owner's result answers `404`.

#### POST /api/analysis/frame
Submit a frame for AI analysis.

**Request:**
```json
{
  "streamId": "stream-uuid",
  "frameData": "base64-encoded-jpeg",
  "timestamp": "2024-12-21T00:00:00.000Z",
  "motionLevel": 0.7,
  "audioLevel": 0.3
}
```

**Response:**
```json
{
  "success": true,
  "queued": true,
  "jobId": "job-uuid"
}
```

#### GET /api/analysis/result/:jobId
Get analysis result.

**Response:**
```json
{
  "success": true,
  "result": {
    "concernLevel": "low",
    "description": "Normal activity detected",
    "detectedIssues": [],
    "processingTimeMs": 150,
    "modelUsed": "moondream",
    "isCloudFallback": false
  }
}
```

#### GET /api/analysis/stats
Get analysis statistics.

---

### Alerts

All alert routes: **signed in**, the caller's own alerts only.

#### GET /api/alerts
List the caller's alerts.

**Query Parameters:**
- `streamId` - Filter by stream
- `severity` - Filter: `critical`, `high`, `medium`, `low`, `info`
- `acknowledged` - Filter: `true` or `false`
- `limit` - Max results (default: 50)
- `page` - Page number

**Response:**
```json
{
  "success": true,
  "alerts": [...],
  "total": 100,
  "page": 1,
  "totalPages": 2
}
```

#### POST /api/alerts/:id/acknowledge
Acknowledge one of the caller's alerts. Another owner's alert answers `404`.

#### POST /api/alerts/acknowledge/all
Acknowledge every unacknowledged alert of the caller's streams, or of one of them with `{ "streamId": "..." }`. Alerts of other owners are never touched.

**Response:**
```json
{
  "success": true,
  "acknowledged": true,
  "acknowledgedAt": "2024-12-21T00:00:00.000Z"
}
```

#### DELETE /api/alerts/:id
Delete an alert.

---

### Monitoring Profiles

All profile routes: **signed in**. The built-in defaults (`profile-<scenario>-default`) are shared and read-only; the operator alone may change them. A custom profile belongs to the caller who created it: others neither see nor change it (`404`).

#### GET /api/profiles
List the built-in defaults and the caller's own profiles.

#### POST /api/profiles
Create a custom profile owned by the caller.

**Request:**
```json
{
  "name": "Custom Pet Profile",
  "scenario": "pet",
  "settings": {
    "motionSensitivity": 0.7,
    "audioSensitivity": 0.3,
    "analysisInterval": 3000
  }
}
```

#### PATCH /api/profiles/:id
Update one of the caller's profiles.

#### POST /api/profiles/:id/activate
Make one of the caller's profiles the active one for its scenario.

#### DELETE /api/profiles/:id
Delete one of the caller's profiles.

---

### Notifications

These routes manage notification configuration for deployments that run the optional SafeOS API server.

**Important:** remote delivery channels (Web Push / SMS / Telegram / Email) require additional setup and provider credentials.
Some endpoints may store configuration only and do not send messages by default.

#### POST /api/notifications/subscribe
Register a Web Push subscription (storage-only in the default implementation).

**Request:**
```json
{
  "subscription": { "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } },
  "userId": "user-123"
}
```

#### DELETE /api/notifications/subscribe
Unregister a Web Push subscription.

#### POST /api/notifications/telegram/register
Register a Telegram chat ID (storage-only in the default implementation).

**Request:**
```json
{
  "chatId": "123456789"
}
```

#### DELETE /api/notifications/telegram/register
Unregister a Telegram chat ID.

#### GET /api/notifications/status
Check which notification channels are configured/enabled on the server.

#### POST /api/notifications/test
Send a test notification (simulated in the default implementation).

**Request:**
```json
{
  "channel": "webhook|push|sms|telegram",
  "target": "optional target identifier"
}
```

#### POST /api/notifications/test-sms
Send a real test text through Twilio. **Signed in.** On the server's Twilio account the caller may text only a number verified on their own profile (a `phone_numbers` row with `verified = 1`); the operator may text any number. No route verifies a number yet, so on the server's account this is the operator's route in practice. With their own Twilio credentials in the body (`twilioAccountSid`, `twilioAuthToken`, `twilioFromNumber`) a signed-in caller may text any number on that account.

**Responses:** `200` sent; `400` invalid number or Twilio not configured; `401` no session; `403` not the caller's verified number.

#### POST /api/notifications/test-email
Send a real test mail through Resend to check the email setup. The mail carries the same Unsubscribe link and headers as every other mail. **Signed in.** On the server's Resend account (no `resendApiKey` in the body) the route is the operator's alone, `fromOverride` included; any signed-in caller may test their own Resend key.

**Request:**
```json
{
  "to": "you@example.com",
  "resendApiKey": "optional BYO key",
  "fromOverride": "optional sender on a domain verified in Resend",
  "replyTo": "optional reply-to address"
}
```

**Responses:** `200` sent; `400` email not configured (no Resend key, or no https address for the unsubscribe link: set `SAFEOS_API_PUBLIC_URL`); `401` no session; `403` the server's account without the operator role; `409` the address unsubscribed from alert email, so nothing was sent.

---

### Mail

Every mail the server sends carries a visible Unsubscribe link and the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058), all pointing at the URL below. The token is bound to one recipient and reveals nothing: random, or derived from the mail's idempotency key with a secret kept in the database, so a retried send carries the same link. The server stores only its SHA-256.

#### GET /api/mail/unsubscribe/:token
An HTML page that asks. It changes nothing, so link scanners that open it stop nothing. For alert email and the settings test message, the page offers to unsubscribe from every optional mail. For account mail (verification, password reset), it says what still comes and when, and offers to turn off every optional mail. `404` for an unknown link.

#### POST /api/mail/unsubscribe/:token
Stops the mail at once. No mail is sent to confirm it.

- A mailbox provider's one-click POST (body `List-Unsubscribe=One-Click`, or any body without `scope`) stops that kind of mail and answers a blank `200`. On account mail it turns off every optional mail.
- The page's form posts `scope=optional`, turns off every optional mail and answers a page saying so.
- `404` (`Unknown link.`) for an unknown or malformed token.

The request log prints `[token]` in place of the token.

---

### Webhooks

All webhook routes: **signed in** with the `X-Session-Token` header, the caller's own webhooks only. An expired session gets `401`.

#### GET /api/webhooks
List registered webhooks.

#### POST /api/webhooks
Create a new webhook.

**Request:**
```json
{
  "name": "My Webhook",
  "url": "https://my-app.com/webhook",
  "events": ["alert.created", "stream.started"]
}
```

**Available Events:**
- `alert.created`
- `alert.acknowledged`
- `stream.started`
- `stream.ended`
- `analysis.completed`
- `review.required`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "webhook-uuid",
    "name": "My Webhook",
    "url": "https://my-app.com/webhook",
    "secret": "whsec_xxxxx",
    "events": ["alert.created", "stream.started"],
    "isActive": true
  }
}
```

#### DELETE /api/webhooks/:id
Delete a webhook.

#### POST /api/webhooks/:id/test
Send a test payload.

---

### Data Export

All export routes: **signed in** with the `X-Session-Token` header, the caller's own data only. An expired session gets `401`.

#### GET /api/export/alerts
Export alerts as JSON or CSV.

**Query Parameters:**
- `format` - `json` or `csv`
- `startDate` - ISO date
- `endDate` - ISO date

#### GET /api/export/analysis
Export analysis results.

#### GET /api/export/streams
Export stream history.

#### GET /api/export/profile
Export user profile and settings.

#### GET /api/export/all
Export all user data (GDPR compliant).

---

### Human Review

All review routes (`/api/review/flags`, `/api/review/flags/:id`, `/api/review/flags/:id/action`, `/api/review/stats`, `/api/review/queue`): **reviewer or operator**. No session gets `401`; any other role gets `403`.

#### GET /api/review/flags
List content flags for review.

**Query Parameters:**
- `status` - `pending`, `approved`, `rejected`, `escalated`
- `tier` - Filter by tier (1-4)
- `limit` - Max results

#### POST /api/review/flags/:id/action
Action a content flag.

**Request:**
```json
{
  "action": "approve" | "reject" | "escalate",
  "reason": "Optional reason"
}
```

---

## WebSocket API

Connect to `ws://localhost:3001/ws` (use `wss://` outside local development).

### Connection and session

A live session from `POST /api/auth/session` is required. Native clients may
supply `X-Session-Token` or `Authorization: Bearer <token>` in the handshake.
Browser clients send this as their first message, within five seconds:

```json
{"type":"authenticate","payload":{"token":"session-token"}}
```

Wait for `{"type":"connected","payload":{"clientId":"peer-id"}}` before
sending application messages. Missing, unknown, revoked or expired sessions
close with code `1008`; session checks also run on each message and heartbeat.
Tokens in URLs are not accepted. The browser client uses the current sign-in
session; an offline-only session cannot authenticate to the server. The socket
hook initializes a session on a fresh monitoring visit. Logout and session
changes cancel old retries and detach the old socket's event handlers.

### Stream ownership

Only the stream's owner may join it, submit frames or audio levels, or relay
signalling. A missing or unowned stream receives an `error` message with
`payload.code: "STREAM_FORBIDDEN"`.

```json
{"type":"join_stream","streamId":"stream-uuid"}
```

Joining receives `metrics` and `audio_level` events for that stream. Send
`{"type":"leave_stream"}` to stop receiving them. `offer`, `answer` and
`ice-candidate` messages must name `streamId` and `payload.targetPeerId`;
both peers must be signed in as the stream owner and joined to that same stream.
The forwarded message includes the sender's `payload.peerId`.

### Frame submission

```json
{
  "type": "frame",
  "streamId": "stream-uuid",
  "payload": {
    "imageData": "base64-encoded-jpeg",
    "motionScore": 15,
    "audioLevel": 8
  }
}
```

Images must fully decode as a single JPEG, PNG or WebP image, at most
**2 MiB (2,097,152 bytes)** before base64 encoding and **16,000,000 pixels**.
Plain base64 and matching `data:image/...;base64,` URLs are accepted; stored
frames use plain base64. Invalid content receives `INVALID_FRAME`; images
above the byte limit receive `FRAME_TOO_LARGE`. Rejected frames are neither
stored nor queued. Entire WebSocket messages above **3 MiB** close with `1009`.
A connection with more than 32 pending messages closes with `1008`.
At most **two image decodes** run at once across the API process. While both
slots are occupied, additional frames receive `RATE_LIMITED` and are not
stored or queued. Decoding scans pixels without returning a full bitmap to
JavaScript.

Each profile has **30 frame attempts per 60-second window**, shared across
its streams, sessions and concurrent connections. Invalid images count toward
this allowance. Reconnecting does not reset it; a different profile has its
own allowance. Counters live in the API process and reset on process restart;
multiple API processes would need a shared limit store.

Frames with motion of at least 10 or audio of at least 15 are queued for
analysis using the stream's saved `pet`, `baby` or `elderly` scenario.

### Audio and heartbeat

```json
{"type":"audio_level","streamId":"stream-uuid","payload":{"level":12,"hasCrying":false}}
```

Respond to server `ping` messages with `{"type":"pong"}`. The server also
answers client `ping` messages with `pong`. Heartbeats run every 30 seconds;
a connection closes after more than three missed responses.

### Errors and events

Errors use this envelope:

```json
{"type":"error","payload":{"code":"RATE_LIMITED","message":"Maximum 30 frame attempts per minute"}}
```

Stream metrics use `{"type":"metrics","streamId":"...","payload":{"motionScore":15,"audioLevel":8}}`.
Messages from the server include a millisecond `timestamp`. Channel
`subscribe` and `unsubscribe` messages accept a `channel` field; subscribing
to `stream:<id>` requires ownership too. The current worker does not send
alert or analysis-result events over this socket; use the HTTP routes to
read those records and acknowledge alerts.

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid session token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/min per client address |
| Sign-in (`/api/auth`) | 5 failed req/min per client address; a successful request is not counted |
| Analysis submission | 30 req/min |
| Webhook triggers | 60 req/min |

---

## OpenAPI Spec

Full OpenAPI 3.0 specification available at:
- JSON: `/api/docs/openapi.json`
- YAML: `/api/docs/openapi.yaml`
- Interactive: `/api/docs` (Swagger UI)




























