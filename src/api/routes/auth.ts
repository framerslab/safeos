/**
 * Authentication Routes
 *
 * Session management with guest mode support.
 * All data stored locally in client IndexedDB.
 *
 * @module api/routes/auth
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getSafeOSDatabase, generateId, now } from '../../db/index.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, getProfileId } from '../middleware/auth.js';
import { CreateSessionSchema, UpdateUserProfileSchema } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

interface Session {
  id: string;
  token: string;
  deviceId: string | null;
  isGuest: boolean;
  profileId: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
}

interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferences: Record<string, any>;
  notificationSettings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
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

    // Check for existing session by device ID
    let profile: UserProfile | null = null;

    if (deviceId) {
      const existingSession = await db.get<Session>(
        `SELECT * FROM sessions WHERE device_id = ? AND expires_at > datetime('now')`,
        [deviceId]
      );

      if (existingSession) {
        profile = await db.get<UserProfile>(
          `SELECT * FROM user_profiles WHERE id = ?`,
          [existingSession.profileId]
        );
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

      profile = {
        id: profileId,
        displayName: guestName,
        avatarUrl: null,
        preferences: {
          defaultScenario: 'pet',
          motionSensitivity: 0.5,
          audioSensitivity: 0.5,
          alertVolume: 0.7,
          theme: 'dark',
        },
        notificationSettings: {
          browserPush: true,
          sms: false,
          telegram: false,
          emailDigest: false,
        },
        createdAt: now(),
        updatedAt: now(),
      };
    }

    // Create session
    const sessionId = generateId();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await db.run(
      `INSERT INTO sessions (
        id, token, device_id, is_guest, profile_id, created_at, expires_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      // SQLite stores booleans as integers; better-sqlite3 refuses a JS boolean
      [sessionId, token, deviceId || null, 1, profile.id, now(), expiresAt, now()]
    );

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        token,
        isGuest: true,
        expiresAt,
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          preferences: profile.preferences,
          notificationSettings: profile.notificationSettings,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
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
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

    const session = await db.get<Session>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`,
      [token]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
    }

    const profile = await db.get<any>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profileId]
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
        isGuest: session.isGuest,
        expiresAt: session.expiresAt,
        profile: profile ? {
          id: profile.id,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
          preferences: JSON.parse(profile.preferences || '{}'),
          notificationSettings: JSON.parse(profile.notification_settings || '{}'),
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        } : null,
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
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

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
    const token = req.headers['x-session-token'] as string;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    const db = await getSafeOSDatabase();

    const session = await db.get<Session>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`,
      [token]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
    }

    const profile = await db.get<any>(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [session.profileId]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        preferences: JSON.parse(profile.preferences || '{}'),
        notificationSettings: JSON.parse(profile.notification_settings || '{}'),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
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
      const merged = {
        ...JSON.parse(existing?.notification_settings || '{}'),
        ...notificationSettings,
      };
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
      data: {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        preferences: JSON.parse(profile.preferences || '{}'),
        notificationSettings: JSON.parse(profile.notification_settings || '{}'),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
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
    const token = req.headers['x-session-token'] as string;
    const { deviceId } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID required',
      });
    }

    const db = await getSafeOSDatabase();

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





























