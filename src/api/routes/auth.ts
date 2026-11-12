/**
 * Authentication Routes
 *
 * Session management with guest mode support.
 * Server sessions and profiles are persisted in the database.
 *
 * @module api/routes/auth
 */

import { Router } from 'express';
import { redactNotificationSettings, mergeNotificationSettings } from '../../lib/alerts/notification-settings.js';
import { randomUUID } from 'crypto';
import { getSafeOSDatabase, generateId, now } from '../../db/index.js';
import { validate } from '../middleware/validate.js';
import { extractToken, requireAuth, getProfileId } from '../middleware/auth.js';
import { CreateSessionSchema, UpdateUserProfileSchema } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

interface Session {
  id: string;
  token: string;
  device_id: string | null;
  is_guest: number;
  profile_id: string;
  expires_at: string;
}

interface UserProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  preferences: string;
  notification_settings: string;
  created_at: string;
  updated_at: string;
}

function presentProfile(profile: UserProfileRow) {
  return {
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    preferences: JSON.parse(profile.preferences || '{}'),
    notificationSettings: redactNotificationSettings(JSON.parse(profile.notification_settings || '{}')),
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

// =============================================================================
// Router
// =============================================================================

export const authRouter = Router();

// =============================================================================
// Session Endpoints
// =============================================================================

/**
 * POST /api/auth/session
 * Create a new session (guest or returning user)
 */
authRouter.post('/session', validate(CreateSessionSchema), async (req, res) => {
  try {
    const db = await getSafeOSDatabase();
    const { deviceId, displayName } = req.body;

    // A device label is not a credential. Only the live guest session for
    // that device can authorize reuse of its profile.
    let profile: UserProfileRow | null = null;
    let existingSession: Session | null = null;
    const proof = extractToken(req);
    if (proof !== null) {
      existingSession = await db.get<Session>(
        `SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday(?)`,
        [proof, now()]
      );
      if (!existingSession || !existingSession.is_guest ||
          existingSession.device_id !== (deviceId || null)) {
        return res.status(401).json({ success: false, error: 'Invalid session proof' });
      }
      profile = await db.get<UserProfileRow>(
        'SELECT * FROM user_profiles WHERE id = ?', [existingSession.profile_id]
      );
      if (!profile) {
        return res.status(401).json({ success: false, error: 'Invalid session proof' });
      }
    }

    // Create new profile if needed
    if (!profile) {
      const profileId = generateId();
      const guestName = displayName || `Guest-${profileId.slice(0, 6)}`;

      await db.run(
        `INSERT INTO user_profiles (
          id, display_name, avatar_url, preferences, notification_settings, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          profileId,
          guestName,
          null,
          JSON.stringify({
            defaultScenario: 'pet',
            motionSensitivity: 0.5,
            audioSensitivity: 0.5,
            alertVolume: 0.7,
            theme: 'dark',
          }),
          JSON.stringify({
            browserPush: true,
            sms: false,
            telegram: false,
            emailDigest: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          }),
          now(),
          now(),
        ]
      );

      profile = await db.get<UserProfileRow>(
        'SELECT * FROM user_profiles WHERE id = ?', [profileId]
      );
    }

    // Create session
    const sessionId = existingSession?.id ?? generateId();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    if (existingSession) {
      // Replace proof in one conditional write. Concurrent resumes cannot both
      // succeed, and no extra live session is left behind for the old token.
      const rotated = await db.run(
        `UPDATE sessions SET token = ?, expires_at = ?, last_active_at = ?
         WHERE id = ? AND token = ? AND device_id IS ? AND profile_id = ?
           AND is_guest = 1 AND julianday(expires_at) > julianday(?)`,
        [token, expiresAt, now(), sessionId, proof, deviceId || null, profile.id, now()]
      );
      if (!rotated.changes) {
        return res.status(401).json({ success: false, error: 'Invalid session proof' });
      }
    } else {
      await db.run(
        `INSERT INTO sessions (
          id, token, device_id, is_guest, profile_id, created_at, expires_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, token, deviceId || null, 1, profile.id, now(), expiresAt, now()]
      );
    }

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        token,
        isGuest: true,
        expiresAt,
        profile: presentProfile(profile),
      },
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
    });
  }
});

/**
 * GET /api/auth/session
 * Get current session
 */
authRouter.get('/session', async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

    const session = await db.get<Session>(
      `SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday(?)`,
      [token, now()]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
    }

    const profile = await db.get<any>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    // Update last active
    await db.run(
      `UPDATE sessions SET last_active_at = ? WHERE id = ?`,
      [now(), session.id]
    );

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        token: session.token,
        isGuest: Boolean(session.is_guest),
        expiresAt: session.expires_at,
        profile: profile ? presentProfile(profile) : null,
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session',
    });
  }
});

/**
 * DELETE /api/auth/session
 * End current session
 */
authRouter.delete('/session', async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

    await db.run(
      `DELETE FROM push_subscriptions WHERE session_id IN (SELECT id FROM sessions WHERE token = ?)`,
      [token]
    );
    await db.run(
      `DELETE FROM sessions WHERE token = ?`,
      [token]
    );

    res.json({
      success: true,
      message: 'Session ended',
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session',
    });
  }
});

// =============================================================================
// Profile Endpoints
// =============================================================================

/**
 * GET /api/auth/profile
 * Get user profile
 */
authRouter.get('/profile', async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

    const session = await db.get<Session>(
      `SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday(?)`,
      [token, now()]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
    }

    const profile = await db.get<any>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profile_id]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    res.json({
      success: true,
      data: presentProfile(profile),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
    });
  }
});

/**
 * PATCH /api/auth/profile
 * Update user profile
 */
authRouter.patch('/profile', requireAuth, validate(UpdateUserProfileSchema), async (req, res) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);

    const { displayName, preferences, notificationSettings } = req.body;

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName);
    }

    if (preferences !== undefined) {
      // Merge with existing preferences
      const existing = await db.get<any>(
        `SELECT preferences FROM user_profiles WHERE id = ?`,
        [profileId]
      );
      const merged = {
        ...JSON.parse(existing?.preferences || '{}'),
        ...preferences,
      };
      updates.push('preferences = ?');
      params.push(JSON.stringify(merged));
    }

    if (notificationSettings !== undefined) {
      // Merge with existing settings
      const existing = await db.get<any>(
        `SELECT notification_settings FROM user_profiles WHERE id = ?`,
        [profileId]
      );
      const merged = mergeNotificationSettings(
        JSON.parse(existing?.notification_settings || '{}'), notificationSettings
      );
      updates.push('notification_settings = ?');
      params.push(JSON.stringify(merged));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now());
      params.push(profileId);

      await db.run(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Return updated profile
    const profile = await db.get<any>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [profileId]
    );

    res.json({
      success: true,
      data: presentProfile(profile),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

// =============================================================================
// Device Registration
// =============================================================================

/**
 * POST /api/auth/device
 * Register a device ID for session persistence
 */
authRouter.post('/device', async (req, res) => {
  try {
    const token = extractToken(req);
    const { deviceId } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Device ID required',
      });
    }

    const db = await getSafeOSDatabase();

    const session = await db.get<Session>(
      'SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday(?)',
      [token, now()]
    );
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    await db.run(
      `UPDATE sessions SET device_id = ? WHERE token = ?`,
      [deviceId, token]
    );

    res.json({
      success: true,
      message: 'Device registered',
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
    });
  }
});
