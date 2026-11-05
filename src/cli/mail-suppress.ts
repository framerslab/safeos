/**
 * Stop every mail to a list of addresses
 *
 * Reads addresses from standard input, one per line, and adds each to the
 * suppression list with scope `all`: no mail of any kind goes to it again,
 * account mail included. Prints counts only, never an address.
 *
 *   docker compose exec -T api npx tsx src/cli/mail-suppress.ts < addresses.txt
 *
 * @module cli/mail-suppress
 */

import { suppressAddressesFromText } from '../lib/alerts/mail-suppression.js';
import { closeDatabase } from '../db/index.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const { added, skipped } = await suppressAddressesFromText(await readStdin());
  console.log(`Stopped all mail to ${added} address(es); skipped ${skipped} line(s) that are not addresses.`);
  await closeDatabase();
}

main().catch((error) => {
  console.error('mail-suppress failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
