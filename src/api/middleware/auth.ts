/**
 * Authentication Middleware
 *
 * Express middleware for protecting API routes with session validation.
 *
 * @module api/middleware/auth
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getSafeOSDatabase } from '../../db/index.js';

// =============================================================================
// Types
// =============================================================================

interface Session {
  id: string;
  profile_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  role: string | null;
}

/** Roles a profile can hold. Every profile starts as `user`. */
export type Role = 'user' | 'reviewer' | 'operator';

/** Reads a session and its profile's role by token. */
const SESSION_BY_TOKEN = `SELECT s.*, p.role AS role
  FROM sessions s LEFT JOIN user_profiles p ON p.id = s.profile_id
  WHERE s.token = ?`;

// Extend Express Request to include session data
declare global {
  namespace Express {
    interface Request {
      session?: {
        id: string;
        profileId: string;
        token: string;
        expiresAt: Date;
        role: Role;
      };
    }
  }
}

// =============================================================================
// Auth Middleware
// =============================================================================

/**
 * Require a valid session token for the request
 *
 * Expects the token in either:
 * - `x-session-token` header
 * - `Authorization: Bearer <token>` header
 *
 * A token in the query string is refused.
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from headers
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authentication token',
      });
      return;
    }

    // Validate session
    const db = await getSafeOSDatabase();
    const session = await db.get<Session>(SESSION_BY_TOKEN, [token]);

    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid session token',
      });
      return;
    }

    // Check expiration
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      // Clean up expired session
      await db.run(`DELETE FROM sessions WHERE id = ?`, [session.id]);

      res.status(401).json({
        success: false,
        error: 'Session expired',
        message: 'Your session has expired. Please log in again.',
      });
      return;
    }

    // Attach session to request
    req.session = {
      id: session.id,
      profileId: session.profile_id,
      token: session.token,
      expiresAt,
      role: toRole(session.role),
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred while validating your session',
    });
  }
};

/**
 * Optional auth - attaches session if present but doesn't require it
 * Useful for routes that behave differently for authenticated users
 */
export const optionalAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);

    if (!token) {
      next();
      return;
    }

    const db = await getSafeOSDatabase();
    const session = await db.get<Session>(SESSION_BY_TOKEN, [token]);

    if (session) {
      const expiresAt = new Date(session.expires_at);
      if (expiresAt >= new Date()) {
        req.session = {
          id: session.id,
          profileId: session.profile_id,
          token: session.token,
          expiresAt,
          role: toRole(session.role),
        };
      }
    }

    next();
  } catch (error) {
    console.error('[Auth Middleware] Optional auth error:', error);
    // Fail silently for optional auth
    next();
  }
};

/**
 * Require a signed-in caller whose profile holds one of `roles`.
 * Answers 401 with no valid session and 403 for any other role.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void requireAuth(req, res, () => {
      if (!req.session || !roles.includes(req.session.role)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'This route needs the ' + roles.join(' or ') + ' role',
        });
        return;
      }
      next();
    });
  };
}

/** Require the operator role. */
export const requireAdmin: RequestHandler = requireRole('operator');

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract authentication token from request
 */
function extractToken(req: Request): string | null {
  // Check x-session-token header first (custom header)
  const sessionToken = req.headers['x-session-token'];
  if (typeof sessionToken === 'string') {
    return sessionToken;
  }

  // Check Authorization header (Bearer token)
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // A token in the query string is never accepted: URLs end up in access
  // logs, browser history and Referer headers.
  return null;
}

function toRole(value: string | null | undefined): Role {
  return value === 'reviewer' || value === 'operator' ? value : 'user';
}

/**
 * Look up a session that has not expired. Returns null for an unknown or
 * expired token. For handlers that read the token themselves.
 */
export async function findLiveSession(
  token: string | undefined | null
): Promise<{ id: string; profile_id: string; role: Role } | null> {
  if (!token) return null;
  const db = await getSafeOSDatabase();
  const session = await db.get<Session>(SESSION_BY_TOKEN, [token]);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  return { id: session.id, profile_id: session.profile_id, role: toRole(session.role) };
}

/**
 * Utility to get profile ID from request (requires auth middleware first)
 */
export function getProfileId(req: Request): string | null {
  return req.session?.profileId || null;
}

export default { requireAuth, optionalAuth, requireAdmin, requireRole, getProfileId, findLiveSession };
