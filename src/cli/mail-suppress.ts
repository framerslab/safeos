/**
 * Stop, or turn back on, mail to a list of addresses
 *
 * Reads addresses from standard input, one per line (bare or as
 * "Name <address>"). Prints counts only, never an address.
 *
 * Stop every mail, account mail included (a manual stop):
 *   docker compose exec -T api npx tsx src/cli/mail-suppress.ts < addresses.txt
 *
 * Lift the unsubscribes a person made with their links, only when that
 * person asks for mail again (manual stops stay):
 *   docker compose exec -T api npx tsx src/cli/mail-suppress.ts --resubscribe < addresses.txt
 *
 * @module cli/mail-suppress
 */

import {
  resubscribeAddressesFromText,
  suppressAddressesFromText,
} from '../lib/alerts/mail-suppression.js';
import { closeDatabase } from '../db/index.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const text = await readStdin();
  if (process.argv.includes('--resubscribe')) {
    const { resubscribed, unchanged, skipped } = await resubscribeAddressesFromText(text);
    console.log(
      `Turned mail back on for ${resubscribed} address(es); ${unchanged} had no unsubscribe to lift; skipped ${skipped} line(s) that are not addresses.`,
    );
  } else {
    const { added, skipped } = await suppressAddressesFromText(text);
    console.log(`Stopped all mail to ${added} address(es); skipped ${skipped} line(s) that are not addresses.`);
  }
  await closeDatabase();
}

main().catch((error) => {
  console.error('mail-suppress failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
