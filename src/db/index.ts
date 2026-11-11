/**
 * SafeOS Database
 *
 * Database setup using @framers/sql-storage-adapter.
 *
 * @module db
 */

import { createDatabase, type StorageHooks } from '@framers/sql-storage-adapter';

// Type alias for Database (inferred from createDatabase result)
type Database = Awaited<ReturnType<typeof createDatabase>>;

// =============================================================================
// Types
// =============================================================================

export interface DatabaseRow {
  [key: string]: unknown;
}

// =============================================================================
// Constants
// =============================================================================

const BUFFER_MINUTES = 10; // Rolling buffer for privacy

// =============================================================================
// Hooks
// =============================================================================

const hooks: StorageHooks = {
  onAfterWrite: async (context, _result) => {
    // Cleanup old frames after every write
    if (context.statement?.includes('frame_buffer')) {
      const db = await getSafeOSDatabase();
      await cleanupOldFrames(db);
    }
  },

  onAfterQuery: async (context, _result) => {
    // Log slow queries
    const duration = Date.now() - (context.startTime || Date.now());
    if (duration > 100) {
      console.warn(`Slow query (${duration}ms):`, context.statement?.slice(0, 100));
    }
  },
};

// =============================================================================
// Database Creation
// =============================================================================

let dbInstance: Database | null = null;

/**
 * Create the SafeOS database
 */
export async function createSafeOSDatabase(): Promise<Database> {
  const db = await createDatabase({
    priority: ['better-sqlite3', 'sqljs'],
    hooks,
  } as any);

  return db;
}

/**
 * Get the database singleton
 */
export async function getSafeOSDatabase(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await createSafeOSDatabase();
  }
  return dbInstance;
}

// =============================================================================
// Migrations
// =============================================================================

/**
 * Run database migrations
 */
export async function runMigrations(db: Database): Promise<void> {
  // Create streams table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scenario TEXT NOT NULL CHECK (scenario IN ('pet', 'baby', 'elderly')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended', 'banned')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Create frame_buffer table (rolling buffer for privacy)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS frame_buffer (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      frame_data TEXT NOT NULL,
      motion_score REAL DEFAULT 0,
      audio_level REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )
  `);

  // Create index for frame cleanup
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frame_buffer_created_at
    ON frame_buffer(created_at)
  `);

  // Create analysis_results table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      frame_id TEXT,
      concern_level TEXT NOT NULL CHECK (concern_level IN ('none', 'low', 'medium', 'high', 'critical')),
      description TEXT NOT NULL,
      detected_issues TEXT,
      processing_time_ms INTEGER,
      model_used TEXT,
      is_cloud_fallback INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )
  `);

  // Create alerts table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
      message TEXT NOT NULL,
      metadata TEXT,
      thumbnail_url TEXT,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )
  `);

  // Create index for unacknowledged alerts
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged
    ON alerts(acknowledged, created_at)
  `);

  // Create monitoring_profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS monitoring_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scenario TEXT NOT NULL CHECK (scenario IN ('pet', 'baby', 'elderly')),
      settings TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Create content_flags table (for human review)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS content_flags (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      analysis_id TEXT,
      category TEXT NOT NULL,
      tier INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 4),
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'banned')),
      metadata TEXT,
      reviewed_at TEXT,
      reviewer_notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )
  `);

  // Create analysis_queue table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_queue (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      scenario TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      retries INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )
  `);

  // Create user_profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      preferences TEXT NOT NULL DEFAULT '{}',
      notification_settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      device_id TEXT,
      is_guest INTEGER DEFAULT 1,
      profile_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    )
  `);

  // Create index for session tokens
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)
  `);

  // Create index for device ID lookup
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id)
  `);

  // =============================================================================
  // Performance Indexes (Phase 3.2)
  // =============================================================================

  // Index for stream_id lookups in alerts (used in JOIN queries)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_stream_id ON alerts(stream_id)
  `);

  // Index for date-based alert queries
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)
  `);

  // Index for user_id lookups in streams (multi-tenancy queries)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id)
  `);

  // Index for analysis queue processing
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analysis_queue_status ON analysis_queue(status, priority)
  `);

  // Create push_subscriptions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      keys_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    )
  `);

  // Create telegram_chats table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_chats (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    )
  `);

  // Create phone_numbers table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS phone_numbers (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    )
  `);

  // Create webhooks table (the /api/webhooks routes and their delivery)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_triggered TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhooks_profile_id ON webhooks(profile_id)
  `);

  // Roles: 'user' (everyone), 'reviewer' (reads and acts on content flags),
  // 'operator' (runs the deployment). The operator grants a role with
  // UPDATE user_profiles SET role = 'reviewer' WHERE id = '<profile id>'.
  await addColumnIfMissing(db, 'user_profiles', 'role', "TEXT NOT NULL DEFAULT 'user'");

  // Monitoring profiles a person creates carry their profile id; the built-in
  // defaults have none and are shared, read-only to everyone but the operator.
  await addColumnIfMissing(db, 'monitoring_profiles', 'owner_id', 'TEXT');
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_monitoring_profiles_owner ON monitoring_profiles(owner_id)
  `);

  // Insert default profiles if not exist
  await insertDefaultProfiles(db);
}

/**
 * Add a column to an existing table once; CREATE TABLE IF NOT EXISTS leaves
 * the tables of an existing database as they were.
 */
async function addColumnIfMissing(
  db: Database,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const columns = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return;
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Insert default monitoring profiles
 */
export async function insertDefaultProfiles(db: Database): Promise<void> {
  const existing = await db.get('SELECT COUNT(*) as count FROM monitoring_profiles');
  if (existing && (existing as any).count > 0) return;

  const timestamp = now();

  const profiles = [
    {
      id: 'profile-baby-default',
      name: 'Baby Monitoring',
      scenario: 'baby',
      settings: JSON.stringify({
        motionSensitivity: 35,
        audioSensitivity: 30,
        analysisInterval: 30,
        cryDetection: true,
        sleepMonitoring: true,
      }),
    },
    {
      id: 'profile-pet-default',
      name: 'Pet Monitoring',
      scenario: 'pet',
      settings: JSON.stringify({
        motionSensitivity: 40,
        audioSensitivity: 45,
        analysisInterval: 45,
        inactivityAlert: true,
        barkDetection: true,
      }),
    },
    {
      id: 'profile-elderly-default',
      name: 'Elderly Care',
      scenario: 'elderly',
      settings: JSON.stringify({
        motionSensitivity: 20,
        audioSensitivity: 25,
        analysisInterval: 60,
        fallDetection: true,
        helpDetection: true,
      }),
    },
  ];

  for (const profile of profiles) {
    await db.run(
      `INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [profile.id, profile.name, profile.scenario, profile.settings, timestamp]
    );
  }
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Clean up old frames from buffer (privacy)
 */
export async function cleanupOldFrames(db: Database): Promise<void> {
  const threshold = new Date(Date.now() - BUFFER_MINUTES * 60 * 1000).toISOString();

  await db.run('DELETE FROM frame_buffer WHERE created_at < ?', [threshold]);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get current timestamp as ISO string
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Close the database
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
