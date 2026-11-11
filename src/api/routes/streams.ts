/**
 * Stream Routes
 *
 * API routes for stream management.
 *
 * @module api/routes/streams
 */

import { Router, Request, Response } from 'express';
import { getSafeOSDatabase, generateId, now } from '../../db';
import { requireAuth, getProfileId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CreateStreamSchema, UpdateStreamSchema } from '../schemas/index.js';
import { notFound, internalError } from '../utils/errors.js';

// =============================================================================
// Router
// =============================================================================

export const streamRoutes = Router();

// Apply auth middleware to all stream routes
streamRoutes.use(requireAuth);

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/streams - List all streams for the authenticated user
 *
 * Supports pagination via `limit` and `offset` query params.
 * Returns streams with alert counts using a single JOIN query.
 */
streamRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const status = req.query.status as string | undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // Build query with LEFT JOIN to get alert counts in single query (avoids N+1)
    let baseQuery = `
      SELECT
        s.*,
        COALESCE(a.alert_count, 0) as alertCount,
        COALESCE(a.unack_count, 0) as unacknowledgedAlerts
      FROM streams s
      LEFT JOIN (
        SELECT
          stream_id,
          COUNT(*) as alert_count,
          SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) as unack_count
        FROM alerts
        GROUP BY stream_id
      ) a ON s.id = a.stream_id
      WHERE s.user_id = ?
    `;
    const params: any[] = [profileId];

    if (status) {
      baseQuery += ' AND s.status = ?';
      params.push(status);
    }

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM streams WHERE user_id = ?${status ? ' AND status = ?' : ''}`;
    const countResult = await db.get<{ total: number }>(countQuery, status ? [profileId, status] : [profileId]);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    baseQuery += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const streams = await db.all(baseQuery, params);

    res.json({
      streams,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + streams.length < total,
      },
    });
  } catch (error) {
    console.error('Failed to list streams:', error);
    internalError(res, 'Failed to list streams');
  }
});

/**
 * GET /api/streams/:id - Get stream by ID (with ownership verification)
 */
streamRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const { id } = req.params;

    const stream = await db.get(
      'SELECT * FROM streams WHERE id = ? AND user_id = ?',
      [id, profileId]
    );

    if (!stream) {
      return notFound(res, 'Stream');
    }

    // Get alert count
    const alertResult = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM alerts WHERE stream_id = ? AND acknowledged = 0',
      [id]
    );

    res.json({
      stream: {
        ...(stream as Record<string, unknown>),
        alertCount: alertResult?.count || 0,
      },
    });
  } catch (error) {
    console.error('Failed to get stream:', error);
    internalError(res, 'Failed to get stream');
  }
});

/**
 * POST /api/streams - Create new stream
 */
streamRoutes.post('/', validate(CreateStreamSchema), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { scenario } = req.body;
    const profileId = getProfileId(req);

    const id = generateId();
    const timestamp = now();

    await db.run(
      `INSERT INTO streams (id, user_id, scenario, status, started_at, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [id, profileId, scenario, timestamp, timestamp]
    );

    const stream = await db.get('SELECT * FROM streams WHERE id = ?', [id]);

    res.status(201).json({ stream });
  } catch (error) {
    console.error('Failed to create stream:', error);
    internalError(res, 'Failed to create stream');
  }
});

/**
 * PATCH /api/streams/:id - Update stream status as its owner or a reviewer/operator
 */
streamRoutes.patch('/:id', validate(UpdateStreamSchema), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const { id } = req.params;
    const { status } = req.body;
    const canReview = req.session?.role === 'reviewer' || req.session?.role === 'operator';

    const stream = await db.get(
      'SELECT * FROM streams WHERE id = ? AND (user_id = ? OR ? = 1)',
      [id, profileId, canReview ? 1 : 0]
    );
    if (!stream) {
      return notFound(res, 'Stream');
    }

    if (!canReview && ((stream as any).status === 'banned' || status === 'banned')) {
      return res.status(403).json({ error: 'Only reviewers or operators may change a banned stream' });
    }

    if (status) {
      const updates: any = { status };
      if (status === 'ended') {
        updates.ended_at = now();
      }

      const changed = await db.get(
        `UPDATE streams SET status = ?, ended_at = ? WHERE id = ? AND (user_id = ? OR ? = 1)
         AND (status != 'banned' OR ? = 1) RETURNING id`,
        [status, updates.ended_at || null, id, profileId, canReview ? 1 : 0, canReview ? 1 : 0]
      );
      if (!changed) return res.status(403).json({ error: 'Only reviewers or operators may change a banned stream' });
    }

    const updated = await db.get(
      'SELECT * FROM streams WHERE id = ? AND (user_id = ? OR ? = 1)',
      [id, profileId, canReview ? 1 : 0]
    );
    res.json({ stream: updated });
  } catch (error) {
    console.error('Failed to update stream:', error);
    internalError(res, 'Failed to update stream');
  }
});

/**
 * DELETE /api/streams/:id - End/delete stream (with ownership verification)
 */
streamRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const { id } = req.params;

    const stream = await db.get(
      'SELECT * FROM streams WHERE id = ? AND user_id = ?',
      [id, profileId]
    );
    if (!stream) {
      return notFound(res, 'Stream');
    }

    const canReview = req.session?.role === 'reviewer' || req.session?.role === 'operator';
    // Keep the status guard in the write so a concurrent review is respected.
    const changed = await db.get(
      `UPDATE streams SET status = 'ended', ended_at = ? WHERE id = ? AND user_id = ?
       AND (status != 'banned' OR ? = 1) RETURNING id`,
      [now(), id, profileId, canReview ? 1 : 0]
    );
    if (!changed) return res.status(403).json({ error: 'Only reviewers or operators may change a banned stream' });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete stream:', error);
    internalError(res, 'Failed to delete stream');
  }
});

/**
 * GET /api/streams/:id/stats - Get stream statistics (with ownership verification)
 */
streamRoutes.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const { id } = req.params;

    // Verify ownership first
    const stream = await db.get(
      'SELECT id FROM streams WHERE id = ? AND user_id = ?',
      [id, profileId]
    );
    if (!stream) {
      return notFound(res, 'Stream');
    }

    // Get alert counts by severity
    const alerts = await db.all<{ severity: string; count: number }>(
      `SELECT severity, COUNT(*) as count FROM alerts
       WHERE stream_id = ? GROUP BY severity`,
      [id]
    );

    // Get analysis count
    const analysisResult = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis_results WHERE stream_id = ?',
      [id]
    );

    // Get frame count
    const frameResult = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM frame_buffer WHERE stream_id = ?',
      [id]
    );

    res.json({
      stats: {
        alerts: Object.fromEntries(alerts.map((a) => [a.severity, a.count])),
        totalAlerts: alerts.reduce((sum, a) => sum + a.count, 0),
        analysisCount: analysisResult?.count || 0,
        frameCount: frameResult?.count || 0,
      },
    });
  } catch (error) {
    console.error('Failed to get stream stats:', error);
    internalError(res, 'Failed to get stream stats');
  }
});

export default streamRoutes;
