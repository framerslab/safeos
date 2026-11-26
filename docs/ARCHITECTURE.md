# SafeOS Guardian - Architecture Overview

This document describes the system architecture, data flow, and component hierarchy.

---

## System Modes

SafeOS Guardian operates in two modes:

### Mode 1: Standalone PWA (No Server)

```
+------------------------------------------------------------------+
|                    Guardian UI (Static PWA)                       |
|                                                                   |
|  +------------------+  +------------------+  +------------------+ |
|  |   Camera Feed    |  |  Audio Monitor   |  |   Alert Panel    | |
|  |  (MediaStream)   |  |   (Web Audio)    |  |  (Local Notif)   | |
|  +--------+---------+  +--------+---------+  +------------------+ |
|           |                     |                                 |
|  +--------v---------------------v--------------------------------+|
|  |                    Browser AI Engine                          ||
|  |  +------------------+  +------------------------------------+ ||
|  |  | TensorFlow.js    |  | Cache Storage                      | ||
|  |  | COCO-SSD         |  | Shared detection weights           | ||
|  |  | (detection)      |  | (after download agreement)         | ||
|  |  +------------------+  +------------------------------------+ ||
|  +---------------------------------------------------------------+|
|                                                                   |
|  +---------------------------------------------------------------+|
|  |        Browser storage (localStorage and IndexedDB)           ||
|  |  - Settings        - Alert history       - Pets, fingerprints ||
|  +---------------------------------------------------------------+|
+------------------------------------------------------------------+

Deploy to: GitHub Pages, Vercel, Netlify, any static host
Offline starts need completed app installation and a saved detection model
```

### Mode 2: Full Stack (Optional Server)

```
+------------------+          +------------------+          +------------------+
|   Guardian UI    |  <--->   |   SafeOS API     |  <--->   |     Ollama       |
|   (PWA)          |    WS    |   (Express)      |          |   (Optional)     |
+------------------+          +------------------+          +------------------+
        |                            |
        |                  +---------+---------+
        |                  |                   |
        |            +-----v-----+       +-----v-----+
        |            |  SQLite   |       | Analysis  |
        |            | Database  |       |   Queue   |
        |            +-----------+       +-----------+
        |
        +-----------------+-----------------+-----------------+
                          |                 |                 |
                    +-----v-----+     +-----v-----+     +-----v-----+
                    |  Twilio   |     | Telegram  |     |  Cloud    |
                    |   SMS     |     |    Bot    |     | Fallback  |
                    +-----------+     +-----------+     +-----------+
```

---

## Component Hierarchy

### Backend Components

```
src/
├── api/
│   ├── server.ts              # Express + WebSocket server
│   ├── routes/
│   │   ├── streams.ts         # Stream CRUD (multi-tenant)
│   │   ├── alerts.ts          # Alert management
│   │   ├── analysis.ts        # Analysis results
│   │   ├── export.ts          # Data export (GDPR)
│   │   ├── profiles.ts        # Monitoring profiles
│   │   ├── auth.ts            # Authentication
│   │   └── health.ts          # Health checks
│   ├── middleware/
│   │   ├── auth.ts            # Session validation
│   │   └── validate.ts        # Zod schema validation
│   ├── schemas/
│   │   └── index.ts           # API validation schemas
│   └── utils/
│       └── errors.ts          # Standardized error responses
│
├── db/
│   └── index.ts               # SQLite database layer
│
├── lib/
│   ├── analysis/
│   │   ├── frame-analyzer.ts  # Vision analysis orchestrator
│   │   ├── cloud-fallback.ts  # Cloud LLM fallback
│   │   └── profiles/          # Scenario-specific prompts
│   │       ├── pet.ts
│   │       ├── baby.ts
│   │       └── elderly.ts
│   │
│   ├── alerts/
│   │   ├── escalation.ts      # Volume ramping algorithm
│   │   ├── notification-manager.ts
│   │   ├── browser-push.ts    # Web Push notifications
│   │   ├── twilio.ts          # SMS notifications
│   │   └── telegram.ts        # Telegram notifications
│   │
│   ├── ollama/
│   │   └── client.ts          # Ollama API client
│   │
│   ├── safety/
│   │   ├── content-filter.ts  # Content moderation
│   │   └── disclaimers.ts     # Safety disclaimers
│   │
│   └── webrtc/
│       └── signaling.ts       # WebRTC signaling
│
├── queues/
│   ├── analysis-queue.ts      # Frame analysis job queue
│   └── review-queue.ts        # Human review queue
│
└── types/
    └── index.ts               # TypeScript definitions
```

### Frontend Components

```
apps/guardian-ui/src/
├── app/                       # Next.js pages
│   ├── page.tsx               # Home page
│   ├── dashboard/             # Dashboard: watching state, ways to watch, new alerts
│   ├── monitor/               # Motion and sound
│   ├── setup/                 # Setup
│   ├── settings/              # User settings
│   ├── history/               # Alert history
│   └── profiles/              # Forward to Detection settings
│
├── components/
│   ├── CameraFeed.tsx         # WebRTC camera capture
│   ├── AlertPanel.tsx         # Alert display & acknowledgment
│   ├── app/                   # App header, phone bar, new-alert count
│   ├── dashboard/             # The dashboard's parts
│   ├── DetectionZoneEditor.tsx # Zone configuration
│   ├── LostFoundSetup.tsx     # Lost pet/person setup
│   ├── SettingsPanel.tsx      # Settings UI
│   └── StreamGrid.tsx         # Multi-stream grid
│
├── lib/
│   ├── visual-fingerprint.ts  # Lost & Found matching
│   ├── motion-detection.ts    # Pixel-based motion
│   ├── audio-levels.ts        # Audio analysis
│   ├── websocket.ts           # WebSocket client
│   └── webrtc-client.ts       # WebRTC client
│
└── stores/                    # Zustand state stores
    ├── monitoring-store.ts    # Monitoring state
    ├── lost-found-store.ts    # Lost & Found state
    └── onboarding-store.ts    # Setup state
```

---

## Data Flow

### Frame Analysis Pipeline

Each page watches in its own way. Code: `apps/guardian-ui/src/components/CameraFeed.tsx`,
`apps/guardian-ui/src/app/monitor/page.tsx`, `apps/guardian-ui/src/lib/person-detection.ts`,
`src/api/server.ts` and `src/queues/analysis-queue.ts`.

```
Motion and sound (/monitor/) - runs no model
  Camera frame -> pixel and motion check every 200 ms (browser)
  Microphone   -> sound level every 100 ms (browser)
       |
       +--> local alerts: motion, picture change, sound (browser)
       |
       +--> only with a saved server and a processing mode that uses it:
            at most once a second, while motion, sound or the picture change
            is over its line, the frame goes to the server over the WebSocket
                 |
                 v
            Server: stores the frame; queues it when its motion or sound
            score is over the server's line
                 |
                 v
            Ollama: moondream takes a first look; llava:7b a closer one
            when the first finds a concern
                 |
                 v (only when Ollama is down or its analysis fails,
                    and a cloud key is set)
            Cloud: OpenRouter, then OpenAI, then Anthropic, until one answers
                 |
                 v
            Alert to the browser over the WebSocket, and email, SMS and
            Telegram as the profile chose

Lost and Found (/monitor/) - runs no model
  Camera frame -> colours and outline compared with the pet's photos,
                  up to twice a second (every 500 ms, 900 ms in hybrid mode),
                  fewer when the device cannot keep up (browser)

People (/security/) and Wildlife (/wildlife/) - send nothing to the server
  Camera frame -> their own motion check (browser)
       |
       v (motion over the line; People also every 5 s while triggered or alerting)
  COCO-SSD on TensorFlow.js: WebGL on the graphics chip, or the processor
  without hardware WebGL (browser); People at most every 500 ms,
  Wildlife at most once a second
       |
       v
  Alert, sound or spoken words, and a browser notification (browser)
```

### Alert Escalation Flow

An alert nobody acknowledges climbs five levels, each louder. The browser and the
server count the waits differently.

In the browser (`apps/guardian-ui/src/components/AlertPanel.tsx`), each level's wait
follows the level before (`delaySeconds`, `apps/guardian-ui/src/stores/settings-store.ts`),
so with the default waits the levels come at:

```
Level 1: at once
Level 2: 30 s
Level 3: 90 s   (60 s after level 2)
Level 4: 210 s  (120 s after level 3)
Level 5: 390 s  (180 s after level 4), repeating until acknowledged
```

Settings, Alert Escalation (`/settings/escalation`) changes each wait.

On the server (`src/lib/alerts/escalation.ts`), each level's delay counts from the
alert's creation:

```
Level 1: at once     browser
Level 2: 30 s        browser, Telegram
Level 3: 60 s        browser, Telegram
Level 4: 120 s       browser, Telegram, SMS
Level 5: 180 s       browser, Telegram, SMS
```

---

## Database Schema

### Core Tables

```sql
-- User sessions and authentication
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_id TEXT,
    is_guest INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
);

-- Monitoring streams
CREATE TABLE streams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scenario TEXT CHECK(scenario IN ('pet', 'baby', 'elderly')),
    status TEXT DEFAULT 'active',
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Frame buffer (privacy: 10-minute rolling window)
CREATE TABLE frame_buffer (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    frame_data BLOB,
    motion_score REAL,
    audio_level REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES streams(id)
);

-- Analysis results
CREATE TABLE analysis_results (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    frame_id TEXT,
    concern_level TEXT CHECK(concern_level IN ('none', 'low', 'medium', 'high', 'critical')),
    description TEXT,
    detected_issues TEXT,  -- JSON array
    processing_time_ms INTEGER,
    model_used TEXT,
    is_cloud_fallback INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES streams(id)
);

-- Alerts
CREATE TABLE alerts (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
    message TEXT,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES streams(id)
);
```

### Indexes

```sql
CREATE INDEX idx_alerts_stream_id ON alerts(stream_id);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX idx_streams_user_id ON streams(user_id);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_analysis_results_stream_id ON analysis_results(stream_id);
CREATE INDEX idx_frame_buffer_stream_id ON frame_buffer(stream_id);
CREATE INDEX idx_frame_buffer_created_at ON frame_buffer(created_at);
```

---

## WebSocket Protocol

A valid session is required through handshake headers or a browser's first
`authenticate` message. The server sends `connected` only after validation.
Stream joins, frames, audio and signalling are restricted to the stream owner;
signalling peers must also be joined to the same stream.

### Client -> Server Messages

```typescript
// First message for a browser client
{ type: 'authenticate', payload: { token: 'session-token' } }

// Submit a frame after receiving connected
{
  type: 'frame',
  streamId: 'stream-id',
  payload: { imageData: 'base64-image', motionScore: 15, audioLevel: 8 }
}

// Heartbeat response
{ type: 'pong' }
```

Frames fully decode as JPEG, PNG or WebP before storage, with a 2 MiB byte
limit and 16 megapixel limit. At most two frames decode concurrently across
the process, without returning full bitmaps to JavaScript. Analysis jobs use
the stream's stored scenario.
See [WebSocket API](API.md#websocket-api) for the complete wire format.

### Server -> Client Messages

```typescript
{ type: 'connected', payload: { clientId: 'peer-id' } }
{ type: 'metrics', streamId: 'stream-id', payload: { motionScore: 15, audioLevel: 8 } }
{ type: 'audio_level', streamId: 'stream-id', payload: { level: 12, hasCrying: false } }
{ type: 'ping' }
{ type: 'error', payload: { code: 'RATE_LIMITED', message: 'Maximum 30 frame attempts per minute' } }
```

The current analysis worker does not emit alert or analysis-result socket
events. Those records are read and acknowledged through HTTP.

---

## Security Architecture

### Multi-Tenancy

All data access is scoped by `user_id`:

```sql
-- Example: Fetching user's streams
SELECT * FROM streams WHERE user_id = ?;

-- Example: Fetching user's alerts (via stream ownership)
SELECT a.* FROM alerts a
INNER JOIN streams s ON a.stream_id = s.id
WHERE s.user_id = ?;
```

### Authentication Flow

```
1. Client sends session token in X-Session-Token header
2. Auth middleware validates token against sessions table
3. Profile ID extracted and attached to request
4. Route handlers use profile ID for data scoping
```

### Rate Limiting

```
WebSocket:
- 30 frame attempts/minute per profile across sessions and connections
- Allowances survive reconnects; process restarts reset them
- 3 MiB maximum message; 32 pending messages per connection
- Heartbeat timeout: 90 seconds (3 missed pings)
- Stale clients automatically disconnected

HTTP API:
- Pagination enforced (max 100 items/request)
- Export limits (10,000 records max)
```

---

## AI Model Hierarchy

```
Browser (People and Wildlife only)
  COCO-SSD lite_mobilenet_v2 on TensorFlow.js, 18.6 MB, downloaded from
  Google's storage after the person agrees and kept in Cache Storage.
  People and Wildlife hand no frame on to the server's models.

Server you run (frames from Motion and sound, in a processing mode that uses it)
  Ollama: moondream (1.7 GB), a first look at each queued frame
          llava:7b (4.7 GB), a closer look when the first finds a concern
      |
      v (only when Ollama is down or its analysis fails, and a key is set)
  Cloud, in this order until one answers (src/lib/analysis/cloud-fallback.ts):
          google/gemini-2.5-flash via OpenRouter
          gpt-5.6-terra via OpenAI
          claude-haiku-5-5 via Anthropic
```

The download sizes are the ones ollama.com lists for
[moondream](https://ollama.com/library/moondream) and [llava](https://ollama.com/library/llava).

---

## See Also

- [Configuration Reference](./CONFIGURATION.md)
- [API Documentation](./API.md)
- [Development Guide](./DEVELOPMENT.md)


### Server frame retention

The optional API server deletes frame-buffer rows at startup and every second,
including frames from ended streams. The cutoff is ten minutes old; deletion
runs on the next sweep (normally within one second), independently of new writes.
Shutdown and failed startup stop the retention and heartbeat timers and wait for
an active sweep. Model initialization and listen errors reject startup after
scheduled work stops; an occupied port does not leave cleanup running. Restarting
a stopped server recreates its WebSocket listener as well as its scheduled work. Cleanup
errors log one fixed line and a known error class name,
without messages, stacks or stored values; later sweeps still run. An initial
cleanup failure rejects startup with a fixed message after logging once. A stopped
server cannot run cleanup; startup removes expired rows before accepting uploads. This is
logical deletion of rows, not a promise of forensic erasure from SQLite pages or
backups. Keep backups protected and expire them separately.


### Analysis job identity

Each queue row stores the triggering `frame_id`. The worker reads that frame in
that stream. New jobs require a frame ID; legacy jobs without one fail explicitly
with a fixed diagnostic. When no result was saved and retention has removed the
frame or it is too old, the worker completes without an analysis or alert. It
never substitutes a later image. Startup adds the column to existing
databases without removing queued rows. On worker startup, interrupted
`processing` rows return to `pending`. Recovery reuses saved results and alert
IDs and applies the same ten-minute frame cutoff. Only one API process may own
this SQLite queue.


### Alert dispatch

The SQLite worker claims each pending job atomically. It uses the job ID for the
analysis result and a stable derived alert ID, so retrying completion cannot
insert another result or resend the saved alert. A retry reuses an already
persisted result before reading the frame or calling a model, and finishes
creating its alert if that insertion previously failed. After inserting a new alert it
loads an active stream owner's notification settings and dispatches through that
owner's severity-eligible channels (SMS for high/critical; push, Telegram and
email from medium). Push subscriptions and Telegram chats are read from their
owner-scoped SQLite tables. Push destinations are checked at registration and
delivery, including public DNS resolution with a two-second deadline, pinned to
the connection. Push registration preserves an endpoint's live owner; only that
profile may update it until the owning session ends. Registration limits count
at most 32 live-session endpoints per profile and bound key sizes. Session
removal also deletes its push registrations, including sign-out, sign-out
everywhere, password reset and expired-session cleanup. Expired and legacy unbound
registrations cannot receive push. Server SMS
requires the owner's verified phone, server email requires an operator owner, and
server-bot Telegram is skipped until recipient verification exists. Personal
provider credentials remain available. Channel attempts start concurrently and report their
own failures; they do not trigger analysis retries. Alert insertion atomically
records a five-minute cooldown against unacknowledged attempts of the same or
higher severity that reached at least one channel; escalation bypasses that
cooldown. Quiet hours skip low and medium delivery in the saved local time zone
and on selected weekdays. Alerts remain in the app and are not sent later. High and critical alerts always bypass quiet hours.
Legacy windows without a time zone hold nothing and produce a fixed log message.
Dispatch runs outside analysis slots with a 15-second deadline per channel.
Telegram also applies a 15-second transport inactivity timeout to text and photo
requests, releasing unanswered connections even after dispatch stops waiting.
Critical alerts bypass the 32-delivery capacity check, and shutdown does not wait
on providers. Skips and settled delivery outcomes are recorded on each alert. See the API delivery settings
for configuration and the best-effort delivery limitation.
