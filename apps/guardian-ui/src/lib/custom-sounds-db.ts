/**
 * Custom Sounds Database
 *
 * IndexedDB storage for user-uploaded and recorded custom alert sounds.
 * Supports audio file uploads and microphone recordings.
 *
 * @module lib/custom-sounds-db
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Trigger events that can play custom sounds
 */
export type SoundTrigger =
  | 'person_detected'      // AI detected a person
  | 'pet_detected'         // AI detected an animal
  | 'object_found'         // Lost & Found match detected
  | 'motion_detected'      // Motion triggered
  | 'audio_detected'       // Audio threshold exceeded
  | 'sound_detected'       // Audio event detected (alias)
  | 'video_activity'       // Video/camera activity detected
  | 'inactivity_alert'     // No movement for specified time
  | 'idle_timeout'         // Idle timeout (alias)
  | 'emergency'            // Emergency mode activated
  | 'system_event'         // System event notification
  | 'custom';              // User-defined trigger

/**
 * Custom sound configuration stored in IndexedDB
 */
export interface CustomSound {
  id: string;
  name: string;
  description: string;

  // Audio data
  audioBlob: Blob;
  audioUrl?: string;        // Object URL for playback (generated at runtime)
  mimeType: string;
  durationSeconds: number;
  fileSizeBytes: number;

  // Source metadata
  source: 'upload' | 'recording';
  recordedAt?: string;      // ISO date if recorded
  uploadedAt: string;       // ISO date

  // Playback settings
  volume: number;           // 0-100
  loop: boolean;            // Continuous loop
  repeatCount: number;      // 0 = don't repeat, 1+ = repeat X times
  repeatDelayMs: number;    // Delay between repeats (default 1000ms)
  fadeInMs: number;         // Fade in duration
  fadeOutMs: number;        // Fade out duration

  // Trigger configuration
  triggers: SoundTrigger[]; // Which events trigger this sound
  priority: number;         // Higher = plays over lower priority (1-10)
  enabled: boolean;         // Is this sound active

  // Usage stats
  playCount: number;
  lastPlayedAt?: string;
}

/**
 * Default values for new custom sounds
 */
export const DEFAULT_CUSTOM_SOUND: Omit<CustomSound, 'id' | 'name' | 'audioBlob' | 'mimeType' | 'durationSeconds' | 'fileSizeBytes' | 'source' | 'uploadedAt'> = {
  description: '',
  volume: 80,
  loop: false,
  repeatCount: 0,
  repeatDelayMs: 1000,
  fadeInMs: 0,
  fadeOutMs: 200,
  triggers: [],
  priority: 5,
  enabled: true,
  playCount: 0,
};

// =============================================================================
// IndexedDB Setup
// =============================================================================

const DB_NAME = 'safeos-custom-sounds';
const DB_VERSION = 1;
const STORE_NAME = 'sounds';

let dbInstance: IDBDatabase | null = null;

/**
 * Open or create the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create sounds store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('enabled', 'enabled', { unique: false });
        store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
      }
    };
  });
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Save a custom sound to IndexedDB
 */
export async function saveCustomSound(sound: CustomSound): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(sound);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to save sound: ${request.error?.message}`));
  });
}

/**
 * Get a custom sound by ID
 */
export async function getCustomSound(id: string): Promise<CustomSound | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error(`Failed to get sound: ${request.error?.message}`));
  });
}

/**
 * Get all custom sounds
 */
export async function getAllCustomSounds(): Promise<CustomSound[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error(`Failed to get sounds: ${request.error?.message}`));
  });
}

/**
 * Get custom sounds by trigger type
 */
export async function getCustomSoundsByTrigger(trigger: SoundTrigger): Promise<CustomSound[]> {
  const allSounds = await getAllCustomSounds();
  return allSounds.filter(s => s.enabled && s.triggers.includes(trigger));
}

/**
 * Delete a custom sound
 */
export async function deleteCustomSound(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete sound: ${request.error?.message}`));
  });
}

/**
 * Update play statistics for a sound
 */
export async function recordSoundPlay(id: string): Promise<void> {
  const sound = await getCustomSound(id);
  if (!sound) return;

  sound.playCount += 1;
  sound.lastPlayedAt = new Date().toISOString();
  await saveCustomSound(sound);
}

// =============================================================================
// Audio File Processing
// =============================================================================

/**
 * Create a custom sound from an uploaded file
 */
export async function createSoundFromFile(
  file: File,
  name: string,
  options: Partial<Omit<CustomSound, 'id' | 'name' | 'audioBlob' | 'mimeType' | 'durationSeconds' | 'fileSizeBytes' | 'source' | 'uploadedAt'>> = {}
): Promise<CustomSound> {
  // Validate file type
  const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a'];
  if (!validTypes.some(t => file.type.includes(t.split('/')[1]))) {
    throw new Error(`Invalid audio file type: ${file.type}. Supported: MP3, WAV, OGG, WebM, M4A`);
  }

  // Get audio duration
  const duration = await getAudioDuration(file);

  const sound: CustomSound = {
    id: `sound-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    audioBlob: file,
    mimeType: file.type,
    durationSeconds: duration,
    fileSizeBytes: file.size,
    source: 'upload',
    uploadedAt: new Date().toISOString(),
    ...DEFAULT_CUSTOM_SOUND,
    ...options,
  };

  await saveCustomSound(sound);
  return sound;
}

/**
 * Create a custom sound from a recorded audio blob
 */
export async function createSoundFromRecording(
  audioBlob: Blob,
  name: string,
  options: Partial<Omit<CustomSound, 'id' | 'name' | 'audioBlob' | 'mimeType' | 'durationSeconds' | 'fileSizeBytes' | 'source' | 'uploadedAt'>> = {}
): Promise<CustomSound> {
  const duration = await getAudioDuration(audioBlob);

  const sound: CustomSound = {
    id: `sound-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    audioBlob,
    mimeType: audioBlob.type || 'audio/webm',
    durationSeconds: duration,
    fileSizeBytes: audioBlob.size,
    source: 'recording',
    recordedAt: new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    ...DEFAULT_CUSTOM_SOUND,
    ...options,
  };

  await saveCustomSound(sound);
  return sound;
}

/**
 * Get audio duration from a blob or file
 */
async function getAudioDuration(blob: Blob | File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);

    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio metadata'));
    });

    audio.src = url;
  });
}

// =============================================================================
// Trigger Descriptions (for UI)
// =============================================================================

export const TRIGGER_DESCRIPTIONS: Record<SoundTrigger, { label: string; description: string; icon: string }> = {
  person_detected: {
    label: 'Person Detected',
    description: 'Play when AI detects a human in the camera view',
    icon: 'user',
  },
  pet_detected: {
    label: 'Pet Detected',
    description: 'Play when your pet is seen on camera (call them home!)',
    icon: 'paw-print',
  },
  object_found: {
    label: 'Lost Item Found',
    description: 'Play when a Lost & Found subject match is detected',
    icon: 'search',
  },
  motion_detected: {
    label: 'Motion Detected',
    description: 'Play when motion exceeds the sensitivity threshold',
    icon: 'activity',
  },
  audio_detected: {
    label: 'Audio Detected',
    description: 'Play when sound levels exceed the threshold',
    icon: 'volume-2',
  },
  sound_detected: {
    label: 'Sound Detected',
    description: 'Play when audio events are detected',
    icon: 'volume-2',
  },
  video_activity: {
    label: 'Video Activity',
    description: 'Play when video/camera activity is detected',
    icon: 'video',
  },
  inactivity_alert: {
    label: 'Inactivity Alert',
    description: 'Play when no movement is detected for the specified time',
    icon: 'clock',
  },
  idle_timeout: {
    label: 'Idle Timeout',
    description: 'Play when the system has been idle for too long',
    icon: 'clock',
  },
  system_event: {
    label: 'System Event',
    description: 'Play for system notifications and events',
    icon: 'settings',
  },
  emergency: {
    label: 'Emergency',
    description: 'Play when emergency mode is activated',
    icon: 'alert-triangle',
  },
  custom: {
    label: 'Custom Trigger',
    description: 'Manually triggered or API-triggered sound',
    icon: 'settings',
  },
};

// Note: CustomSound is already exported from interface definition above

/** Remove uploaded and recorded audio, waiting for the transaction to commit. */
export async function clearCustomSounds(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear recordings'));
    transaction.onabort = () => reject(transaction.error || new Error('Recording deletion aborted'));
    transaction.objectStore(STORE_NAME).clear();
  });
}
