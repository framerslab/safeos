import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import { SafeOSServer } from '../../src/api/server.js';

const instances: SafeOSServer[] = [];
const previous = process.env['SAFEOS_TRUST_PROXY'];
afterAll(async () => {
  if (previous === undefined) delete process.env['SAFEOS_TRUST_PROXY'];
  else process.env['SAFEOS_TRUST_PROXY'] = previous;
  await Promise.all(instances.map((s) => s.stop().catch(() => {})));
});

describe('production proxy boundary', () => {
  it('does not let a direct peer choose a new rate-limit identity', async () => {
    const compose = readFileSync(new URL('../../docker-compose.prod.yml', import.meta.url), 'utf8');
    process.env['SAFEOS_TRUST_PROXY'] = compose.match(/SAFEOS_TRUST_PROXY=([^\s]+)/)![1];
    const server = new SafeOSServer();
    instances.push(server);
    const app = server.getApp();
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/api/auth/session').set('X-Forwarded-For', `203.0.113.${i + 1}`)).status).toBe(401);
    }
    expect((await request(app).get('/api/auth/session').set('X-Forwarded-For', '203.0.113.99')).status).toBe(429);
  });

  it('rejects hop counts while accepting exact proxy addresses', () => {
    process.env['SAFEOS_TRUST_PROXY'] = '1';
    const numeric = new SafeOSServer();
    instances.push(numeric);
    expect(numeric.getApp().get('trust proxy')).toBe(false);
    process.env['SAFEOS_TRUST_PROXY'] = '127.0.0.1,::1';
    const explicit = new SafeOSServer();
    instances.push(explicit);
    const trust = explicit.getApp().get('trust proxy fn');
    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('::1', 0)).toBe(true);
    expect(trust('172.30.0.3', 0)).toBe(false);
  });
});
