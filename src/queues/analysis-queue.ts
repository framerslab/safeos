/**
 * Analysis Queue
 *
 * Queue for processing frames with AI analysis.
 *
 * @module queues/analysis-queue
 */

import { getSafeOSDatabase, generateId, now } from '../db';
import { OllamaClient } from '../lib/ollama/client';
import { cloudFallbackAnalysis } from '../lib/analysis/cloud-fallback';
import { ContentFilter } from '../lib/safety/content-filter';
import { NotificationManager, isQuietHours, type NotificationPayload } from '../lib/alerts/notification-manager';

// =============================================================================
// Types
// =============================================================================

export interface AnalysisJob {
  id: string;
  streamId: string;
  frameId: string;
  imageData: string;
  motionScore: number;
  audioLevel: number;
  scenario: 'pet' | 'baby' | 'elderly';
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries?: number;
  createdAt: string;
}

export interface AnalysisResult {
  id: string;
  streamId: string;
  frameId?: string;
  concernLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedIssues: string[];
  processingTimeMs: number;
  modelUsed: string;
  isCloudFallback: boolean;
}

export interface QueueOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 5000;
const DELIVERY_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_ACTIVE_DELIVERIES = 32;
// Track deliveries across server instances in this API process; critical alerts bypass the cap.
let activeDeliveries = 0;

// Prompts for different scenarios
const TRIAGE_PROMPTS: Record<string, string> = {
  pet: `Analyze this image quickly. Is there a pet visible? 
Any obvious signs of distress, danger, or concerning behavior?
Reply with: CONCERN_LEVEL: [none/low/medium/high/critical] and a brief reason.`,

  baby: `Analyze this image quickly. Is there an infant/toddler visible?
Any obvious signs of distress, unsafe position, or concerning situation?
Reply with: CONCERN_LEVEL: [none/low/medium/high/critical] and a brief reason.`,

  elderly: `Analyze this image quickly. Is there an elderly person visible?
Any obvious signs of a fall, distress, or concerning situation?
Reply with: CONCERN_LEVEL: [none/low/medium/high/critical] and a brief reason.`,
};

const ANALYSIS_PROMPTS: Record<string, string> = {
  pet: `Carefully analyze this pet monitoring image:
1. Is the pet visible and identifiable?
2. What is the pet's current activity/posture?
3. Any signs of distress (panting, pacing, hiding)?
4. Any potential hazards visible?
5. Any concerning behaviors?

Provide a detailed analysis with CONCERN_LEVEL: [none/low/medium/high/critical]
and list any DETECTED_ISSUES.`,

  baby: `Carefully analyze this baby monitoring image:
1. Is the infant/toddler visible?
2. What is their position (sleeping, awake, moving)?
3. Any signs of distress (crying face, unusual position)?
4. Is the sleep environment safe?
5. Any potential hazards visible?

Provide a detailed analysis with CONCERN_LEVEL: [none/low/medium/high/critical]
and list any DETECTED_ISSUES.`,

  elderly: `Carefully analyze this elderly care monitoring image:
1. Is the person visible?
2. What is their current activity?
3. Any signs of a fall or inability to get up?
4. Any signs of distress or calling for help?
5. Any potential hazards?

Provide a detailed analysis with CONCERN_LEVEL: [none/low/medium/high/critical]
and list any DETECTED_ISSUES.`,
};

// =============================================================================
// AnalysisQueue Class
// =============================================================================

export class AnalysisQueue {
  private options: Required<QueueOptions>;
  private ollamaClient: OllamaClient;
  private contentFilter: ContentFilter;
  private isRunning: boolean = false;
  private activeJobs: number = 0;
  private processInterval: NodeJS.Timeout | null = null;

  constructor(options: QueueOptions = {}) {
    this.options = {
      concurrency: options.concurrency || DEFAULT_CONCURRENCY,
      maxRetries: options.maxRetries || DEFAULT_MAX_RETRIES,
      retryDelay: options.retryDelay || DEFAULT_RETRY_DELAY,
    };
    this.ollamaClient = new OllamaClient();
    this.contentFilter = new ContentFilter();
  }

  // ---------------------------------------------------------------------------
  // Queue Management
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) return;
    const db = await getSafeOSDatabase();
    // One API process owns this SQLite queue. Stable result and alert IDs make
    // recovery safe, and the worker still enforces the frame retention cutoff.
    await db.run("UPDATE analysis_queue SET status = 'pending' WHERE status = 'processing'");
    this.isRunning = true;
    console.log('Analysis queue started');

    // Process jobs periodically
    this.processInterval = setInterval(() => this.processJobs(), 1000);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Wait for active jobs to complete
    while (this.activeJobs > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('Analysis queue stopped');
  }

  async enqueue(job: AnalysisJob): Promise<void> {
    if (!job.frameId) throw new Error('Analysis jobs require a frame identity');
    const db = await getSafeOSDatabase();

    // Store frame data in buffer if not already there
    if (job.imageData && job.frameId) {
      const existing = await db.get('SELECT id FROM frame_buffer WHERE id = ?', [job.frameId]);
      if (!existing) {
        await db.run(
          `INSERT INTO frame_buffer (id, stream_id, frame_data, motion_score, audio_level, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [job.frameId, job.streamId, job.imageData, job.motionScore, job.audioLevel, job.createdAt]
        );
      }
    }

    await db.run(
      `INSERT INTO analysis_queue (id, stream_id, frame_id, scenario, priority, status, retries, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [job.id, job.streamId, job.frameId, job.scenario, job.priority, job.createdAt]
    );
  }

  // ---------------------------------------------------------------------------
  // Job Processing
  // ---------------------------------------------------------------------------

  private async processJobs(): Promise<void> {
    if (!this.isRunning || this.activeJobs >= this.options.concurrency) {
      return;
    }

    const db = await getSafeOSDatabase();

    // Claim atomically so overlapping worker ticks cannot analyse the same job.
    const job = await db.get<any>(
      `UPDATE analysis_queue SET status = 'processing'
       WHERE id = (
         SELECT id FROM analysis_queue WHERE status = 'pending'
         ORDER BY priority DESC, created_at ASC LIMIT 1
       ) AND status = 'pending'
       RETURNING *`
    );

    if (!job) return;
    if (!job.frame_id) {
      await db.run("UPDATE analysis_queue SET status = 'failed' WHERE id = ?", [job.id]);
      console.warn('Analysis job failed: missing frame identity');
      return;
    }

    this.activeJobs++;

    try {
      await this.processJob(job);
      await db.run(
        `UPDATE analysis_queue SET status = 'completed' WHERE id = ?`,
        [job.id]
      );
    } catch (error) {
      console.error(`Failed to process job ${job.id}:`, error);

      const retries = (job.retries || 0) + 1;
      if (retries >= this.options.maxRetries) {
        await db.run(
          `UPDATE analysis_queue SET status = 'failed', retries = ? WHERE id = ?`,
          [retries, job.id]
        );
      } else {
        // Retry later
        await db.run(
          `UPDATE analysis_queue SET status = 'pending', retries = ? WHERE id = ?`,
          [retries, job.id]
        );
      }
    } finally {
      this.activeJobs--;
    }
  }

  private async processJob(job: any): Promise<void> {
    const db = await getSafeOSDatabase();
    const startTime = Date.now();
    const stored = await this.readStoredResult(job.id);
    if (stored) {
      if (['medium', 'high', 'critical'].includes(stored.concernLevel)) await this.createAlert(stored);
      return;
    }

    // Get frame data
    const frame = await db.get<any>(
      `SELECT * FROM frame_buffer WHERE id = ? AND stream_id = ? AND created_at > ?`,
      [job.frame_id, job.stream_id, new Date(Date.now() - 10 * 60 * 1000).toISOString()]
    );

    if (!frame || !frame.frame_data) {
      console.log(`No frame data for job ${job.id}`);
      return;
    }

    const imageData = frame.frame_data;
    const scenario = job.scenario as 'pet' | 'baby' | 'elderly';

    let result: AnalysisResult;
    let modelUsed = 'unknown';

    // Check Ollama availability
    const ollamaAvailable = await this.ollamaClient.isHealthy();

    if (ollamaAvailable) {
      // Local analysis with Ollama
      try {
        // Step 1: Quick triage with Moondream
        const triageResult = await this.ollamaClient.triage(
          imageData,
          TRIAGE_PROMPTS[scenario]
        );
        modelUsed = 'moondream';

        const triageConcern = this.parseConcernLevel(triageResult);

        // Step 2: If concern detected, do detailed analysis with LLaVA
        if (triageConcern !== 'none') {
          const analysisResult = await this.ollamaClient.analyze(
            imageData,
            ANALYSIS_PROMPTS[scenario]
          );
          modelUsed = 'llava:7b';

          result = this.parseAnalysisResult(
            job.stream_id,
            frame.id,
            analysisResult,
            Date.now() - startTime,
            modelUsed,
            false
          );
        } else {
          // No concern from triage
          result = {
            id: generateId(),
            streamId: job.stream_id,
            frameId: frame.id,
            concernLevel: 'none',
            description: 'No concerns detected during triage',
            detectedIssues: [],
            processingTimeMs: Date.now() - startTime,
            modelUsed,
            isCloudFallback: false,
          };
        }
      } catch (error) {
        console.error('Local analysis failed, falling back to cloud:', error);
        result = await this.cloudAnalysis(job, frame, scenario, startTime);
      }
    } else {
      // Cloud fallback
      result = await this.cloudAnalysis(job, frame, scenario, startTime);
    }

    // Content moderation
    const moderation = await this.contentFilter.moderate(
      job.stream_id,
      imageData,
      result.description
    );

    if (moderation.action !== 'allow') {
      console.log(`Content flagged for stream ${job.stream_id}: ${moderation.action}`);
      // Flag is already created by content filter
    }

    // A retry keeps the same result and alert identity.
    result.id = job.id;

    // Store result
    await db.run(
      `INSERT OR IGNORE INTO analysis_results
       (id, stream_id, frame_id, concern_level, description, detected_issues, 
        processing_time_ms, model_used, is_cloud_fallback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.id,
        result.streamId,
        result.frameId,
        result.concernLevel,
        result.description,
        JSON.stringify(result.detectedIssues),
        result.processingTimeMs,
        result.modelUsed,
        result.isCloudFallback ? 1 : 0,
        now(),
      ]
    );

    // Use the persisted result even if another attempt already saved it.
    result = (await this.readStoredResult(job.id))!;
    if (!result) throw new Error('Analysis result was not stored');
    // Create alert if concern level is medium or higher
    if (['medium', 'high', 'critical'].includes(result.concernLevel)) {
      await this.createAlert(result);
    }
  }

  private async readStoredResult(id: string): Promise<AnalysisResult | undefined> {
    const row = await (await getSafeOSDatabase()).get<any>('SELECT * FROM analysis_results WHERE id = ?', [id]);
    if (!row) return undefined;
    return {
      id: row.id,
      streamId: row.stream_id,
      frameId: row.frame_id,
      concernLevel: row.concern_level,
      description: row.description,
      detectedIssues: JSON.parse(row.detected_issues || '[]'),
      processingTimeMs: row.processing_time_ms,
      modelUsed: row.model_used,
      isCloudFallback: !!row.is_cloud_fallback,
    };
  }

  private async cloudAnalysis(
    job: any,
    frame: any,
    scenario: string,
    startTime: number
  ): Promise<AnalysisResult> {
    const result = await cloudFallbackAnalysis(
      frame.frame_data,
      ANALYSIS_PROMPTS[scenario]
    );

    return this.parseAnalysisResult(
      job.stream_id,
      frame.id,
      result.content,
      Date.now() - startTime,
      result.model || 'cloud',
      true
    );
  }

  // ---------------------------------------------------------------------------
  // Result Parsing
  // ---------------------------------------------------------------------------

  private parseConcernLevel(
    response: string
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    const match = response.match(/CONCERN_LEVEL:\s*\[?(\w+)\]?/i);
    if (match) {
      const level = match[1].toLowerCase();
      if (['none', 'low', 'medium', 'high', 'critical'].includes(level)) {
        return level as any;
      }
    }
    return 'none';
  }

  private parseAnalysisResult(
    streamId: string,
    frameId: string | undefined,
    response: string,
    processingTimeMs: number,
    modelUsed: string,
    isCloudFallback: boolean
  ): AnalysisResult {
    const concernLevel = this.parseConcernLevel(response);

    // Parse detected issues
    const issuesMatch = response.match(/DETECTED_ISSUES:?\s*(.+?)(?=\n\n|\n[A-Z]|$)/is);
    let detectedIssues: string[] = [];
    if (issuesMatch) {
      detectedIssues = issuesMatch[1]
        .split(/[,\n•-]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length < 200);
    }

    return {
      id: generateId(),
      streamId,
      frameId,
      concernLevel,
      description: response.slice(0, 1000), // Truncate long responses
      detectedIssues,
      processingTimeMs,
      modelUsed,
      isCloudFallback,
    };
  }

  // ---------------------------------------------------------------------------
  // Alert Creation
  // ---------------------------------------------------------------------------

  private async createAlert(result: AnalysisResult): Promise<void> {
    const db = await getSafeOSDatabase();

    const alertId = `alert-${result.id}`;
    // Insertion claims the delivery attempt; retries must not resend it.
    if (await db.get('SELECT id FROM alerts WHERE id = ?', [alertId])) return;
    const timestamp = now();
    const severity = result.concernLevel as NotificationPayload['severity'];

    const owner = await db.get<{ id: string; notification_settings: string }>(
      `SELECT p.id, p.notification_settings FROM user_profiles p
       JOIN streams s ON s.user_id = p.id WHERE s.id = ? AND s.status = 'active'`, [result.streamId]
    );
    const settings = JSON.parse(owner?.notification_settings || '{}');
    let skipped: string | undefined = !owner ? 'inactive-stream'
      : isQuietHours(settings, severity) ? 'quiet-hours' : undefined;
    if (!skipped && severity !== 'critical' && activeDeliveries >= MAX_ACTIVE_DELIVERIES) skipped = 'capacity';
    const reserved = !skipped;
    if (reserved) activeDeliveries++;
    let dispatched = false;
    try {
      const metadata = JSON.stringify({
        analysisId: result.id,
        detectedIssues: result.detectedIssues,
        modelUsed: result.modelUsed,
        isCloudFallback: result.isCloudFallback,
        deliveryAttempted: !skipped,
        deliverySkipped: skipped,
      });
      const ranks: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      // The cooldown decision and its reservation are one SQLite write, so
      // concurrent jobs cannot both claim the first attempt in the window.
      await db.run(
        `INSERT INTO alerts (id, stream_id, alert_type, severity, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?,
           CASE WHEN ? IS NULL AND EXISTS (
             SELECT 1 FROM alerts WHERE stream_id = ? AND acknowledged = 0 AND created_at > ?
               AND CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3
                 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END >= ?
               AND CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.deliveryAttempted') ELSE 0 END = 1
           ) THEN json_set(?, '$.deliverySkipped', 'cooldown', '$.deliveryAttempted', 0) ELSE ? END, ?)`,
        [alertId, result.streamId, 'analysis', severity, result.description.slice(0, 500),
          skipped ?? null, result.streamId, new Date(Date.now() - DELIVERY_COOLDOWN_MS).toISOString(),
          ranks[severity], metadata, metadata, timestamp]
      );
      const saved = await db.get<{ metadata: string }>('SELECT metadata FROM alerts WHERE id = ?', [alertId]);
      if (!saved || JSON.parse(saved.metadata).deliverySkipped || !owner) return;
      try {
        const manager = new NotificationManager(settings, owner.id);
        // Delivery does not occupy an analysis slot or delay server shutdown.
        // Each channel settles within its deadline, releasing this slot.
        dispatched = true;
        void manager.notify({
          streamId: result.streamId, alertId, severity, title: 'Monitoring alert',
          message: result.description.slice(0, 500), timestamp,
        }).catch(() => {
          console.error('Alert delivery failed');
        }).finally(() => { activeDeliveries--; });
      } catch {
        // Invalid provider configuration must not retry the saved analysis.
        console.error('Alert delivery failed');
      }
    } finally {
      if (reserved && !dispatched) activeDeliveries--;
    }

    console.log(`Alert created for stream ${result.streamId}: ${result.concernLevel}`);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    deliveriesInFlight: number;
  }> {
    const db = await getSafeOSDatabase();

    const pending = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM analysis_queue WHERE status = 'pending'"
    );
    const processing = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM analysis_queue WHERE status = 'processing'"
    );
    const completed = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM analysis_queue WHERE status = 'completed'"
    );
    const failed = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM analysis_queue WHERE status = 'failed'"
    );

    return {
      deliveriesInFlight: activeDeliveries,
      pending: pending?.count || 0,
      processing: processing?.count || 0,
      completed: completed?.count || 0,
      failed: failed?.count || 0,
    };
  }
}

export default AnalysisQueue;
