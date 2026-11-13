/**
 * Data Export Routes
 *
 * Export alerts, analysis results, and user data.
 *
 * @module api/routes/export
 */

import { Router } from 'express';
import { redactNotificationSettings } from '../../lib/alerts/notification-settings.js';
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

    const profile = await db.get<{ notification_settings: string }>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    const notificationSettings = profile ? redactExportSettings(profile.notification_settings) : null;
    const monitoring = await getMonitoringExport(db, session.profile_id);

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
        profile: profile ? { ...profile, notification_settings: notificationSettings } : profile,
        notificationSettingsOmitted: profile && notificationSettings === null ? 1 : 0,
        ...monitoring,
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
    const profile = await db.get<{ notification_settings: string }>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    const sessions = await db.all(
      `SELECT id, device_id, is_guest, created_at, expires_at FROM sessions WHERE profile_id = ?`,
      [session.profile_id]
    );

    // Each list and its total share one statement's snapshot during live writes.
    const streams = await db.all<CountedExportRow>(
      `SELECT *, COUNT(*) OVER() AS export_total FROM streams
       WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000`,
      [session.profile_id]
    );

    const alerts = await db.all<CountedExportRow>(
      `SELECT a.*, COUNT(*) OVER() AS export_total FROM alerts a
       INNER JOIN streams s ON a.stream_id = s.id
       WHERE s.user_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 5000`,
      [session.profile_id]
    );

    const analysisResults = await db.all<CountedExportRow>(
      `SELECT ar.*, COUNT(*) OVER() AS export_total FROM analysis_results ar
       INNER JOIN streams s ON ar.stream_id = s.id
       WHERE s.user_id = ?
       ORDER BY ar.created_at DESC, ar.id DESC
       LIMIT 5000`,
      [session.profile_id]
    );

    const notificationSettings = profile ? redactExportSettings(profile.notification_settings) : null;
    const monitoring = await getMonitoringExport(db, session.profile_id);
    const exportData = {
      counts: {
        streams: exportCounts(streams),
        alerts: exportCounts(alerts),
        analysisResults: exportCounts(analysisResults),
      },
      ...monitoring,
      exportedAt: new Date().toISOString(),
      exportType: 'full_data_export',
      profile: profile ? { ...profile, notification_settings: notificationSettings } : profile,
      notificationSettingsOmitted: profile && notificationSettings === null ? 1 : 0,
      sessions,
      streams: withoutExportTotals(streams),
      alerts: withoutExportTotals(alerts),
      analysisResults: withoutExportTotals(analysisResults),
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

/** Only object settings can be safely redacted; stored rows are never changed. */
function redactExportSettings(stored: string): string | null {
  try {
    const settings = JSON.parse(stored);
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      return null;
    }
    return JSON.stringify(redactNotificationSettings(settings));
  } catch {
    return null;
  }
}

type CountedExportRow = Record<string, unknown> & { export_total: number };

function exportCounts(rows: CountedExportRow[]) {
  const total = rows[0]?.export_total ?? 0;
  return { total, included: rows.length, truncated: total > rows.length };
}

function withoutExportTotals(rows: CountedExportRow[]) {
  return rows.map(({ export_total: _total, ...row }) => row);
}

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










/** Export ownership and personal choices use the same scope as profile reads. */
async function getMonitoringExport(
  db: Awaited<ReturnType<typeof getSafeOSDatabase>>,
  ownerId: string
) {
  const monitoringProfiles = await db.all<{
    id: string; name: string; scenario: string; settings: string;
    created_at: string; owner_id: string; is_active: number;
  }>(
    `SELECT p.id, p.name, p.scenario, p.settings, p.created_at, p.owner_id,
      CASE WHEN a.monitoring_profile_id = p.id THEN 1 ELSE 0 END AS is_active
     FROM monitoring_profiles p
     LEFT JOIN active_monitoring_profiles a
       ON a.owner_id = p.owner_id AND a.scenario = p.scenario
     WHERE p.owner_id = ? ORDER BY p.scenario, p.id`,
    [ownerId]
  );
  const activeMonitoringProfiles = await db.all(
    `SELECT owner_id, scenario, monitoring_profile_id FROM active_monitoring_profiles
     WHERE owner_id = ? ORDER BY scenario`,
    [ownerId]
  );
  let monitoringSettingsOmitted = 0;
  const sanitizedProfiles = monitoringProfiles.map((profile) => {
    const settings = redactExportSettings(profile.settings);
    if (settings === null) monitoringSettingsOmitted += 1;
    return { ...profile, settings };
  });
  return {
    monitoringProfiles: sanitizedProfiles,
    monitoringSettingsOmitted,
    activeMonitoringProfiles,
  };
}
