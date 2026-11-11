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
|  |                    IndexedDB Storage                          ||
|  |  - Settings        - Alert history       - Fingerprints       ||
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
│   ├── page.tsx               # Dashboard
│   ├── monitor/               # Live monitoring
│   ├── setup/                 # Onboarding wizard
│   ├── settings/              # User settings
│   ├── history/               # Alert history
│   └── profiles/              # Profile management
│
├── components/
│   ├── CameraFeed.tsx         # WebRTC camera capture
│   ├── AlertPanel.tsx         # Alert display & acknowledgment
│   ├── Dashboard.tsx          # Main dashboard layout
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
    └── onboarding-store.ts    # Onboarding wizard state
```

---

## Data Flow

### Frame Analysis Pipeline

```
Camera Frame
     |
     v
+--------------------+
|   Motion Detection |  (Browser: pixel diff)
+--------------------+
     |
     v (motion detected?)
+--------------------+
|   Audio Analysis   |  (Browser: Web Audio API)
+--------------------+
     |
     v
+--------------------+
|   TensorFlow.js    |  (Browser: COCO-SSD)
|   Object Detection |
+--------------------+
     |
     v (uncertain?)
+--------------------+
|   Ollama LLM       |  (Server: moondream/llava)
+--------------------+
     |
     v (still uncertain?)
+--------------------+
|   Cloud Fallback   |  (Server: Gemini/GPT-4o)
+--------------------+
     |
     v
+--------------------+
|   Alert Generation |
+--------------------+
     |
     v
+--------------------+
|   Notification     |  (Browser Push / SMS / Telegram)
+--------------------+
```

### Alert Escalation Flow

```
Alert Created
     |
     v
Level 1 (0s): Soft chime @ 30% volume
     |
     v (30s, not acknowledged)
Level 2: Medium tone @ 50% volume
     |
     v (60s, not acknowledged)
Level 3: Attention tone @ 70% volume
     |
     v (90s, not acknowledged)
Level 4: Urgent tone @ 90% volume
     |
     v (120s, not acknowledged)
Level 5: Continuous alarm @ 100% volume
     |
     v (acknowledged)
Alert Silenced
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

### Client -> Server Messages

```typescript
// Submit frame for analysis
{
  type: 'frame',
  streamId: string,
  frameData: string,  // base64
  motionScore: number,
  audioLevel: number,
  timestamp: string
}

// Acknowledge alert
{
  type: 'acknowledge',
  alertId: string
}

// Heartbeat response
{
  type: 'pong'
}
```

### Server -> Client Messages

```typescript
// Alert notification
{
  type: 'alert',
  alert: {
    id: string,
    streamId: string,
    alertType: string,
    severity: string,
    message: string,
    createdAt: string
  }
}

// Analysis result
{
  type: 'analysis',
  result: {
    concernLevel: string,
    description: string,
    detectedIssues: string[]
  }
}

// Heartbeat ping
{
  type: 'ping'
}

// Rate limit warning
{
  type: 'rate_limited',
  message: string,
  retryAfter: number
}
```

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
- 30 frames/minute per client
- Heartbeat timeout: 90 seconds (3 missed pings)
- Stale clients automatically disconnected

HTTP API:
- Pagination enforced (max 100 items/request)
- Export limits (10,000 records max)
```

---

## AI Model Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    Tier 1: Browser (Free)                    │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ TensorFlow.js   │  │ Cache Storage                   │   │
│  │ COCO-SSD (18MB) │  │ Shared COCO-SSD weights         │   │
│  │ Real-time       │  │ Saved after explicit agreement  │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              v (uncertain?)
┌─────────────────────────────────────────────────────────────┐
│                 Tier 2: Local LLM (Ollama)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ moondream       │  │ llava:7b        │  │ llama3.2    │  │
│  │ (~1.7GB)        │  │ (~4GB)          │  │ vision:11b  │  │
│  │ Fast triage     │  │ Detailed        │  │ Complex     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              v (still uncertain?)
┌─────────────────────────────────────────────────────────────┐
│                   Tier 3: Cloud Fallback                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Gemini Flash    │  │ GPT-4o-mini     │  │ Claude 3    │  │
│  │ (OpenRouter)    │  │ (OpenAI)        │  │ Haiku       │  │
│  │ Fast, cheap     │  │ Reliable        │  │ Last resort │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

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
an active sweep. Cleanup errors log one fixed line and a known error class name,
without messages, stacks or stored values; later sweeps still run. An initial
cleanup failure rejects startup with a fixed message after logging once. A stopped
server cannot run cleanup; startup removes expired rows before accepting uploads. This is
logical deletion of rows, not a promise of forensic erasure from SQLite pages or
backups. Keep backups protected and expire them separately.


### Analysis job identity

Each queue row stores the triggering `frame_id`. The worker reads that frame in
that stream, including on retry. If retention has removed it, it is too old, or a
legacy job has no frame ID, the worker completes the job without an analysis or
alert. It never substitutes a later image. Startup adds the column to existing
databases without removing queued rows.


### Alert dispatch

The SQLite worker claims each pending job atomically. It uses the job ID for the
analysis result and a stable derived alert ID, so retrying completion cannot
insert another result or resend the saved alert. After inserting a new alert it
loads the stream owner's notification settings and dispatches through that
owner's severity-eligible channels (SMS for high/critical; push, Telegram and
email from medium). Push subscriptions and Telegram chats are read from their
owner-scoped SQLite tables. Push destinations are checked at registration and
delivery, including public DNS resolution pinned to the connection. Server SMS
requires the owner's verified phone, server email requires an operator owner, and
server-bot Telegram is skipped until recipient verification exists. Personal
provider credentials remain available. Channel attempts start concurrently and report their
own failures; they do not trigger analysis retries. See the API delivery settings
for configuration and the best-effort delivery limitation.
