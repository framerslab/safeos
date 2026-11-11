/**
 * Alert Routes
 *
 * API routes for alert management.
 *
 * @module api/routes/alerts
 */

import { Router, Request, Response } from 'express';
import { getSafeOSDatabase, now } from '../../db';
import { requireAuth, getProfileId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  AcknowledgeAllAlertsSchema,
  ListAlertsQuerySchema,
  AlertSummaryQuerySchema,
  IdParamsSchema,
} from '../schemas/index.js';
import { notFound, internalError } from '../utils/errors.js';

// =============================================================================
// Router
// =============================================================================

export const alertRoutes = Router();

// Apply auth middleware to all alert routes
alertRoutes.use(requireAuth);

/** Limits a query on alerts to the streams the caller owns. */
const OWNED = 'stream_id IN (SELECT id FROM streams WHERE user_id = ?)';

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/alerts - List alerts
 *
 * Supports pagination via `limit` and `offset` query params.
 */
alertRoutes.get('/', validate(ListAlertsQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { streamId, acknowledged, severity } = req.query;
    // Bounds-checked pagination
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const owner = getProfileId(req);
    let query = `SELECT * FROM alerts WHERE ${OWNED}`;
    const params: any[] = [owner];
    const countParams: any[] = [owner];

    if (streamId) {
      query += ' AND stream_id = ?';
      params.push(streamId);
      countParams.push(streamId);
    }

    if (acknowledged !== undefined) {
      const ackValue = acknowledged === 'true' ? 1 : 0;
      query += ' AND acknowledged = ?';
      params.push(ackValue);
      countParams.push(ackValue);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
      countParams.push(severity);
    }

    // Build count query with same filters
    const countQuery =
      `SELECT COUNT(*) as count FROM alerts WHERE ${OWNED}` +
      (streamId ? ' AND stream_id = ?' : '') +
      (acknowledged !== undefined ? ' AND acknowledged = ?' : '') +
      (severity ? ' AND severity = ?' : '');

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [alerts, countResult] = await Promise.all([
      db.all(query, params),
      db.get<{ count: number }>(countQuery, countParams),
    ]);

    const total = countResult?.count || 0;

    res.json({
      alerts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + alerts.length < total,
      },
    });
  } catch (error) {
    console.error('Failed to list alerts:', error);
    internalError(res, 'Failed to list alerts');
  }
});

/**
 * GET /api/alerts/:id - Get alert by ID
 */
alertRoutes.get('/:id', validate(IdParamsSchema, 'params'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { id } = req.params;

    const alert = await db.get(`SELECT * FROM alerts WHERE id = ? AND ${OWNED}`, [
      id,
      getProfileId(req),
    ]);

    if (!alert) {
      return notFound(res, 'Alert');
    }

    res.json({ alert });
  } catch (error) {
    console.error('Failed to get alert:', error);
    internalError(res, 'Failed to get alert');
  }
});

/**
 * POST /api/alerts/:id/acknowledge - Acknowledge alert
 */
alertRoutes.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { id } = req.params;

    const alert = await db.get(`SELECT * FROM alerts WHERE id = ? AND ${OWNED}`, [
      id,
      getProfileId(req),
    ]);
    if (!alert) {
      return notFound(res, 'Alert');
    }

    await db.run(
      'UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ?',
      [now(), id]
    );

    const updated = await db.get('SELECT * FROM alerts WHERE id = ?', [id]);
    res.json({ alert: updated });
  } catch (error) {
    console.error('Failed to acknowledge alert:', error);
    internalError(res, 'Failed to acknowledge alert');
  }
});

/**
 * POST /api/alerts/acknowledge/all - Acknowledge all of the caller's alerts,
 * or those of one of the caller's streams
 */
alertRoutes.post('/acknowledge/all', validate(AcknowledgeAllAlertsSchema), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { streamId } = req.body;

    let query = `UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE acknowledged = 0 AND ${OWNED}`;
    const params: any[] = [now(), getProfileId(req)];

    if (streamId) {
      query += ' AND stream_id = ?';
      params.push(streamId);
    }

    const result = await db.run(query, params);

    res.json({
      success: true,
      acknowledgedCount: result.changes || 0,
    });
  } catch (error) {
    console.error('Failed to acknowledge alerts:', error);
    internalError(res, 'Failed to acknowledge alerts');
  }
});

/**
 * GET /api/alerts/summary - Get alert summary
 */
alertRoutes.get('/summary/stats', validate(AlertSummaryQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { streamId, since } = req.query;

    let whereClause = OWNED;
    const params: any[] = [getProfileId(req)];

    if (streamId) {
      whereClause += ' AND stream_id = ?';
      params.push(streamId);
    }

    if (since) {
      whereClause += ' AND created_at >= ?';
      params.push(since);
    }

    // Get counts by severity
    const bySeverity = await db.all<{ severity: string; count: number }>(
      `SELECT severity, COUNT(*) as count FROM alerts
       WHERE ${whereClause} GROUP BY severity`,
      params
    );

    // Get counts by type
    const byType = await db.all<{ alert_type: string; count: number }>(
      `SELECT alert_type, COUNT(*) as count FROM alerts
       WHERE ${whereClause} GROUP BY alert_type`,
      params
    );

    // Get unacknowledged count
    const unacknowledged = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM alerts
       WHERE ${whereClause} AND acknowledged = 0`,
      params
    );

    // Get total
    const total = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM alerts WHERE ${whereClause}`,
      params
    );

    res.json({
      summary: {
        total: total?.count || 0,
        unacknowledged: unacknowledged?.count || 0,
        bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s.count])),
        byType: Object.fromEntries(byType.map((t) => [t.alert_type, t.count])),
      },
    });
  } catch (error) {
    console.error('Failed to get alert summary:', error);
    internalError(res, 'Failed to get alert summary');
  }
});

export default alertRoutes;
