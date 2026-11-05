/**
 * Mail Suppression Store
 *
 * Unsubscribe tokens and the suppression list, kept in the SafeOS database
 * through @framers/sql-storage-adapter.
 *
 * - A token is 32 bytes (base64url): random, or, for a mail sent with an
 *   idempotency key, an HMAC-SHA256 of the key under a secret kept in the
 *   database, so a retried send carries the same link and the same mail.
 *   Only its SHA-256 is stored, bound to the recipient's address hash and the
 *   mail's category. It can do one thing: stop mail to that address.
 * - Addresses are stored as the SHA-256 of the lower-cased mailbox (the part
 *   inside <...> of a "Name <address>" recipient), never in clear.
 * - Every send reads the list first: optional mail stops on its category,
 *   `optional` or `all`; required mail stops only on `all` (a manual stop).
 *
 * @module lib/alerts/mail-suppression
 */

import { createHash, createHmac, randomBytes } from 'crypto';
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

/** The mailbox of a recipient: `Name <a@b.c>` and `a@b.c` both give `a@b.c`. */
export function mailboxOf(address: string): string {
  const named = address.match(/<([^<>]*)>\s*$/);
  return (named ? named[1] : address).trim();
}

export function normalizeAddress(address: string): string {
  return mailboxOf(address).toLowerCase();
}

export function hashAddress(address: string): string {
  return sha256(normalizeAddress(address));
}

// =============================================================================
// Store
// =============================================================================

interface OpenStore {
  db: MailStoreDatabase;
  /** Key for tokens derived from an idempotency key. */
  secret: string;
}

export class MailSuppressionStore {
  private ready: Promise<OpenStore> | null = null;

  constructor(private readonly openDatabase: () => Promise<MailStoreDatabase>) {}

  private async database(): Promise<MailStoreDatabase> {
    return (await this.open()).db;
  }

  private open(): Promise<OpenStore> {
    if (!this.ready) {
      const opening = (async (): Promise<OpenStore> => {
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
        await db.exec(`
          CREATE TABLE IF NOT EXISTS mail_settings (
            name TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        await db.run(
          `INSERT INTO mail_settings (name, value) VALUES ('token_secret', ?)
           ON CONFLICT (name) DO NOTHING`,
          [randomBytes(32).toString('hex')],
        );
        const row = (await db.get(
          "SELECT value FROM mail_settings WHERE name = 'token_secret'",
        )) as { value?: string } | null | undefined;
        if (!row?.value) {
          throw new Error('Mail token secret is missing');
        }
        return { db, secret: row.value };
      })();
      // A failed open is retried on the next call instead of being cached.
      opening.catch(() => {
        if (this.ready === opening) this.ready = null;
      });
      this.ready = opening;
    }
    return this.ready;
  }

  /**
   * Mint a token bound to this address and category; returns the raw token.
   * With an idempotency key the token is derived from it, so a retry of the
   * same send gets the same token.
   */
  async issueToken(
    address: string,
    category: MailCategory,
    idempotencyKey?: string,
  ): Promise<string> {
    if (!isMailCategory(category)) {
      throw new Error(`Unknown mail category: ${String(category)}`);
    }
    const { db, secret } = await this.open();
    const token = idempotencyKey
      ? createHmac('sha256', secret)
          .update(`${category}\n${normalizeAddress(address)}\n${idempotencyKey}`, 'utf8')
          .digest('base64url')
      : randomBytes(32).toString('base64url');
    await db.run(
      `INSERT INTO mail_unsubscribe_tokens (token_hash, address_hash, category, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (token_hash) DO NOTHING`,
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

  /**
   * Remove the suppressions this address made with its unsubscribe links.
   * Manual stops stay. Returns whether anything was removed.
   */
  async liftUnsubscribes(address: string): Promise<boolean> {
    const db = await this.database();
    const addressHash = hashAddress(address);
    const before = await db.get(
      "SELECT scope FROM mail_suppressions WHERE address_hash = ? AND reason = 'unsubscribe' LIMIT 1",
      [addressHash],
    );
    if (!before) return false;
    await db.run("DELETE FROM mail_suppressions WHERE address_hash = ? AND reason = 'unsubscribe'", [
      addressHash,
    ]);
    return true;
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
 * Lift the unsubscribes a person made with their links, for each address in
 * `text`, when that person asks for mail again. A manual stop (scope `all`,
 * reason `manual`) is never lifted here. Returns counts only.
 */
export async function resubscribeAddressesFromText(
  text: string,
  store: MailSuppressionStore = getMailSuppressionStore(),
): Promise<{ resubscribed: number; unchanged: number; skipped: number }> {
  let resubscribed = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const mailbox = mailboxOf(entry);
    if (!ADDRESS_PATTERN.test(mailbox)) {
      skipped += 1;
      continue;
    }
    if (await store.liftUnsubscribes(mailbox)) {
      resubscribed += 1;
    } else {
      unchanged += 1;
    }
  }
  return { resubscribed, unchanged, skipped };
}

/**
 * Stop every mail, required mail included, to each address in `text`
 * (one per line, bare or as "Name <address>"; blank lines and lines starting
 * with # are ignored).
 * Returns counts only, so no address reaches a log.
 */
export async function suppressAddressesFromText(
  text: string,
  store: MailSuppressionStore = getMailSuppressionStore(),
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const mailbox = mailboxOf(entry);
    if (!ADDRESS_PATTERN.test(mailbox)) {
      skipped += 1;
      continue;
    }
    await store.suppressAddress(mailbox, 'all', 'manual');
    added += 1;
  }
  return { added, skipped };
}
