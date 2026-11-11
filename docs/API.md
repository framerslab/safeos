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

Behind the bundled Caddy (`docker-compose.prod.yml`), `SAFEOS_TRUST_PROXY=172.30.0.2` trusts only Caddy's fixed address on the dedicated proxy network. Other deployments may supply a comma-separated list of exact IPv4 or IPv6 proxy addresses. Hop counts, network ranges and invalid values are not accepted; unset or invalid settings trust no proxy. Direct peers cannot supply the client's rate-limit identity.

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
Create a guest session lasting 30 days. Without a token this always creates a new profile, even when the device label is known. To retain a guest profile, send its live session token in `X-Session-Token` or `Authorization: Bearer` and the same `deviceId` (or omit it if the original session had no device). The response contains a fresh token and the stored profile. Invalid, expired or mismatched proof returns `401`; a device ID alone never restores an existing profile. Email accounts use `/api/auth/email/login`.

**Request:**
```json
{
  "displayName": "My Monitoring Station",
  "deviceId": "device-123"
}
```

**Response (`201`):**
```json
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "token": "session-token",
    "isGuest": true,
    "expiresAt": "2026-12-11T00:00:00.000Z",
    "profile": {
      "id": "profile-uuid",
      "displayName": "My Monitoring Station",
      "avatarUrl": null,
      "preferences": {},
      "notificationSettings": {},
      "createdAt": "2026-11-11T00:00:00.000Z",
      "updatedAt": "2026-11-11T00:00:00.000Z"
    }
  }
}
```

#### GET /api/auth/session
Get the stored session metadata and profile in the same `data` shape as session creation. Expiry is checked at the current instant.

**Headers:** `X-Session-Token` or `Authorization: Bearer` required

#### DELETE /api/auth/session
End the current session.

**Headers:** `X-Session-Token` or `Authorization: Bearer` required

#### GET /api/auth/profile
Get user profile.

**Headers:** `X-Session-Token` or `Authorization: Bearer` required

#### PATCH /api/auth/profile
Update user profile.

**Headers:** `X-Session-Token` or `Authorization: Bearer` required

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

#### POST /api/auth/device
Attach a `deviceId` to the current live session. Requires a session token; unknown or expired sessions return `401`.

### Email accounts

The email router is mounted at `/api/auth/email`. Its failed requests use the authentication rate limit once; reset requests also use the stricter reset limit. Configure Resend and an https `SAFEOS_API_PUBLIC_URL` (or `SAFEOS_DOMAIN`) for account mail. Links point to this API, not the static web app. Registration can succeed when mail is unavailable, but verification is still required before login; operators must configure mail before offering registration.

| Method and path | Request | Result |
| --- | --- | --- |
| `POST /register` | `email`, `password`, optional `displayName` | Creates an unverified account; sends verification mail when configured |
| `GET /verify?token=…` | Verification link | Shows a confirmation form; does not verify on GET |
| `POST /verify` | `token` | Consumes a valid verification token (24-hour lifetime) |
| `POST /login` | `email`, `password` | Verified accounts receive `sessionToken` and `user`; session lasts 30 days |
| `GET /me` | Session header | Returns the signed-in email account |
| `POST /forgot-password` | `email` | Requests a reset link; same success response for unknown addresses |
| `GET /reset-password?token=…` | Reset link | Shows the password form; does not reset on GET |
| `POST /reset-password` | `token`, `newPassword` | Consumes the one-hour token, updates the password and revokes existing sessions |
| `POST /change-password` | Session header, `currentPassword`, `newPassword` | Changes the password after checking the current one |
| `POST /logout` | Session header | Ends that session |
| `POST /logout-all` | Session header | Ends all sessions of that account |

Session headers accept `X-Session-Token` or `Authorization: Bearer`. An email account has a stable `user_profiles` row, created on its first successful login, so its token works on the same owned routes as a guest token. Signing into an email account does not adopt a guest's records. Roles for protected routes come from `user_profiles.role`; creating an email account grants no staff access. Account links and responses are not cached.

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

All profile routes: **signed in**. The three built-in defaults (`profile-baby-default`, `profile-pet-default`, `profile-elderly-default`) have shared settings; only the operator may change their names or settings. Every person may select a default for their own monitoring. A custom profile belongs to the caller who created it: others neither see nor change it (`404`).

Active choices are stored per person and scenario. `is_active` in list, detail, update and activation responses describes the caller's choice. Selecting one profile clears only that person's prior choice for that scenario. `PATCH` with `isActive: false` clears that choice. Deleting a selected custom profile leaves no active choice. Existing owned selections are imported once on upgrade; old shared flags are not assigned to anyone.

Custom profiles from before ownership existed remain hidden, including from ordinary operator HTTP reads, until the operator assigns them in the database:

```sql
UPDATE monitoring_profiles SET owner_id = '<user profile id>'
WHERE id = '<custom monitoring profile id>' AND owner_id IS NULL;
```

Assign only custom profiles; leave the three shared default IDs unowned. The assigned owner can then read, edit and select the profile.

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
Select a shared default or the caller's custom profile for that person's scenario. Other people's choices are unchanged.

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

Connect to `ws://localhost:3001` for real-time frame submission and alerts.

### Connection

The WebSocket reads no session token today: it is open to any client, and its sign-in is separate work. The HTTP rule above (no token in a query string) applies to it too once it gains one.

```
ws://localhost:3001
```

### Client → Server Messages

#### Submit Frame for Analysis
```json
{
  "type": "frame",
  "streamId": "stream-uuid",
  "frameData": "base64-encoded-jpeg",
  "motionScore": 15,
  "audioLevel": 8,
  "timestamp": "2024-12-21T00:00:00.000Z"
}
```

**Rate Limit:** 30 frames per minute per client. Excess frames receive `rate_limited` response.

#### Acknowledge Alert
```json
{
  "type": "acknowledge",
  "alertId": "alert-uuid"
}
```

#### Heartbeat Response
```json
{
  "type": "pong"
}
```

### Server → Client Messages

#### Alert Notification
```json
{
  "type": "alert",
  "alert": {
    "id": "alert-uuid",
    "streamId": "stream-uuid",
    "alertType": "motion_detected",
    "severity": "high",
    "message": "Unusual motion detected in monitored area",
    "createdAt": "2024-12-21T00:00:00.000Z"
  }
}
```

#### Analysis Result
```json
{
  "type": "analysis",
  "result": {
    "concernLevel": "medium",
    "description": "Pet appears to be scratching at the door",
    "detectedIssues": ["door_scratching", "vocalization"]
  }
}
```

#### Heartbeat Ping
```json
{
  "type": "ping"
}
```

Clients must respond with `pong` within 30 seconds. After 3 missed heartbeats, the connection is terminated.

#### Rate Limit Warning
```json
{
  "type": "rate_limited",
  "message": "Frame submission rate exceeded",
  "retryAfter": 2000
}
```

#### Stats Update
```json
{
  "type": "stats",
  "payload": {
    "activeStreams": 2,
    "analysisQueueSize": 5,
    "ollamaStatus": "online"
  }
}
```

### Channel Subscriptions

Subscribe to specific event channels:

```json
{
  "type": "subscribe",
  "channel": "alerts" | "stats" | "stream:{streamId}"
}
```

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




























