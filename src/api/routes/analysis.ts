/**
 * Analysis Routes
 *
 * API routes for analysis results.
 *
 * @module api/routes/analysis
 */

import { Router, Request, Response } from 'express';
import { getSafeOSDatabase } from '../../db';
import { requireAuth, getProfileId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ListAnalysisQuerySchema,
  AnalysisStatsQuerySchema,
  IdParamsSchema,
} from '../schemas/index.js';
import { notFound, internalError } from '../utils/errors.js';

// =============================================================================
// Router
// =============================================================================

export const analysisRoutes = Router();

// Apply auth middleware to all analysis routes
analysisRoutes.use(requireAuth);

/** Limits a query on analysis results to the streams the caller owns. */
const OWNED = 'stream_id IN (SELECT id FROM streams WHERE user_id = ?)';

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/analysis - List analysis results
 */
analysisRoutes.get('/', validate(ListAnalysisQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const queryParams = req.query as Record<string, string | undefined>;
    const streamId = queryParams.streamId;
    const concernLevel = queryParams.concernLevel;
    const limit = parseInt(queryParams.limit || '50', 10);
    const offset = parseInt(queryParams.offset || '0', 10);

    let sqlQuery = `SELECT * FROM analysis_results WHERE ${OWNED}`;
    const params: any[] = [getProfileId(req)];

    if (streamId) {
      sqlQuery += ' AND stream_id = ?';
      params.push(streamId);
    }

    if (concernLevel) {
      sqlQuery += ' AND concern_level = ?';
      params.push(concernLevel);
    }

    sqlQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.all(sqlQuery, params);

    // Parse detected_issues JSON
    const parsed = results.map((r: any) => ({
      ...r,
      detectedIssues: r.detected_issues ? JSON.parse(r.detected_issues) : [],
    }));

    res.json({ results: parsed });
  } catch (error) {
    console.error('Failed to list analysis results:', error);
    internalError(res, 'Failed to list analysis results');
  }
});

/**
 * GET /api/analysis/:id - Get analysis by ID
 */
analysisRoutes.get('/:id', validate(IdParamsSchema, 'params'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { id } = req.params as { id: string };

    const result = await db.get(
      `SELECT * FROM analysis_results WHERE id = ? AND ${OWNED}`,
      [id, getProfileId(req)]
    );

    if (!result) {
      return notFound(res, 'Analysis result');
    }

    res.json({
      result: {
        ...(result as Record<string, unknown>),
        detectedIssues: (result as any).detected_issues
          ? JSON.parse((result as any).detected_issues)
          : [],
      },
    });
  } catch (error) {
    console.error('Failed to get analysis result:', error);
    internalError(res, 'Failed to get analysis result');
  }
});

/**
 * GET /api/analysis/stats - Get analysis statistics
 */
analysisRoutes.get('/stats/summary', validate(AnalysisStatsQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const db = await getSafeOSDatabase();
    const { streamId, since } = req.query as { streamId?: string; since?: string };

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

    // Get counts by concern level
    const byConcern = await db.all<{ concern_level: string; count: number }>(
      `SELECT concern_level, COUNT(*) as count FROM analysis_results
       WHERE ${whereClause} GROUP BY concern_level`,
      params
    );

    // Get average processing time
    const avgTime = await db.get<{ avg_time: number }>(
      `SELECT AVG(processing_time_ms) as avg_time FROM analysis_results
       WHERE ${whereClause}`,
      params
    );

    // Get cloud fallback rate
    const cloudFallback = await db.get<{ total: number; cloud: number }>(
      `SELECT COUNT(*) as total, SUM(is_cloud_fallback) as cloud FROM analysis_results
       WHERE ${whereClause}`,
      params
    );

    // Get total count
    const total = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM analysis_results WHERE ${whereClause}`,
      params
    );

    res.json({
      stats: {
        total: total?.count || 0,
        byConcernLevel: Object.fromEntries(byConcern.map((c) => [c.concern_level, c.count])),
        averageProcessingTime: Math.round(avgTime?.avg_time || 0),
        cloudFallbackRate:
          cloudFallback && cloudFallback.total > 0
            ? ((cloudFallback.cloud || 0) / cloudFallback.total) * 100
            : 0,
      },
    });
  } catch (error) {
    console.error('Failed to get analysis stats:', error);
    internalError(res, 'Failed to get analysis stats');
  }
});

export default analysisRoutes;
