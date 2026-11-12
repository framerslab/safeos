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
- **Signed in**: any valid session. Data routes return and change only the caller's own records: alerts and analysis results of streams the caller owns, monitoring profiles the caller created. Another owner's record answers `404`, as if it did not exist. The stream-status PATCH route also admits reviewers and operators for moderation, as described below.
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
Create a guest session lasting 30 days. Without a token this always creates a new profile, even when the device label is known. To retain a guest profile, send its live session token in `X-Session-Token` or `Authorization: Bearer` and the same `deviceId` (or omit it if the original session had no device). The response contains a fresh token and the stored profile. A successful resume replaces the presented token in the same session row; clients must save the returned token. The earlier token is immediately invalid, and only one concurrent resume can succeed. Invalid, expired or mismatched proof returns `401`; a device ID alone never restores an existing profile. Email accounts use `/api/auth/email/login`.

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
| `POST /register` | `email`, `password`, optional `displayName` | Creates an unverified account; returns the same `201` message for new and existing addresses, without account details |
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

Blank or whitespace-only optional display names use the email name. Registration, reset and change share the same password requirements: 8–1024 characters with at least one uppercase letter, lowercase letter and number. Invalid replacement passwords leave the password and reset token untouched. Duplicate registration leaves the existing account unchanged. Account-link forms preserve any path prefix in the public API URL.

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

#### PATCH /api/streams/:id
Update `status` to `active`, `paused`, `ended` or `banned`. Owners can change
their own non-banned streams, but cannot set or clear a ban. Reviewers and
operators can change any stream's status, including restoring another owner's
banned stream. A reviewer or operator who is not the owner must provide `status`;
without it the route returns `400` with an error and no stream fields. A successful
non-owner update returns only `{ "stream": { "id": "...", "status": "..." } }`.
The owner's own PATCH still accepts an omitted status and returns the full stream
row. This permission does not grant access to that owner's stream reads, deletion,
frames or socket messages. The update preserves stream ownership.

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

These routes require a session and manage notification configuration for deployments that run the optional SafeOS API server.

**Important:** remote delivery channels (Web Push / SMS / Telegram / Email) require additional setup and provider credentials.
Some endpoints may store configuration only and do not send messages by default.

#### POST /api/notifications/subscribe
Store a Web Push subscription for the signed-in profile. Registration returns `400` unless the endpoint is HTTPS on a documented push service, uses the default port, and resolves only to public addresses. Delivery repeats these checks for stored rows and never follows redirects. See the provider list in CONFIGURATION.md. The analysis worker uses it when that owner's browser-push preference is enabled.

**Request:**
```json
{
  "subscription": { "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } },
  "userId": "user-123"
}
```

#### DELETE /api/notifications/subscribe
Remove the `endpoint` supplied in the JSON body for the signed-in profile. With an empty body, remove only registrations belonging to the calling session. Other devices keep their registrations.

#### POST /api/notifications/telegram/register
Store a Telegram chat ID for the signed-in profile. Registration does not verify ownership of the chat. The analysis worker sends only when that owner's Telegram preference and personal `telegramBotToken` are set; it skips the server bot because chat verification is unavailable.

**Request:**
```json
{
  "chatId": "123456789"
}
```

#### DELETE /api/notifications/telegram/register
Unregister a Telegram chat ID.

#### GET /api/notifications/status
Check channel configuration and the signed-in profile's registration counts. `telegramEnabled` is true only when the caller has saved a personal `telegramBotToken`; the server token does not enable queued alert delivery.

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
Export up to 10,000 owned alerts as JSON or CSV.

**Query Parameters:**
- `format` - `json` or `csv`
- `startDate` - ISO date
- `endDate` - ISO date

#### GET /api/export/analysis
Export up to 10,000 owned analysis results as JSON or CSV.

#### GET /api/export/streams
Export up to 1,000 owned streams as JSON or CSV.

#### GET /api/export/profile
Export the user profile and settings in `data`, including:

- `monitoringProfiles`: every monitoring profile whose `owner_id` is the caller,
  independent of its identifier. `is_active` reflects that caller's personal
  choice for the scenario, rather than the legacy flag on the shared row.
- `activeMonitoringProfiles`: the caller's rows from the personal choices table,
  ordered by scenario, with `owner_id`, `scenario`, and `monitoring_profile_id`.
  Built-in default selections and explicit `null` selections are retained.
- `notifications`: the caller's push subscription endpoints and Telegram chats.

Unowned defaults are not exported as owned profiles. Another person's profiles
and active choices are excluded. Provider secrets remain redacted.

If a monitoring profile's stored settings are not valid JSON (including an empty
string), the profile is still included with `settings: null`. Unreadable settings
cannot be safely redacted and are never passed through. `monitoringSettingsOmitted`
reports the number of these profiles, or `0` when all settings can be read. This
field is in `data` for the profile export and at the top level for the full export.
Other rows are exported as usual, and stored settings are not changed.

#### GET /api/export/all
Download a JSON object containing `profile`, `sessions`, `streams`, `alerts`,
`analysisResults`, `monitoringProfiles`, and `activeMonitoringProfiles`.
Monitoring profiles and choices use the same ownership rules and fields as
`/api/export/profile`. Sessions omit tokens. Streams are capped at 1,000;
alerts and analysis results are each capped at 5,000. Each limited list keeps the
newest rows first (`created_at` descending, then `id` descending for ties).
`counts.streams`, `counts.alerts`, and `counts.analysisResults` each contain
`total` (all rows owned by this person), `included` (rows in the export), and
`truncated` (`true` when `total` exceeds `included`). These counts cover all owned
streams, including alerts or analysis from streams outside the exported stream
list. For example, an alert total of 5,001 produces `{ "total": 5001,
"included": 5000, "truncated": true }`; exporting does not remove the omitted rows
from the server. Monitoring profiles and personal choices have no export count cap. This is server data only: browser
history is exported separately from History's local timeline.

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
session. The hook and client class do not open sockets for tokens beginning
with `local-` or `offline-`. A `1008` close with `Invalid session` or
`Invalid or expired session` stops retries for that credential, including
explicit attempts, until the session changes. Authentication deadlines and
pending-message limits retry with backoff. Duplicate connect calls share the
opening socket, and events from replaced sockets cannot alter the current one.
The socket hook initializes a session on a fresh monitoring visit. Logout and
session changes cancel old retries and detach the old socket's event handlers.
Updating hook callbacks does not reconnect the socket.

### Stream ownership

Only the stream's owner may join it, submit frames or audio levels, or relay
signalling. A missing or unowned stream receives an `error` message with
`payload.code: "STREAM_FORBIDDEN"`.

```json
{"type":"join_stream","streamId":"stream-uuid"}
```

Only active streams can be joined, receive frames/audio or relay signalling. Paused, ended and banned streams are unavailable, including to their owner.

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
a connection closes after more than three missed responses. Both browser
clients answer server pings automatically after sign-in.

### Errors and events

Errors use this envelope:

```json
{"type":"error","payload":{"code":"RATE_LIMITED","message":"Maximum 30 frame attempts per minute"}}
```

Stream metrics use `{"type":"metrics","streamId":"...","payload":{"motionScore":15,"audioLevel":8}}`.
Messages from the server include a millisecond `timestamp`. Channel
`subscribe` and `unsubscribe` messages accept a `channel` field; subscribing
to `stream:<id>` requires ownership too. Channel names must contain 1–128
ASCII letters, digits, colons, underscores or hyphens. Each connection holds
at most 32 distinct subscriptions. Invalid names receive `INVALID_CHANNEL`;
additional subscriptions receive `SUBSCRIPTION_LIMIT`. Subscribing again to
an existing channel uses no extra slot; unsubscribing frees a slot.
Subscription and unknown-message log lines do not include the supplied value.
An internal failure closes the socket with `1011` and logs one fixed diagnostic
with the error name, without the error message, session or client data.

The current worker does not send
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






























### Server alert delivery settings

With the optional API server running, new analysis alerts of medium or greater
severity are handed to the stream owner's enabled channels. SMS retains its
high/critical severity threshold; browser push, Telegram and email are eligible
from medium severity. Set preferences with
`PATCH /api/auth/profile`, carrying `X-Session-Token` (or a Bearer token):

```json
{
  "notificationSettings": {
    "browserPush": true,
    "telegram": true,
    "sms": true,
    "smsNumber": "+15551234567",
    "email": true,
    "emailRecipient": "parent@example.com"
  }
}
```

Email uses `email`, not the legacy `emailDigest` preference. Each channel requires
its opt-in flag. Server SMS requires a matching `phone_numbers` row with
`verified = 1` for the alert owner, including operator-owned alerts. Unlike the
interactive test route, queued SMS has no operator bypass. Server email is
operator-only, matching the test-mail route: profiles have no verified email
field. Other owners must supply their own Resend key. Server-bot Telegram is
skipped because chat registration does not establish recipient ownership.

Personal credentials are supported in `notificationSettings`:

- `smsOverride`: `accountSid`, `authToken`, and `fromNumber` (all required for a
  personal account; a partial override never changes the server sender).
- `emailOverride`: `apiKey`, with optional `replyTo`; `emailFromOverride` may
  specify a sender verified in that account. Without a personal sender, complete
  server mail configuration must supply the fallback; otherwise delivery is skipped.
- `telegramBotToken`: a personal bot token, used with the owner's registered chats.

The same profile route saves these credentials, but they are write-only. Profile,
session and data-export responses, including monitoring-profile settings in both
profile and full exports, omit `smsOverride.authToken`,
`emailOverride.apiKey` and `telegramBotToken`. Readable exported monitoring settings
remain a JSON string; unreadable settings become `null` as described above.
Exporting does not change the stored credentials. Redacted settings return `hasAuthToken` and
`hasApiKey` inside the corresponding override and `hasBotToken` alongside them.
Saving these presence flags back preserves the omitted credentials. Database
access still exposes the stored secrets. Clear `emailOverride` or `smsOverride` with `{}` and
`telegramBotToken` with an empty string. A personal key or complete SMS override
does not use the server account's recipient authorization. Email suppression
still applies. Unauthorized channels are skipped with one fixed log line naming
the channel and reason, without the recipient. Browser push requires VAPID
configuration and a permitted subscription destination.

All `/api/notifications` routes require a session. Push and Telegram registrations
are stored in SQLite under that session's profile and survive restarts. A caller's
`userId` field cannot select a different owner. Re-registering an endpoint or chat
is idempotent. A push endpoint belongs to one current profile and session;
the same profile may refresh it. A different profile receives `409` while the
registration's owning session is live, leaving that registration unchanged.
A registration without a live owning session may be claimed by the next caller.
The registration write also requires the incoming session to remain live and
bound to the caller's profile. Otherwise it returns `409` without changing any registration.
Signing out removes that session's push registrations; signing out everywhere
or resetting the password removes registrations for all revoked sessions.
Expired-session cleanup also removes that session's registrations. Expired
sessions cannot receive push. Each profile may have at most 32 endpoints bound
to live sessions; inactive rows do not count. A further new endpoint returns
`409`; refreshing one at
the limit is allowed. Endpoint, public key and auth key lengths are limited to
2048, 256 and 128 characters. DNS validation has a two-second deadline. Legacy
push rows without a session binding must be registered again. Push unsubscribe removes a named endpoint for that owner, or only the calling session's registrations when no endpoint is supplied; Telegram
unregister removes only the named chat for that owner. Status counts are scoped
to the caller. Existing in-memory registrations must be registered again once
when upgrading.

Alerts for inactive streams are saved without dispatch. For an active stream,
a previous unacknowledged successful delivery of the same or higher severity
suppresses another attempt for five minutes. Higher severity can be delivered
immediately. All alert rows remain available; skipped rows carry
`metadata.deliverySkipped` (`cooldown`, `quiet-hours`, `inactive-stream` or
`capacity`). `deliveryAttempted` records an attempt, not confirmed receipt.
`deliverySucceeded` records whether any channel accepted delivery, and
`deliveryFailed` records a settled attempt with no success. `deliveryResults`
records each channel's success, delivery, skip and timeout flags without provider
error text. A destination accepted before another times out still counts as
delivered, while the channel also reports its timeout. Failed or pending attempts do not start cooldown. Older rows without a
successful outcome do not suppress delivery.

Quiet hours skip channel delivery for low and medium server alerts. Those alerts
remain in the app and are not sent later. High and critical alerts
always bypass the window. Settings saves the browser's IANA time zone as
`quietHoursTimeZone`, the chosen local weekdays as `quietHoursDays` (Sunday = 0),
and `quietHoursStart` / `quietHoursEnd` as `HH:mm`. The current local weekday
must be selected, including the after-midnight portion of an overnight window.
The start is inclusive and the end exclusive; missing, invalid or equal times
disable the window. Missing days or an empty day list holds nothing. A legacy
profile with a window but no saved time zone holds nothing; the server logs
one fixed message without personal data explaining why. Saving settings adds
the zone and days. Browser sound settings continue to use the device clock.

Delivery runs outside the analysis worker slots. Non-critical alerts are saved
with `deliverySkipped: "capacity"` when 32 deliveries are in flight; they are not
retried later. Critical alerts always bypass this capacity check. Every channel
has a 15-second deadline and reports timeout as failure, freeing the delivery
slot when all channel results settle. Mail and SMS requests also have 15-second
request timeouts. Telegram text and photo requests use a 15-second transport
inactivity timeout so unanswered connections close; browser destinations are attempted concurrently.
Server shutdown does not wait for providers and may interrupt pending delivery.

Each admitted alert starts its channels independently. One provider failure does not
prevent the others from receiving an attempt, and an analysis retry does not
resend an existing alert. This is one best-effort attempt per channel, not a
retrying delivery outbox: a process crash between saving an alert and sending it
can leave it unsent. Provider delivery itself is not guaranteed. No new alert
WebSocket message is introduced by this change.
