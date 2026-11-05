# SafeOS Guardian API Documentation

Complete API reference for the SafeOS Guardian backend.

## Base URL

```
Development: http://localhost:3001
Production: https://api.safeos.dev
```

## Authentication

Most endpoints require a session token passed in the `X-Session-Token` header.

```bash
curl -H "X-Session-Token: your-token-here" http://localhost:3001/api/streams
```

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

#### GET /api/alerts
List alerts.

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
Acknowledge an alert.

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

#### GET /api/profiles
List monitoring profiles.

#### POST /api/profiles
Create a custom profile.

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
Update a profile.

#### DELETE /api/profiles/:id
Delete a profile.

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

#### POST /api/notifications/test-email
Send a real test mail through Resend to check the email setup. The mail carries the same Unsubscribe link and headers as every other mail.

**Request:**
```json
{
  "to": "you@example.com",
  "resendApiKey": "optional BYO key",
  "fromOverride": "optional sender on a domain verified in Resend",
  "replyTo": "optional reply-to address"
}
```

**Responses:** `200` sent; `400` email not configured (no Resend key, or no https address for the unsubscribe link: set `SAFEOS_API_PUBLIC_URL`); `409` the address unsubscribed from alert email, so nothing was sent.

---

### Mail

Every mail the server sends carries a visible Unsubscribe link and the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058), all pointing at the URL below. The token is random and bound to one recipient; the server stores only its SHA-256.

#### GET /api/mail/unsubscribe/:token
An HTML page that asks. It changes nothing, so link scanners that open it stop nothing. For alert email and the settings test message, the page offers to unsubscribe from every optional mail. For account mail (verification, password reset), it says what still comes and when, and offers to turn off every optional mail. `404` for an unknown link.

#### POST /api/mail/unsubscribe/:token
Stops the mail at once. No mail is sent to confirm it.

- A mailbox provider's one-click POST (body `List-Unsubscribe=One-Click`, or any body without `scope`) stops that kind of mail and answers a blank `200`. On account mail it turns off every optional mail.
- The page's form posts `scope=optional`, turns off every optional mail and answers a page saying so.
- `404` (`Unknown link.`) for an unknown or malformed token.

---

### Webhooks

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

Include your session token as a query parameter:

```
ws://localhost:3001?token=your-session-token
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
| General API | 100 req/min |
| Analysis submission | 30 req/min |
| Webhook triggers | 60 req/min |

---

## OpenAPI Spec

Full OpenAPI 3.0 specification available at:
- JSON: `/api/docs/openapi.json`
- YAML: `/api/docs/openapi.yaml`
- Interactive: `/api/docs` (Swagger UI)




























