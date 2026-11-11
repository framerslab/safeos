/**
 * SafeOS API Server
 *
 * Express + WebSocket server for SafeOS Guardian.
 *
 * @module api/server
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import sharp from 'sharp';
import { getSafeOSDatabase, runMigrations, generateId, now } from '../db';
import { AnalysisQueue } from '../queues/analysis-queue';
import { OllamaClient } from '../lib/ollama/client';
import { streamRoutes } from './routes/streams';
import { alertRoutes } from './routes/alerts';
import { profileRoutes } from './routes/profiles';
import { analysisRoutes } from './routes/analysis';
import { systemRoutes } from './routes/system';
import { notificationRoutes } from './routes/notifications';
import { reviewRoutes } from './routes/review';
import { authRouter } from './routes/auth';
import { webhookRouter } from './routes/webhooks';
import { exportRouter } from './routes/export';
import { analyticsRoutes } from './routes/analytics';
import { mailRoutes } from './routes/mail';
import { requestLogger } from './middleware/request-log';
import {
  standardLimiter,
  authLimiter,
  analysisLimiter,
  exportLimiter,
} from './middleware/rate-limiter';

// =============================================================================
// Types
// =============================================================================

interface WSClient {
  id: string;
  ws: WebSocket;
  streamId?: string;
  token?: string;
  profileId?: string;
  authTimer?: NodeJS.Timeout;
  subscriptions: Set<string>;
  // Heartbeat tracking
  lastPong: number;
  missedHeartbeats: number;
}

interface WSMessage {
  type: string;
  streamId?: string;
  channel?: string;
  payload?: any;
  timestamp?: number;
}

// =============================================================================
// Constants
// =============================================================================

const PORT = parseInt(process.env['SAFEOS_PORT'] || '3001', 10);
const WS_HEARTBEAT_INTERVAL = 30000;

// Rate limiting constants
const MAX_FRAMES_PER_MINUTE = 30;
const FRAME_WINDOW_MS = 60000; // 1 minute
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_FRAME_PIXELS = 16_000_000;
const MAX_WS_PAYLOAD = 3 * 1024 * 1024;
const MAX_PENDING_MESSAGES = 32;
const MAX_CONCURRENT_FRAME_DECODES = 2;
// Shared by every socket and server instance in this process.
let activeFrameDecodes = 0;
const MAX_MISSED_HEARTBEATS = 3; // Disconnect after 3 missed heartbeats (90 seconds)

/**
 * Reads SAFEOS_TRUST_PROXY as a hop count. Anything but a positive integer
 * trusts no proxy.
 */
function parseTrustProxyHops(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 0;
  return parseInt(value.trim(), 10);
}

// =============================================================================
// Server Class
// =============================================================================

export class SafeOSServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private frameAllowances = new Map<string, { count: number; resetAt: number }>();
  private analysisQueue: AnalysisQueue | null = null;
  private ollamaClient: OllamaClient;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, maxPayload: MAX_WS_PAYLOAD });
    this.ollamaClient = new OllamaClient();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  private setupMiddleware(): void {
    // Behind the bundled Caddy every request arrives from Caddy's address.
    // SAFEOS_TRUST_PROXY is the number of proxy hops in front of the API
    // (docker-compose.prod.yml sets 1), so req.ip and the rate limiter see the
    // client's address. Unset, X-Forwarded-For is ignored: a client that
    // reaches the API directly cannot choose its own address.
    const hops = parseTrustProxyHops(process.env['SAFEOS_TRUST_PROXY']);
    if (hops > 0) {
      this.app.set('trust proxy', hops);
    }

    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging (unsubscribe tokens are redacted)
    this.app.use(requestLogger);
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  private setupRoutes(): void {
    // Health check (no rate limiting)
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Apply standard rate limiting to all API routes
    this.app.use('/api', standardLimiter);

    // Mount route modules with specific rate limiters where needed
    this.app.use('/api/streams', streamRoutes);
    this.app.use('/api/alerts', alertRoutes);
    this.app.use('/api/profiles', profileRoutes);
    this.app.use('/api/analysis', analysisLimiter, analysisRoutes);
    this.app.use('/api', systemRoutes);
    this.app.use('/api/notifications', notificationRoutes);
    this.app.use('/api/review', reviewRoutes);
    this.app.use('/api/auth', authLimiter, authRouter);
    this.app.use('/api/webhooks', webhookRouter);
    this.app.use('/api/export', exportLimiter, exportRouter);
    this.app.use('/api/analytics', analyticsRoutes);
    // Unsubscribe link carried by every mail (GET asks, POST stops the mail)
    this.app.use('/api/mail', mailRoutes);

    // Ollama status
    this.app.get('/api/ollama/status', async (_req: Request, res: Response) => {
      const available = await this.ollamaClient.isHealthy();
      const models = available ? await this.ollamaClient.listModels() : [];
      res.json({ available, models });
    });

    // Ollama models
    this.app.get('/api/ollama/models', async (_req: Request, res: Response) => {
      const models = await this.ollamaClient.listModels();
      res.json({ models });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const client: WSClient = {
        id: generateId(), ws, subscriptions: new Set(),
        lastPong: Date.now(), missedHeartbeats: 0,
      };
      this.clients.set(client.id, client);
      client.authTimer = setTimeout(() => ws.close(1008, 'Session required'), 5000);

      // Browser clients authenticate in their first message. Native clients
      // may use the same headers as HTTP. Credentials never belong in URLs.
      const header = req.headers['x-session-token'];
      const token = typeof header === 'string' ? header
        : req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      let pending = token ? this.authenticateClient(client, token) : Promise.resolve();
      let queuedMessages = 0;
      ws.on('message', (data) => {
        if (++queuedMessages > MAX_PENDING_MESSAGES) {
          ws.close(1008, 'Too many pending messages');
          return;
        }
        // Preserve wire order across asynchronous session and database reads.
        pending = pending.then(async () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          let message: WSMessage;
          try {
            message = JSON.parse(data.toString());
            if (!message || typeof message.type !== 'string') throw new Error('Invalid message');
          } catch {
            ws.close(1007, 'Invalid message');
            return;
          }
          if (!client.profileId) {
            if (message.type !== 'authenticate') {
              ws.close(1008, 'Session required');
              return;
            }
            await this.authenticateClient(client, message.payload?.token);
            return;
          }
          if (await this.validateClientSession(client)) await this.handleWSMessage(client, message);
        }).catch(() => ws.close(1011, 'Unable to process message')).finally(() => { queuedMessages--; });
      });
      ws.on('close', () => {
        clearTimeout(client.authTimer);
        this.clients.delete(client.id);
      });
      // Do not log message bodies, headers or decoder errors containing input.
      ws.on('error', () => ws.close());
    });

    // Start heartbeat with stale client cleanup
    this.heartbeatInterval = setInterval(() => {
      const staleClients: string[] = [];
      for (const [profileId, allowance] of this.frameAllowances) {
        if (allowance.resetAt <= Date.now()) this.frameAllowances.delete(profileId);
      }

      this.clients.forEach((client) => {
        if (!client.profileId) return;
        void this.validateClientSession(client);
        if (client.ws.readyState === WebSocket.OPEN) {
          // Increment missed heartbeats (will be reset when pong received)
          client.missedHeartbeats++;

          if (client.missedHeartbeats > MAX_MISSED_HEARTBEATS) {
            // Client is stale, mark for removal
            console.log(`Stale client detected, disconnecting: ${client.id}`);
            staleClients.push(client.id);
            client.ws.close(1000, 'Heartbeat timeout');
          } else {
            this.sendToClient(client, { type: 'ping' });
          }
        } else {
          // Connection not open, mark for cleanup
          staleClients.push(client.id);
        }
      });

      // Cleanup stale clients
      staleClients.forEach((id) => this.clients.delete(id));

      if (staleClients.length > 0) {
        console.log(`Cleaned up ${staleClients.length} stale WebSocket client(s)`);
      }
    }, WS_HEARTBEAT_INTERVAL);
  }

  private async authenticateClient(client: WSClient, token: unknown): Promise<void> {
    if (typeof token !== 'string' || !token || token.length > 512) {
      client.ws.close(1008, 'Invalid session');
      return;
    }
    client.token = token;
    if (await this.validateClientSession(client)) {
      clearTimeout(client.authTimer);
      this.sendToClient(client, { type: 'connected', payload: { clientId: client.id } });
    }
  }

  private async validateClientSession(client: WSClient): Promise<boolean> {
    try {
      const db = await getSafeOSDatabase();
      const session = await db.get<{ profile_id: string; expires_at: string }>(
        `SELECT s.profile_id, s.expires_at FROM sessions s
         JOIN user_profiles p ON p.id = s.profile_id WHERE s.token = ?`, [client.token || '']
      );
      if (session && Date.parse(session.expires_at) > Date.now()
          && (!client.profileId || client.profileId === session.profile_id)) {
        client.profileId = session.profile_id;
        return true;
      }
      client.ws.close(1008, 'Invalid or expired session');
    } catch {
      client.ws.close(1011, 'Unable to validate session');
    }
    return false;
  }

  private streamForbidden(client: WSClient): void {
    this.sendToClient(client, {
      type: 'error', payload: { code: 'STREAM_FORBIDDEN', message: 'Stream unavailable' },
    });
  }

  private async ownsStream(client: WSClient, streamId: unknown): Promise<boolean> {
    if (!client.profileId || typeof streamId !== 'string' || !streamId) return false;
    const db = await getSafeOSDatabase();
    return !!await db.get('SELECT id FROM streams WHERE id = ? AND user_id = ?', [streamId, client.profileId]);
  }

  private async handleWSMessage(client: WSClient, message: WSMessage): Promise<void> {
    if (['join_stream', 'frame', 'audio_level', 'offer', 'answer', 'ice-candidate'].includes(message.type)) {
      if (!await this.ownsStream(client, message.streamId)) {
        this.streamForbidden(client);
        return;
      }
    }
    switch (message.type) {
      case 'ping':
        this.sendToClient(client, { type: 'pong' });
        break;

      case 'pong':
        // Client responded to heartbeat - reset tracking
        client.lastPong = Date.now();
        client.missedHeartbeats = 0;
        break;

      case 'subscribe':
        if (message.channel) {
          if (message.channel.startsWith('stream:') && !await this.ownsStream(client, message.channel.slice(7))) {
            this.streamForbidden(client);
            return;
          }
          client.subscriptions.add(message.channel);
          console.log(`Client ${client.id} subscribed to ${message.channel}`);
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          client.subscriptions.delete(message.channel);
        }
        break;

      case 'join_stream':
        if (message.streamId) {
          client.streamId = message.streamId;
          console.log(`Client ${client.id} joined stream ${message.streamId}`);
        }
        break;

      case 'leave_stream':
        client.streamId = undefined;
        break;

      case 'frame':
        await this.handleFrame(client, message);
        break;

      case 'audio_level':
        await this.handleAudioLevel(client, message);
        break;

      // WebRTC signaling
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        await this.handleSignaling(client, message);
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  private frameError(client: WSClient, code: 'INVALID_FRAME' | 'FRAME_TOO_LARGE'): void {
    this.sendToClient(client, {
      type: 'error', payload: { code, message: 'Use a decodable JPEG, PNG or WebP up to 2 MiB and 16 megapixels' },
    });
  }

  private async handleFrame(client: WSClient, message: WSMessage): Promise<void> {
    const { streamId, payload } = message;
    if (!streamId || !payload) return;

    // Reserve before decoding or awaiting: simultaneous sockets share one
    // allowance for the profile, and disconnecting never deletes it.
    const currentTime = Date.now();
    let allowance = this.frameAllowances.get(client.profileId!);
    if (!allowance || allowance.resetAt <= currentTime) {
      allowance = { count: 0, resetAt: currentTime + FRAME_WINDOW_MS };
      this.frameAllowances.set(client.profileId!, allowance);
    }
    if (allowance.count >= MAX_FRAMES_PER_MINUTE) {
      this.sendToClient(client, {
        type: 'error', payload: { code: 'RATE_LIMITED', message: 'Maximum 30 frame attempts per minute' },
      });
      return;
    }
    allowance.count++;

    let { imageData } = payload;
    const { motionScore, audioLevel } = payload;
    if (typeof imageData !== 'string') {
      this.frameError(client, 'INVALID_FRAME');
      return;
    }
    // Accept the camera's data URL as well as plain base64; store plain base64.
    imageData = imageData.replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
    if (imageData.length > 4 * Math.ceil(MAX_FRAME_BYTES / 3)) {
      this.frameError(client, 'FRAME_TOO_LARGE');
      return;
    }
    if (!imageData || imageData.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
      this.frameError(client, 'INVALID_FRAME');
      return;
    }
    const bytes = Buffer.from(imageData, 'base64');
    if (bytes.length > MAX_FRAME_BYTES) {
      this.frameError(client, 'FRAME_TOO_LARGE');
      return;
    }
    if (activeFrameDecodes >= MAX_CONCURRENT_FRAME_DECODES) {
      this.sendToClient(client, {
        type: 'error', payload: { code: 'RATE_LIMITED', message: 'Frame decoder busy; retry later' },
      });
      return;
    }
    activeFrameDecodes++;
    try {
      if (bytes.toString('base64') !== imageData) throw new Error('Invalid base64');
      const image = sharp(bytes, { limitInputPixels: MAX_FRAME_PIXELS, failOn: 'warning' });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) {
        throw new Error('Unsupported image');
      }
      // Statistics scan the decoded pixels without returning a full bitmap
      // to JavaScript. Metadata alone cannot establish image integrity.
      await image.stats();
    } catch {
      this.frameError(client, 'INVALID_FRAME');
      return;
    } finally {
      activeFrameDecodes--;
    }
    if (!await this.validateClientSession(client) || !await this.ownsStream(client, streamId)) return;

    // Store frame in buffer
    const db = await getSafeOSDatabase();
    const stream = await db.get<{ scenario: 'baby' | 'pet' | 'elderly' }>(
      'SELECT scenario FROM streams WHERE id = ? AND user_id = ?', [streamId, client.profileId]
    );
    if (!stream) {
      this.streamForbidden(client);
      return;
    }
    const frameId = generateId();
    await db.run(
      `INSERT INTO frame_buffer (id, stream_id, frame_data, motion_score, audio_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [frameId, streamId, imageData, motionScore || 0, audioLevel || 0, now()]
    );

    // Queue for analysis if motion/audio detected
    const motionThreshold = 10; // Adjust based on scenario
    const audioThreshold = 15;

    if ((motionScore || 0) >= motionThreshold || (audioLevel || 0) >= audioThreshold) {
      if (this.analysisQueue) {
        await this.analysisQueue.enqueue({
          id: generateId(),
          streamId,
          frameId,
          imageData,
          motionScore: motionScore || 0,
          audioLevel: audioLevel || 0,
          scenario: stream.scenario,
          priority: (motionScore || 0) > 50 ? 2 : 1,
          status: 'pending',
          createdAt: now(),
        });
      }
    }

    // Broadcast motion/audio levels to subscribers
    this.broadcastToStream(streamId, {
      type: 'metrics',
      streamId,
      payload: { motionScore, audioLevel },
    });
  }

  private async handleAudioLevel(client: WSClient, message: WSMessage): Promise<void> {
    const { streamId, payload } = message;
    if (!streamId || !payload) return;

    // Broadcast audio level
    this.broadcastToStream(streamId, {
      type: 'audio_level',
      streamId,
      payload: { level: payload.level, hasCrying: payload.hasCrying },
    });
  }

  private async handleSignaling(client: WSClient, message: WSMessage): Promise<void> {
    const { type, streamId, payload } = message;
    const targetClient = this.clients.get(payload?.targetPeerId);
    if (!streamId || client.streamId !== streamId || !targetClient
        || targetClient.streamId !== streamId || targetClient.profileId !== client.profileId
        || !await this.validateClientSession(targetClient)) {
      this.streamForbidden(client);
      return;
    }
    this.sendToClient(targetClient, {
      type, streamId, payload: { ...payload, peerId: client.id },
    });
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------

  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ ...message, timestamp: Date.now() }));
    }
  }

  public broadcast(channel: string, message: WSMessage): void {
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel)) {
        this.sendToClient(client, message);
      }
    });
  }

  public broadcastToStream(streamId: string, message: WSMessage): void {
    this.clients.forEach((client) => {
      if (client.streamId === streamId) {
        void this.sendStreamMessage(client, streamId, message);
      }
    });
  }

  private async sendStreamMessage(client: WSClient, streamId: string, message: WSMessage): Promise<void> {
    try {
      if (await this.validateClientSession(client) && await this.ownsStream(client, streamId)
          && client.streamId === streamId) this.sendToClient(client, message);
    } catch {
      client.ws.close(1011, 'Stream unavailable');
    }
  }

  public broadcastToAll(message: WSMessage): void {
    this.clients.forEach((client) => {
      this.sendToClient(client, message);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    // Initialize database
    const db = await getSafeOSDatabase();
    await runMigrations(db);
    console.log('Database initialized');

    // Check Ollama
    const ollamaAvailable = await this.ollamaClient.isHealthy();
    console.log(`Ollama: ${ollamaAvailable ? 'available' : 'not available'}`);

    if (ollamaAvailable) {
      // Ensure required models are available
      await this.ollamaClient.ensureModels(['moondream', 'llava:7b']);
    }

    // Initialize analysis queue
    this.analysisQueue = new AnalysisQueue({
      concurrency: 2,
      maxRetries: 3,
      retryDelay: 5000,
    });
    await this.analysisQueue.start();
    console.log('Analysis queue started');

    // Start server
    return new Promise((resolve) => {
      this.server.listen(PORT, () => {
        console.log(`SafeOS server running on port ${PORT}`);
        console.log(`WebSocket server ready`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    console.log('Shutting down SafeOS server...');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Stop analysis queue
    if (this.analysisQueue) {
      await this.analysisQueue.stop();
    }

    // Close all WebSocket connections
    this.clients.forEach((client) => {
      clearTimeout(client.authTimer);
      client.ws.close();
    });
    this.clients.clear();

    // Close server
    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  getApp(): Express {
    return this.app;
  }
}

// =============================================================================
// Entry Point
// =============================================================================

// Start server if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const server = new SafeOSServer();
  server.start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

export default SafeOSServer;
