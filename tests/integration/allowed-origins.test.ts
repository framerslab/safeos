/**
 * Which web pages may read the server's answers
 *
 * The server holds sessions, so a browser lets a page on another site read
 * its answers only when the answer names that page's origin. With
 * SAFEOS_ALLOWED_ORIGINS unset the server names the hosted app
 * (https://safeos.sh), the phone app shells (capacitor.config.ts) and the
 * development addresses on this machine; with it set, the origins it lists
 * and no other. A page on the server's own address needs no such header.
 * Behind the bundled Caddy, its one CORS_ORIGIN replaces the server's header,
 * so an answer never carries two. A listed origin is read whatever its
 * capitals, as a browser sends an origin in small letters, and the server
 * says when it starts which listed entries are not an origin, since none of
 * them can ever be allowed.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import { SafeOSServer } from '../../src/api/server.js';

const instances: SafeOSServer[] = [];
const previous = process.env['SAFEOS_ALLOWED_ORIGINS'];

afterAll(async () => {
  if (previous === undefined) delete process.env['SAFEOS_ALLOWED_ORIGINS'];
  else process.env['SAFEOS_ALLOWED_ORIGINS'] = previous;
  await Promise.all(instances.map((s) => s.stop().catch(() => {})));
});

function appWith(origins: string | undefined) {
  if (origins === undefined) delete process.env['SAFEOS_ALLOWED_ORIGINS'];
  else process.env['SAFEOS_ALLOWED_ORIGINS'] = origins;
  const server = new SafeOSServer();
  instances.push(server);
  return server.getApp();
}

async function allowedBy(app: ReturnType<typeof appWith>, origin: string) {
  const answer = await request(app).get('/health').set('Origin', origin);
  expect(answer.status).toBe(200);
  return answer.headers['access-control-allow-origin'] ?? null;
}

const OTHER_SITES = [
  'https://other.example',
  'https://safeos.sh.other.example',
  'http://safeos.sh',
  'https://www.safeos.sh',
  'null',
  'http://localhost.other.example:3000',
];

describe('allowed origins', () => {
  it('with no setting, names the hosted app, the phone shells and localhost, and no other site', async () => {
    const app = appWith(undefined);
    for (const origin of [
      'https://safeos.sh',
      'capacitor://localhost',
      'https://localhost',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost',
    ]) {
      expect([origin, await allowedBy(app, origin)]).toEqual([origin, origin]);
    }
    for (const origin of OTHER_SITES) {
      expect([origin, await allowedBy(app, origin)]).toEqual([origin, null]);
    }
  });

  it('an empty setting is the same as none', async () => {
    const app = appWith('  ');
    expect(await allowedBy(app, 'https://safeos.sh')).toBe('https://safeos.sh');
    expect(await allowedBy(app, 'https://other.example')).toBeNull();
  });

  it('with a setting, names exactly the origins it lists', async () => {
    const app = appWith(' https://guardian.example.test , http://192.168.1.20:3000 ');
    expect(await allowedBy(app, 'https://guardian.example.test')).toBe('https://guardian.example.test');
    expect(await allowedBy(app, 'http://192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    for (const origin of ['https://safeos.sh', 'http://localhost:3000', 'capacitor://localhost', ...OTHER_SITES]) {
      expect([origin, await allowedBy(app, origin)]).toEqual([origin, null]);
    }
  });

  it('reads a listed origin whatever its capitals, as a browser sends it in small letters', async () => {
    const app = appWith('https://Guardian.Example.test, HTTP://LOCALHOST:8080');
    expect(await allowedBy(app, 'https://guardian.example.test')).toBe('https://guardian.example.test');
    expect(await allowedBy(app, 'http://localhost:8080')).toBe('http://localhost:8080');
    expect(await allowedBy(app, 'https://other.example')).toBeNull();
  });

  it("reads a listed origin written with its scheme's default port as a browser sends it, without the port", async () => {
    const app = appWith('https://guardian.example.test:443, http://192.168.1.20:80, http://localhost:8080');
    expect(await allowedBy(app, 'https://guardian.example.test')).toBe('https://guardian.example.test');
    expect(await allowedBy(app, 'http://192.168.1.20')).toBe('http://192.168.1.20');
    expect(await allowedBy(app, 'http://localhost:8080')).toBe('http://localhost:8080');
    expect(await allowedBy(app, 'https://guardian.example.test:8443')).toBeNull();
  });

  it('says when it starts which listed entries are not an origin, and names no good one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      appWith('guardian.example.test, https://guardian.example.test/app, *, https://fine.example.test');
      const said = warn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
      // Each entry stands in quotes, so one is not read inside another.
      for (const entry of ['guardian.example.test', 'https://guardian.example.test/app', '*']) {
        expect([entry, said.includes(`"${entry}"`)]).toEqual([entry, true]);
      }
      expect(said).toContain('SAFEOS_ALLOWED_ORIGINS');
      expect(said).not.toContain('https://fine.example.test');
    } finally {
      warn.mockRestore();
    }
  });

  it('answers a preflight from an allowed origin with the headers the app sends, and names no other site', async () => {
    const app = appWith(undefined);
    const allowed = await request(app)
      .options('/api/auth/session')
      .set('Origin', 'https://safeos.sh')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-session-token');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://safeos.sh');
    expect(allowed.headers['vary']).toMatch(/Origin/);
    const other = await request(app)
      .options('/api/auth/session')
      .set('Origin', 'https://other.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('a request with no Origin, as from a script or a same-origin page load, is answered with no CORS header', async () => {
    const app = appWith(undefined);
    const answer = await request(app).get('/health');
    expect(answer.status).toBe(200);
    expect(answer.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the compose files hand the server its setting, and the bundled Caddy replaces the header instead of adding a second', () => {
    for (const file of ['docker-compose.yml', 'docker-compose.prod.yml', 'docker-compose.ghcr.yml']) {
      const compose = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      expect([file, /SAFEOS_ALLOWED_ORIGINS=\$\{SAFEOS_ALLOWED_ORIGINS:-\}/.test(compose)]).toEqual([file, true]);
    }
    const caddy = readFileSync(new URL('../../Caddyfile', import.meta.url), 'utf8');
    const cors = caddy.match(/header \{[^}]*Access-Control-Allow-Origin[^}]*\}/)?.[0] ?? '';
    expect(cors).toMatch(/^\s*defer\s*$/m);
  });
});
