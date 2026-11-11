/**
 * Email Authentication Service
 *
 * Full email/password authentication with secure password hashing,
 * email verification, and password reset functionality.
 *
 * @module auth/email-auth
 */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { getSafeOSDatabase, generateId, now } from '../db/index.js';
import { sendVerificationEmail, sendPasswordResetEmail, isResendConfigured, getMailLinkBase } from '../lib/alerts/email.js';

const scryptAsync = promisify(scrypt);

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationExpires: string | null;
  resetToken: string | null;
  resetTokenExpires: string | null;
  role: 'user' | 'admin' | 'reviewer';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: Omit<User, 'passwordHash' | 'verificationToken' | 'resetToken'>;
  error?: string;
  sessionToken?: string;
}

// =============================================================================
// Password Hashing
// =============================================================================

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Hash a password using scrypt
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const keyBuffer = Buffer.from(key, 'hex');

  return timingSafeEqual(derivedKey, keyBuffer);
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Account links are served by the API that owns the account database. */
function buildAccountUrl(path: string): string {
  const base = getMailLinkBase();
  if (!base) throw new Error('Account mail requires an https API public URL');
  return `${base}/api/auth/email/${path}`;
}

// =============================================================================
// Email Auth Service
// =============================================================================

export class EmailAuthService {
  private db: any;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.db = await getSafeOSDatabase();

    // Create users table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        verification_token TEXT,
        verification_expires TEXT,
        reset_token TEXT,
        reset_token_expires TEXT,
        role TEXT DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      )
    `);

    // Create index on email
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    this.initialized = true;
  }

  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    await this.initialize();

    const { email, password, displayName } = input;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate password strength
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    if (!/[A-Z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/[0-9]/.test(password)) {
      return { success: false, error: 'Password must contain at least one number' };
    }

    // Check if email already exists
    const existing = await this.db.get(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Create user
    const userId = generateId();
    const timestamp = now();

    await this.db.run(
      `INSERT INTO users (
        id, email, password_hash, display_name, email_verified,
        verification_token, verification_expires, role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email.toLowerCase(),
        passwordHash,
        displayName || email.split('@')[0],
        0, // Not verified
        verificationToken,
        verificationExpires,
        'user',
        timestamp,
        timestamp,
      ]
    );

    // Get the created user (without sensitive fields)
    const user = await this.getUserById(userId);

    if (!user) {
      return { success: false, error: 'Failed to create user' };
    }

    // Send verification email (best-effort — registration still succeeds if email fails).
    // Operators without Resend configured can re-issue verification later.
    if (isResendConfigured()) {
      try {
        const verificationUrl = buildAccountUrl(`verify?token=${encodeURIComponent(verificationToken)}`);
        await sendVerificationEmail(user.email, verificationUrl, user.displayName);
      } catch (error) {
        console.error('[EmailAuth] Failed to send verification email:', error);
      }
    } else {
      console.warn('[EmailAuth] Email is not configured (RESEND_API_KEY, EMAIL_FROM, SAFEOS_API_PUBLIC_URL); verification email not sent.');
    }

    return {
      success: true,
      user,
    };
  }

  /**
   * Login with email and password
   */
  async login(input: LoginInput): Promise<AuthResult> {
    await this.initialize();

    const { email, password } = input;

    // Find user by email
    const row = await this.db.get(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (!row) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Verify password
    const isValid = await verifyPassword(password, row.password_hash);

    if (!isValid) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Check if email is verified (optional: you might allow login without verification)
    if (!row.email_verified) {
      return { success: false, error: 'Please verify your email before logging in' };
    }

    // Update last login
    const timestamp = now();
    await this.db.run(
      'UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?',
      [timestamp, timestamp, row.id]
    );

    // Create session token
    const sessionToken = generateToken();

    // The account ID is also its stable profile ID. Existing accounts get
    // their profile on first login; subsequent logins retain preferences.
    await this.db.run(
      `INSERT OR IGNORE INTO user_profiles (id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [row.id, row.display_name, timestamp, timestamp]
    );
    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await this.db.run(
      `INSERT INTO sessions (id, token, is_guest, profile_id, created_at, expires_at, last_active_at)
       VALUES (?, ?, 0, ?, ?, ?, ?)`,
      [sessionId, sessionToken, row.id, timestamp, expiresAt, timestamp]
    );

    const user = await this.getUserById(row.id);

    return {
      success: true,
      user: user!,
      sessionToken,
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<AuthResult> {
    await this.initialize();

    const row = await this.db.get(
      'SELECT * FROM users WHERE verification_token = ?',
      [token]
    );

    if (!row) {
      return { success: false, error: 'Invalid verification token' };
    }

    if (new Date(row.verification_expires) < new Date()) {
      return { success: false, error: 'Verification token has expired' };
    }

    // Mark email as verified
    const timestamp = now();
    await this.db.run(
      `UPDATE users SET
        email_verified = 1,
        verification_token = NULL,
        verification_expires = NULL,
        updated_at = ?
       WHERE id = ?`,
      [timestamp, row.id]
    );

    const user = await this.getUserById(row.id);

    return {
      success: true,
      user: user!,
    };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const row = await this.db.get(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (!row) {
      return { success: true };
    }

    const resetToken = generateToken();
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await this.db.run(
      `UPDATE users SET
        reset_token = ?,
        reset_token_expires = ?,
        updated_at = ?
       WHERE id = ?`,
      [resetToken, resetTokenExpires, now(), row.id]
    );

    // Send password reset email. Always returns success to caller to prevent
    // email enumeration — failures here are logged only.
    if (isResendConfigured()) {
      try {
        const user = await this.getUserById(row.id);
        const resetUrl = buildAccountUrl(`reset-password?token=${encodeURIComponent(resetToken)}`);
        await sendPasswordResetEmail(email.toLowerCase(), resetUrl, user?.displayName);
      } catch (error) {
        console.error('[EmailAuth] Failed to send password reset email:', error);
      }
    } else {
      console.warn('[EmailAuth] Email is not configured (RESEND_API_KEY, EMAIL_FROM, SAFEOS_API_PUBLIC_URL); password reset email not sent.');
    }

    return { success: true };
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    await this.initialize();

    const row = await this.db.get(
      'SELECT * FROM users WHERE reset_token = ?',
      [token]
    );

    if (!row) {
      return { success: false, error: 'Invalid reset token' };
    }

    if (new Date(row.reset_token_expires) < new Date()) {
      return { success: false, error: 'Reset token has expired' };
    }

    // Validate new password
    if (newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    const passwordHash = await hashPassword(newPassword);
    const timestamp = now();

    const changed = await this.db.run(
      `UPDATE users SET
        password_hash = ?,
        reset_token = NULL,
        reset_token_expires = NULL,
        updated_at = ?
       WHERE id = ? AND reset_token = ? AND julianday(reset_token_expires) > julianday(?)`,
      [passwordHash, timestamp, row.id, token, timestamp]
    );

    if (!changed.changes) return { success: false, error: 'Invalid or expired reset token' };
    await this.logoutAll(row.id);
    const user = await this.getUserById(row.id);

    return {
      success: true,
      user: user!,
    };
  }

  /**
   * Change password (when logged in)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const row = await this.db.get(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (!row) {
      return { success: false, error: 'User not found' };
    }

    const isValid = await verifyPassword(currentPassword, row.password_hash);

    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }

    const passwordHash = await hashPassword(newPassword);

    await this.db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [passwordHash, now(), userId]
    );

    return { success: true };
  }

  /**
   * Get user by ID (without sensitive fields)
   */
  private async getUserById(id: string): Promise<AuthResult['user'] | null> {
    const row = await this.db.get(
      `SELECT id, email, display_name, email_verified, role, created_at, updated_at, last_login_at
       FROM users WHERE id = ?`,
      [id]
    );

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerified: !!row.email_verified,
      verificationExpires: null,
      resetTokenExpires: null,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
    };
  }

  /**
   * Validate session token and get user
   */
  async validateSession(token: string): Promise<AuthResult['user'] | null> {
    await this.initialize();

    const session = await this.db.get(
      'SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday(?)',
      [token, now()]
    );

    if (!session || session.is_guest) {
      return null;
    }

    // Update last active
    await this.db.run(
      'UPDATE sessions SET last_active_at = ? WHERE id = ?',
      [now(), session.id]
    );

    return this.getUserById(session.profile_id);
  }

  /**
   * Invalidate session (logout)
   */
  async logout(token: string): Promise<void> {
    await this.initialize();

    await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
  }

  /**
   * Invalidate all sessions for a user
   */
  async logoutAll(userId: string): Promise<void> {
    await this.initialize();

    await this.db.run('DELETE FROM sessions WHERE profile_id = ?', [userId]);
  }
}

// Singleton instance
export const emailAuthService = new EmailAuthService();

export default emailAuthService;
