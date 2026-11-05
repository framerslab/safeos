/**
 * Mail Suppression Store
 *
 * Unsubscribe tokens and the suppression list, kept in the SafeOS database
 * through @framers/sql-storage-adapter.
 *
 * - A token is 32 random bytes (base64url). Only its SHA-256 is stored, bound
 *   to the recipient's address hash and the mail's category. It can do one
 *   thing: stop mail to that address.
 * - Addresses are stored as the SHA-256 of the trimmed, lower-cased address,
 *   never in clear.
 * - Every send reads the list first: optional mail stops on its category,
 *   `optional` or `all`; required mail stops only on `all` (a manual stop).
 *
 * @module lib/alerts/mail-suppression
 */

import { createHash, randomBytes } from 'crypto';
import { getSafeOSDatabase, now } from '../../db/index.js';
import {
  isMailCategory,
  isRequiredCategory,
  type MailCategory,
  type SuppressionScope,
} from './mail-kinds.js';

// =============================================================================
// Types
// =============================================================================

/** The subset of the storage adapter this store uses. */
export interface MailStoreDatabase {
  exec(sql: string): Promise<unknown>;
  run(sql: string, params?: unknown[]): Promise<unknown>;
  get(sql: string, params?: unknown[]): Promise<unknown>;
}

export type SuppressionReason = 'unsubscribe' | 'manual';

export interface UnsubscribeTokenRecord {
  addressHash: string;
  category: MailCategory;
}

interface TokenRow {
  address_hash: string;
  category: string;
}

// =============================================================================
// Hashing
// =============================================================================

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function hashAddress(address: string): string {
  return sha256(normalizeAddress(address));
}

// =============================================================================
// Store
// =============================================================================

export class MailSuppressionStore {
  private ready: Promise<MailStoreDatabase> | null = null;

  constructor(private readonly openDatabase: () => Promise<MailStoreDatabase>) {}

  private database(): Promise<MailStoreDatabase> {
    if (!this.ready) {
      const opening = (async () => {
        const db = await this.openDatabase();
        await db.exec(`
          CREATE TABLE IF NOT EXISTS mail_unsubscribe_tokens (
            token_hash TEXT PRIMARY KEY,
            address_hash TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `);
        await db.exec(`
          CREATE TABLE IF NOT EXISTS mail_suppressions (
            address_hash TEXT NOT NULL,
            scope TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (address_hash, scope)
          )
        `);
        return db;
      })();
      // A failed open is retried on the next call instead of being cached.
      opening.catch(() => {
        if (this.ready === opening) this.ready = null;
      });
      this.ready = opening;
    }
    return this.ready;
  }

  /** Mint a token bound to this address and category; returns the raw token. */
  async issueToken(address: string, category: MailCategory): Promise<string> {
    if (!isMailCategory(category)) {
      throw new Error(`Unknown mail category: ${String(category)}`);
    }
    const db = await this.database();
    const token = randomBytes(32).toString('base64url');
    await db.run(
      `INSERT INTO mail_unsubscribe_tokens (token_hash, address_hash, category, created_at)
       VALUES (?, ?, ?, ?)`,
      [sha256(token), hashAddress(address), category, now()],
    );
    return token;
  }

  /** Look a raw token up; null for an unknown or malformed token. */
  async findToken(token: string): Promise<UnsubscribeTokenRecord | null> {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    const db = await this.database();
    const row = (await db.get(
      'SELECT address_hash, category FROM mail_unsubscribe_tokens WHERE token_hash = ?',
      [sha256(token)],
    )) as TokenRow | null | undefined;
    if (!row || !isMailCategory(row.category)) return null;
    return { addressHash: row.address_hash, category: row.category };
  }

  async suppressHash(
    addressHash: string,
    scope: SuppressionScope,
    reason: SuppressionReason,
  ): Promise<void> {
    const db = await this.database();
    await db.run(
      `INSERT INTO mail_suppressions (address_hash, scope, reason, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (address_hash, scope) DO NOTHING`,
      [addressHash, scope, reason, now()],
    );
  }

  async suppressAddress(
    address: string,
    scope: SuppressionScope,
    reason: SuppressionReason,
  ): Promise<void> {
    await this.suppressHash(hashAddress(address), scope, reason);
  }

  /** Whether mail of this category may not go to this address. */
  async isSuppressed(address: string, category: MailCategory): Promise<boolean> {
    const scopes: SuppressionScope[] = isRequiredCategory(category)
      ? ['all']
      : [category, 'optional', 'all'];
    const db = await this.database();
    const row = await db.get(
      `SELECT scope FROM mail_suppressions
       WHERE address_hash = ? AND scope IN (${scopes.map(() => '?').join(', ')})
       LIMIT 1`,
      [hashAddress(address), ...scopes],
    );
    return !!row;
  }
}

// =============================================================================
// Shared instance
// =============================================================================

let sharedStore: MailSuppressionStore | null = null;

/** The store every sender and the unsubscribe route use. */
export function getMailSuppressionStore(): MailSuppressionStore {
  if (!sharedStore) {
    sharedStore = new MailSuppressionStore(
      async () => (await getSafeOSDatabase()) as unknown as MailStoreDatabase,
    );
  }
  return sharedStore;
}

/** Replace the shared store (tests, or a host that keeps its own database). */
export function setMailSuppressionStore(store: MailSuppressionStore | null): void {
  sharedStore = store;
}

/**
 * Stop every mail, required mail included, to each address in `text`
 * (one per line; blank lines and lines starting with # are ignored).
 * Returns counts only, so no address reaches a log.
 */
export async function suppressAddressesFromText(
  text: string,
  store: MailSuppressionStore = getMailSuppressionStore(),
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const address = line.trim();
    if (!address || address.startsWith('#')) continue;
    if (!ADDRESS_PATTERN.test(address)) {
      skipped += 1;
      continue;
    }
    await store.suppressAddress(address, 'all', 'manual');
    added += 1;
  }
  return { added, skipped };
}
