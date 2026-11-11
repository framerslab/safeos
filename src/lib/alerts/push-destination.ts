/** Destination policy shared by push registration and delivery. */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent } from 'node:https';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blocked.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export class PushDestinationError extends Error {
  constructor() {
    super('Push destination is not an allowed public push service');
    this.name = 'PushDestinationError';
  }
}

/** Resolve on each use; never trust a previously stored subscription. */
export async function resolvePushDestination(endpoint: string) {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new PushDestinationError(); }
  const host = url.hostname;
  const validLabels = host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  // Vendor references and the date checked are recorded in docs/CONFIGURATION.md.
  const allowedHost = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      /[\s\\]/.test(endpoint) || !validLabels || !allowedHost || isIP(host)) {
    throw new PushDestinationError();
  }
  let addresses;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new PushDestinationError(); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new PushDestinationError();
  }
  return { url, address: addresses[0] };
}

/** Pin the checked address while retaining the provider hostname for TLS. */
export function pushDestinationAgent(destination: Awaited<ReturnType<typeof resolvePushDestination>>): Agent {
  return new Agent({
    keepAlive: false,
    lookup: (hostname, options, callback) => {
      if (hostname !== destination.url.hostname) {
        callback(new PushDestinationError(), '', 4);
        return;
      }
      const { address, family } = destination.address;
      if (options.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    },
  });
}
