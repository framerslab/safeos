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
import { cleanupOldFrames, getSafeOSDatabase, runMigrations, generateId, now } from '../db';
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
  subscriptions: Set<string>;
  // Rate limiting
  frameCount: number;
  frameWindowStart: number;
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
  private analysisQueue: AnalysisQueue | null = null;
  private ollamaClient: OllamaClient;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private frameCleanupInterval: NodeJS.Timeout | null = null;
  private frameCleanup: Promise<void> | null = null;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
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
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = generateId();
      const now = Date.now();
      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        // Initialize rate limiting
        frameCount: 0,
        frameWindowStart: now,
        // Initialize heartbeat tracking
        lastPong: now,
        missedHeartbeats: 0,
      };
      this.clients.set(clientId, client);

      console.log(`WebSocket client connected: ${clientId}`);

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        payload: { clientId },
      });

      // Handle messages
      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await this.handleWSMessage(client, message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      });

      // Handle close
      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      // Handle error
      ws.on('error', (err) => {
        console.error(`WebSocket error for ${clientId}:`, err);
      });
    });

    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    // Start heartbeat with stale client cleanup
    this.heartbeatInterval = setInterval(() => {
      const staleClients: string[] = [];

      this.clients.forEach((client) => {
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

  private async handleWSMessage(client: WSClient, message: WSMessage): Promise<void> {
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
        this.handleSignaling(client, message);
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  private async handleFrame(client: WSClient, message: WSMessage): Promise<void> {
    const { streamId, payload } = message;
    if (!streamId || !payload) return;

    // Rate limiting check
    const currentTime = Date.now();
    if (currentTime - client.frameWindowStart > FRAME_WINDOW_MS) {
      // Reset window
      client.frameCount = 0;
      client.frameWindowStart = currentTime;
    }

    client.frameCount++;

    if (client.frameCount > MAX_FRAMES_PER_MINUTE) {
      // Rate limit exceeded - notify client and drop frame
      this.sendToClient(client, {
        type: 'error',
        payload: {
          code: 'RATE_LIMITED',
          message: `Frame rate limit exceeded (max ${MAX_FRAMES_PER_MINUTE}/min). Frame dropped.`,
        },
      });
      console.log(`Rate limit exceeded for client ${client.id}: ${client.frameCount} frames/min`);
      return;
    }

    const { imageData, motionScore, audioLevel } = payload;

    // Store frame in buffer
    const db = await getSafeOSDatabase();
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
          scenario: 'baby', // TODO: Get from stream
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

  private handleSignaling(client: WSClient, message: WSMessage): void {
    const { type, payload } = message;
    const targetPeerId = payload?.targetPeerId;

    if (!targetPeerId) return;

    // Find target client and forward message
    const targetClient = Array.from(this.clients.values()).find(
      (c) => c.id === targetPeerId
    );

    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
      this.sendToClient(targetClient, {
        type,
        payload: {
          ...payload,
          peerId: client.id,
        },
      });
    }
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
        this.sendToClient(client, message);
      }
    });
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
    try {
      if (!this.heartbeatInterval) this.startHeartbeat();
      // Initialize database
      const db = await getSafeOSDatabase();
      await runMigrations(db);
      console.log('Database initialized');

      // Retention must keep running even when every camera stops uploading.
      await cleanupOldFrames(db);
      this.frameCleanupInterval = setInterval(() => {
        if (this.frameCleanup) return this.frameCleanup;
        this.frameCleanup = cleanupOldFrames(db)
          .catch((error: unknown) => {
            // Error messages and stacks may contain SQL values. Only emit a known class name.
            const names = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError', 'AggregateError', 'SqliteError'];
            const name = error instanceof Error && names.includes(error.name) ? error.name : 'Error';
            console.error(`Frame retention cleanup failed (${name})`);
          })
          .finally(() => { this.frameCleanup = null; });
        return this.frameCleanup;
      }, 1000);

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
      await new Promise<void>((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(PORT, () => {
          this.server.off('error', reject);
          console.log(`SafeOS server running on port ${PORT}`);
          console.log(`WebSocket server ready`);
          resolve();
        });
      });
    } catch (error) {
      await this.stopScheduledWork();
      throw error;
    }
  }

  private async stopScheduledWork(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.frameCleanupInterval) {
      clearInterval(this.frameCleanupInterval);
      this.frameCleanupInterval = null;
    }
    await this.frameCleanup;

    // Stop analysis queue
    if (this.analysisQueue) {
      await this.analysisQueue.stop();
      this.analysisQueue = null;
    }
  }

  async stop(): Promise<void> {
    console.log('Shutting down SafeOS server...');

    await this.stopScheduledWork();

    // Close all WebSocket connections
    this.clients.forEach((client) => {
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
