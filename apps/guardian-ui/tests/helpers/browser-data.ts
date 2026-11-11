import 'fake-indexeddb/auto';
import { serialize, deserialize } from 'v8';
import { DEFAULT_CUSTOM_SOUND, saveCustomSound } from '@/lib/custom-sounds-db';

// jsdom does not expose Node's structuredClone. Clone at the IndexedDB edge.
Object.assign(globalThis, { structuredClone: (value: unknown) => deserialize(serialize(value)) });

export async function recordSound() {
  await saveCustomSound({
    ...DEFAULT_CUSTOM_SOUND, id: 'recording-1', name: 'Recorded reminder',
    audioBlob: new Blob(['recorded audio']), mimeType: 'audio/webm',
    durationSeconds: 1, fileSizeBytes: 14, source: 'recording',
    uploadedAt: new Date().toISOString(),
  });
}

export function fakeCaches() {
  const names = new Set(['safeos-v2']);
  Object.defineProperty(window, 'caches', { configurable: true, value: {
    keys: async () => [...names],
    delete: async (name: string) => names.delete(name),
  } });
  return names;
}
