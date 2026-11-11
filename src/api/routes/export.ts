/**
 * Data Export Routes
 *
 * Export alerts, analysis results, and user data.
 *
 * @module api/routes/export
 */

import { Router } from 'express';
import { getSafeOSDatabase } from '../../db/index.js';
import { validate } from '../middleware/validate.js';
import { findLiveSession } from '../middleware/auth.js';
import { ExportQuerySchema, ConcernLevelEnum } from '../schemas/index.js';
import { unauthorized, internalError } from '../utils/errors.js';

// =============================================================================
// Router
// =============================================================================

export const exportRouter = Router();

// Extended schema for analysis export with concernLevel
const ExportAnalysisQuerySchema = ExportQuerySchema.extend({
  concernLevel: ConcernLevelEnum.optional(),
});

// =============================================================================
// Export Endpoints
// =============================================================================

/**
 * GET /api/export/alerts
 * Export alerts as JSON or CSV (authenticated, user-scoped)
 */
exportRouter.get('/alerts', validate(ExportQuerySchema, 'query'), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return unauthorized(res);
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return unauthorized(res, 'Invalid session');
    }

    const format = (req.query.format as string) || 'json';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build query - only fetch alerts for user's streams
    let query = `
      SELECT
        a.id,
        a.stream_id,
        a.alert_type,
        a.severity,
        a.message,
        a.acknowledged,
        a.acknowledged_at,
        a.created_at
      FROM alerts a
      INNER JOIN streams s ON a.stream_id = s.id
      WHERE s.user_id = ?
    `;

    const params: string[] = [session.profile_id];

    if (startDate) {
      query += ' AND a.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND a.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 10000';

    const alerts = await db.all(query, params);

    if (format === 'csv') {
      const csv = convertToCSV(alerts as Record<string, unknown>[], [
        'id',
        'stream_id',
        'alert_type',
        'severity',
        'message',
        'acknowledged',
        'acknowledged_at',
        'created_at',
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="safeos-alerts.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: alerts,
      count: (alerts as unknown[]).length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export alerts error:', error);
    internalError(res, 'Failed to export alerts');
  }
});

/**
 * GET /api/export/analysis
 * Export analysis results (authenticated, user-scoped)
 */
exportRouter.get('/analysis', validate(ExportAnalysisQuerySchema, 'query'), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return unauthorized(res);
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return unauthorized(res, 'Invalid session');
    }

    const format = (req.query.format as string) || 'json';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const concernLevel = req.query.concernLevel as string;

    // Build query - only fetch results for user's streams
    let query = `
      SELECT
        ar.id,
        ar.stream_id,
        ar.frame_id,
        ar.concern_level,
        ar.description,
        ar.detected_issues,
        ar.processing_time_ms,
        ar.model_used,
        ar.is_cloud_fallback,
        ar.created_at
      FROM analysis_results ar
      INNER JOIN streams s ON ar.stream_id = s.id
      WHERE s.user_id = ?
    `;

    const params: string[] = [session.profile_id];

    if (startDate) {
      query += ' AND ar.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND ar.created_at <= ?';
      params.push(endDate);
    }

    if (concernLevel) {
      query += ' AND ar.concern_level = ?';
      params.push(concernLevel);
    }

    query += ' ORDER BY ar.created_at DESC LIMIT 10000';

    const results = await db.all(query, params);

    if (format === 'csv') {
      const csv = convertToCSV(results as Record<string, unknown>[], [
        'id',
        'stream_id',
        'concern_level',
        'description',
        'model_used',
        'processing_time_ms',
        'is_cloud_fallback',
        'created_at',
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="safeos-analysis.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: results,
      count: (results as unknown[]).length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export analysis error:', error);
    internalError(res, 'Failed to export analysis');
  }
});

/**
 * GET /api/export/streams
 * Export stream history (authenticated, user-scoped)
 */
exportRouter.get('/streams', validate(ExportQuerySchema, 'query'), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return unauthorized(res);
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return unauthorized(res, 'Invalid session');
    }

    const format = (req.query.format as string) || 'json';

    const streams = await db.all(
      `
      SELECT
        s.id,
        s.scenario,
        s.status,
        s.started_at,
        s.ended_at,
        s.created_at,
        COUNT(DISTINCT a.id) as alert_count,
        COUNT(DISTINCT ar.id) as analysis_count
      FROM streams s
      LEFT JOIN alerts a ON s.id = a.stream_id
      LEFT JOIN analysis_results ar ON s.id = ar.stream_id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 1000
    `,
      [session.profile_id]
    );

    if (format === 'csv') {
      const csv = convertToCSV(streams as Record<string, unknown>[], [
        'id',
        'scenario',
        'status',
        'started_at',
        'ended_at',
        'alert_count',
        'analysis_count',
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="safeos-streams.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: streams,
      count: (streams as unknown[]).length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export streams error:', error);
    internalError(res, 'Failed to export streams');
  }
});

/**
 * GET /api/export/profile
 * Export user profile and settings
 */
exportRouter.get('/profile', async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return unauthorized(res);
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return unauthorized(res, 'Invalid session');
    }

    const profile = await db.get(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    // Get user's monitoring profiles
    const monitoringProfiles = await db.all(
      `SELECT * FROM monitoring_profiles WHERE id LIKE ?`,
      [`%${session.profile_id}%`]
    );

    // Get notification settings
    const pushSubscriptions = await db.all(
      `SELECT id, endpoint, created_at FROM push_subscriptions WHERE profile_id = ?`,
      [session.profile_id]
    );

    const telegramChats = await db.all(
      `SELECT id, chat_id, created_at FROM telegram_chats WHERE profile_id = ?`,
      [session.profile_id]
    );

    res.json({
      success: true,
      data: {
        profile,
        monitoringProfiles,
        notifications: {
          pushSubscriptions,
          telegramChats,
        },
        exportedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Export profile error:', error);
    internalError(res, 'Failed to export profile');
  }
});

/**
 * GET /api/export/all
 * Export all user data (GDPR compliance)
 */
exportRouter.get('/all', async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return unauthorized(res);
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return unauthorized(res, 'Invalid session');
    }

    // Gather all user data
    const profile = await db.get(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    const sessions = await db.all(
      `SELECT id, device_id, is_guest, created_at, expires_at FROM sessions WHERE profile_id = ?`,
      [session.profile_id]
    );

    // User-scoped queries
    const streams = await db.all(
      `SELECT * FROM streams WHERE user_id = ? LIMIT 1000`,
      [session.profile_id]
    );

    const alerts = await db.all(
      `SELECT a.* FROM alerts a
       INNER JOIN streams s ON a.stream_id = s.id
       WHERE s.user_id = ?
       LIMIT 5000`,
      [session.profile_id]
    );

    const analysisResults = await db.all(
      `SELECT ar.* FROM analysis_results ar
       INNER JOIN streams s ON ar.stream_id = s.id
       WHERE s.user_id = ?
       LIMIT 5000`,
      [session.profile_id]
    );

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportType: 'full_data_export',
      profile,
      sessions,
      streams,
      alerts,
      analysisResults,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="safeos-full-export.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Export all error:', error);
    internalError(res, 'Failed to export data');
  }
});

// =============================================================================
// Helpers
// =============================================================================

function convertToCSV(data: Record<string, unknown>[], columns: string[]): string {
  if (data.length === 0) {
    return columns.join(',') + '\n';
  }

  const header = columns.join(',');
  const rows = data.map((row) => {
    return columns
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        const strValue = String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
}





























