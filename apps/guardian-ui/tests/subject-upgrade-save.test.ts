/** @jest-environment jsdom */
/**
 * Saving a subject's rebuilt fingerprint
 *
 * The Monitor page rebuilds a subject saved by an earlier version from its
 * photos, which takes a while, and then saves the rebuilt fingerprint. What
 * happened to the saved subject meanwhile must stand.
 */
import { IDBFactory } from 'fake-indexeddb';
import type { SubjectProfileDB } from '@/lib/client-db';
import type { VisualFingerprint } from '@/lib/visual-fingerprint';

require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
});

const fingerprint = (name: string, version?: number): VisualFingerprint => ({
  id: 'max',
  name,
  colorHistogram: [{ color: { r: 200, g: 30, b: 30 }, count: 1024, percentage: 100 }],
  dominantColors: [{ r: 200, g: 30, b: 30 }],
  averageColor: { r: 200, g: 30, b: 30 },
  colorVariance: 0,
  estimatedSizeRatio: 0.5,
  edgeSignature: new Array(64).fill(0),
  referenceImages: ['photo-1'],
  createdAt: 'then',
  version,
});

// The subject as the rebuild found it: saved by version 1.
const snapshot: SubjectProfileDB = {
  id: 'max',
  name: 'Max',
  type: 'pet',
  description: '',
  fingerprint: fingerprint('saved before'),
  referenceImages: ['photo-1'],
  createdAt: 'then',
  lastActiveAt: null,
  matchCount: 3,
};
const rebuilt = fingerprint('rebuilt', 2);

it('does not bring back a subject deleted while its fingerprint was rebuilt', async () => {
  const db = await import('@/lib/client-db');
  await db.saveSubjectProfile(snapshot);

  await db.deleteSubjectProfile('max');
  await db.saveUpgradedSubjectFingerprint(snapshot, rebuilt);

  expect(await db.getSubjectProfile('max')).toBeNull();
});

it('keeps the photos, matches and activity saved while the fingerprint was rebuilt', async () => {
  const db = await import('@/lib/client-db');
  await db.saveSubjectProfile(snapshot);
  const meanwhile = { ...snapshot, referenceImages: ['photo-1', 'photo-2'], matchCount: 5, lastActiveAt: 'now' };
  await db.saveSubjectProfile(meanwhile);

  await db.saveUpgradedSubjectFingerprint(snapshot, rebuilt);

  expect(await db.getSubjectProfile('max')).toEqual({ ...meanwhile, fingerprint: rebuilt });
});

it('keeps a fingerprint made in the current form while the rebuild ran', async () => {
  const db = await import('@/lib/client-db');
  // A photo added on the subject's page rebuilds and saves the fingerprint too.
  const added = { ...snapshot, referenceImages: ['photo-1', 'photo-2'], fingerprint: fingerprint('photo added', 2) };
  await db.saveSubjectProfile(added);

  await db.saveUpgradedSubjectFingerprint(snapshot, rebuilt);

  expect(await db.getSubjectProfile('max')).toEqual(added);
});
