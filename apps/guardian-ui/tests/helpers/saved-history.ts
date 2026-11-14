import { openDB, type IDBPDatabase } from 'idb';

/** The browser database an earlier release left behind, and raw reads of the current one. */
export const profile = { id: 'returning-person', displayName: 'Returning person', preferences: {}, notificationSettings: {} };
export const session = { id: 'saved-session', token: 'saved-token', deviceId: 'browser-device', profile,
  createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', syncedAt: null };
export const ids = ['saved-one', 'saved-two', 'saved-three'];
export const monitoringAlert = (id: string, createdAt = '2026-10-01T00:00:00Z') => ({
  id, monitoring: true, streamId: 'camera', severity: 'low', message: id, createdAt, acknowledged: false,
});
export const engineOld = { id: 'engine-old', monitoring: false, streamId: 'local', severity: 'low',
  message: 'Engine history', createdAt: '2026-10-01T00:00:00Z', acknowledged: false };

/** A version 4 connection, as a tab of the previous release holds it. Close it to let an upgrade run. */
export async function oldTab(options: { sessions?: object[]; alerts?: object[] } = {}): Promise<IDBPDatabase> {
  const db = await openDB('safeos-guardian', 4, { upgrade(database) {
    database.createObjectStore('local_session', { keyPath: 'id' });
    const alerts = database.createObjectStore('alert_cache', { keyPath: 'id' });
    alerts.createIndex('by-stream', 'streamId');
    alerts.createIndex('by-created', 'createdAt');
  } });
  for (const row of options.sessions ?? [session]) await db.put('local_session', row);
  for (const alert of options.alerts ?? [...ids.map((id) => monitoringAlert(id)), engineOld]) await db.put('alert_cache', alert);
  return db;
}

/** Every record of one store, read through a connection of its own. */
export async function stored(store: string): Promise<any[]> {
  const db = await openDB('safeos-guardian');
  try { return await db.getAll(store); } finally { db.close(); }
}

export async function storedVersion(): Promise<number> {
  const db = await openDB('safeos-guardian');
  try { return db.version; } finally { db.close(); }
}

/** The stored clear generation, or undefined when this database has no such store. */
export async function clearGeneration(): Promise<string | undefined> {
  const db = await openDB('safeos-guardian');
  try {
    return db.objectStoreNames.contains('clear_generation') ? await db.get('clear_generation', 'current') : undefined;
  } finally { db.close(); }
}

/** The session fields as the auth store keeps them in local storage. */
export function holdToken(sessionToken: string): void {
  localStorage.setItem('safeos-auth', JSON.stringify({
    state: { sessionToken, sessionId: `${sessionToken}-session`, deviceId: 'browser-device', isGuest: true }, version: 0,
  }));
}

export const heldToken = (): string | null => JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state?.sessionToken ?? null;

export const API = 'https://monitor.example.test';
export const checked = { id: 'checked-person', displayName: 'Checked person' };
type Answer = { ok: boolean; status: number; json?: () => Promise<unknown> };

/** An OK answer to a session request, carrying the token it names. */
export function sessionAnswer(token: string, person: object = checked, sessionId = `${token}-session`): Answer {
  return { ok: true, status: 200, json: async () => ({ data: {
    sessionId, token, isGuest: true, expiresAt: '2099-01-01T00:00:00Z', profile: person,
  } }) };
}

/**
 * A configured monitoring server. Only the session routes answer; every other request fails as an
 * unreachable server does. `check` answers the GET that asks about a token, `create` the POST,
 * `profile` the PATCH of the profile, `end` the DELETE that ends a session.
 */
export function server(routes: {
  check?: (token: string) => Answer | Promise<Answer>;
  create?: () => Answer | Promise<Answer>;
  profile?: () => Answer | Promise<Answer>;
  end?: () => Answer | Promise<Answer>;
} = {}) {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: API, wsUrl: 'wss://monitor.example.test/ws' }));
  const calls: Array<{ url: string; method: string; token?: string; body?: string }> = [];
  global.fetch = jest.fn(async (input: unknown, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    const token = init.headers?.['X-Session-Token'];
    calls.push({ url, method, token, body: init.body });
    if (url === `${API}/api/auth/session` && method === 'GET') return (routes.check ?? ((asked: string) => sessionAnswer(asked)))(token || '');
    if (url === `${API}/api/auth/session` && method === 'POST' && routes.create) return routes.create();
    if (url === `${API}/api/auth/profile` && method === 'PATCH' && routes.profile) return routes.profile();
    if (url === `${API}/api/auth/session` && method === 'DELETE' && routes.end) return routes.end();
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  const sent = (method: string, path = '/api/auth/session') => calls.filter((call) => call.method === method && call.url === `${API}${path}`);
  return { calls, checks: () => sent('GET'), posts: () => sent('POST'), sent };
}

export const unreachable = (): never => { throw new TypeError('Failed to fetch'); };
export const refused: Answer = { ok: false, status: 401 };
