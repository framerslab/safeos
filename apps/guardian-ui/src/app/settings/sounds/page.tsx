/**
 * Custom Sounds Settings Page
 *
 * Manage custom alert sounds with upload, recording, and playback configuration.
 *
 * FEATURES:
 * - Upload audio files (MP3, WAV, OGG, WebM, M4A)
 * - Record from microphone (voice messages, custom alerts)
 * - Configure volume, looping, repeat count per sound
 * - Assign sounds to specific triggers (person detected, pet detected, etc.)
 * - Preview and test sounds before saving
 *
 * USE CASES:
 * 1. Pet Recall: Record "Come home Buddy!" to play when your dog is detected
 * 2. Intruder Alert: Upload a siren sound for person detection at night
 * 3. Baby Monitor: Record a lullaby that plays on inactivity
 * 4. Lost & Found: Custom sound when a missing pet/item is spotted
 *
 * @module app/settings/sounds/page
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SoundUploader } from '@/components/SoundUploader';
import { BackButton } from '@/components/BackButton';
import { IconChevronLeft } from '@/components/icons';
import {
  getAllCustomSounds,
  deleteCustomSound,
  saveCustomSound,
  TRIGGER_DESCRIPTIONS,
  type CustomSound,
  type SoundTrigger,
} from '@/lib/custom-sounds-db';

// =============================================================================
// Icons
// =============================================================================

const soundCardIcons = {
  play: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  stop: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  ),
  microphone: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  file: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  loop: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  volume: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ),
  clock: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  chart: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  circle: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
};

// =============================================================================
// Page Component
// =============================================================================

export default function SoundsSettingsPage() {
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [editingSound, setEditingSound] = useState<CustomSound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load sounds on mount
  useEffect(() => {
    loadSounds();
  }, []);

  const loadSounds = async () => {
    setIsLoading(true);
    try {
      const allSounds = await getAllCustomSounds();
      setSounds(allSounds.sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      ));
    } catch (err) {
      console.error('Failed to load sounds:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sound created
  const handleSoundCreated = useCallback((sound: CustomSound) => {
    setSounds(prev => [sound, ...prev]);
    setShowUploader(false);
  }, []);

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this sound? This cannot be undone.')) return;

    try {
      await deleteCustomSound(id);
      setSounds(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete sound:', err);
    }
  }, []);

  // Handle toggle enabled
  const handleToggleEnabled = useCallback(async (sound: CustomSound) => {
    const updated = { ...sound, enabled: !sound.enabled };
    await saveCustomSound(updated);
    setSounds(prev => prev.map(s => s.id === sound.id ? updated : s));
  }, []);

  // Play preview
  const playPreview = useCallback((sound: CustomSound) => {
    // Stop current if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    // Create URL from blob
    const url = URL.createObjectURL(sound.audioBlob);
    const audio = new Audio(url);
    audio.volume = sound.volume / 100;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      setPlayingId(null);
      audioRef.current = null;
    };

    audio.play();
    audioRef.current = audio;
    setPlayingId(sound.id);
  }, [playingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <BackButton
            fallbackHref="/settings"
            ariaLabel="Back to settings"
            className="mb-4 px-3 justify-start bg-slate-800/50 hover:bg-slate-700/60 text-slate-400 hover:text-white"
          >
            <IconChevronLeft size={18} aria-hidden="true" />
            <span className="text-sm font-medium">Back to Settings</span>
          </BackButton>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            Custom Sounds
          </h1>
          <p className="text-slate-400 mt-2">
            Upload or record custom sounds to play when specific events are detected.
          </p>
        </div>

        {/* Usage Guide */}
        <section className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            How Custom Sounds Work
          </h2>
          <div className="text-sm text-slate-300 space-y-2">
            <p>
              Custom sounds replace or supplement the default alert tones. Each sound can be
              triggered by specific detection events.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <span className="font-medium text-emerald-400 flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="4" r="2" />
                    <circle cx="18" cy="8" r="2" />
                    <circle cx="20" cy="16" r="2" />
                    <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                  </svg>
                  Pet Recall
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Record &quot;Come home Buddy!&quot; to play when your dog is detected outdoors
                </p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <span className="font-medium text-red-400 flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                  Intruder Alert
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Upload a loud siren for nighttime person detection
                </p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <span className="font-medium text-purple-400 flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                  Baby Monitor
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Play a lullaby when baby is detected but no movement for 5 min
                </p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <span className="font-medium text-amber-400 flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Lost &amp; Found
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Special alert when a missing pet or item is spotted
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Add Sound Button */}
        {!showUploader && !editingSound && (
          <button
            onClick={() => setShowUploader(true)}
            className="w-full py-4 mb-6 bg-slate-800/50 border-2 border-dashed border-slate-600
                       rounded-xl text-slate-400 hover:text-white hover:border-emerald-500/50
                       transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="font-medium">Add Custom Sound</span>
          </button>
        )}

        {/* Sound Uploader */}
        {showUploader && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Add New Sound</h2>
              <button
                onClick={() => setShowUploader(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕ Cancel
              </button>
            </div>
            <SoundUploader
              onSoundCreated={handleSoundCreated}
              onError={(err) => console.error(err)}
            />
          </div>
        )}

        {/* Sound List */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Your Sounds
            <span className="text-sm font-normal text-slate-500">({sounds.length})</span>
          </h2>

          {isLoading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="w-10 h-10 mx-auto mb-2 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" aria-hidden="true" />
              Loading sounds...
            </div>
          ) : sounds.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <div className="mb-3 flex justify-center">
                <svg className="w-10 h-10 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="22" y1="9" x2="16" y2="15" />
                  <line x1="16" y1="9" x2="22" y2="15" />
                </svg>
              </div>
              <p className="text-slate-400">No custom sounds yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Click &quot;Add Custom Sound&quot; to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sounds.map((sound) => (
                <SoundCard
                  key={sound.id}
                  sound={sound}
                  isPlaying={playingId === sound.id}
                  onPlay={() => playPreview(sound)}
                  onToggleEnabled={() => handleToggleEnabled(sound)}
                  onEdit={() => setEditingSound(sound)}
                  onDelete={() => handleDelete(sound.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Edit Modal */}
        {editingSound && (
          <EditSoundModal
            sound={editingSound}
            onSave={async (updated) => {
              await saveCustomSound(updated);
              setSounds(prev => prev.map(s => s.id === updated.id ? updated : s));
              setEditingSound(null);
            }}
            onClose={() => setEditingSound(null)}
          />
        )}
      </div>
    </main>
  );
}

// =============================================================================
// Sound Card Component
// =============================================================================

interface SoundCardProps {
  sound: CustomSound;
  isPlaying: boolean;
  onPlay: () => void;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SoundCard({
  sound,
  isPlaying,
  onPlay,
  onToggleEnabled,
  onEdit,
  onDelete,
}: SoundCardProps) {
  return (
    <div className={`p-4 bg-slate-800/50 border rounded-xl transition-colors ${
      sound.enabled
        ? 'border-slate-700/50'
        : 'border-slate-700/30 opacity-60'
    }`}>
      <div className="flex items-start gap-4">
        {/* Play Button */}
        <button
          onClick={onPlay}
          className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
            isPlaying
              ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
          aria-label={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? soundCardIcons.stop : soundCardIcons.play}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium truncate">{sound.name}</h3>
            <span className="text-xs text-slate-500">
              {sound.source === 'recording' ? soundCardIcons.microphone : soundCardIcons.file}
            </span>
            {sound.loop && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
                {soundCardIcons.loop} Loop
              </span>
            )}
            {sound.repeatCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                ×{sound.repeatCount + 1}
              </span>
            )}
          </div>

          {sound.description && (
            <p className="text-sm text-slate-500 truncate mt-0.5">{sound.description}</p>
          )}

          {/* Triggers */}
          <div className="flex flex-wrap gap-1 mt-2">
            {sound.triggers.map((trigger) => (
              <span
                key={trigger}
                className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded"
              >
                {TRIGGER_DESCRIPTIONS[trigger].icon} {TRIGGER_DESCRIPTIONS[trigger].label}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">{soundCardIcons.volume} {sound.volume}%</span>
            <span className="flex items-center gap-1">{soundCardIcons.clock} {formatDuration(sound.durationSeconds)}</span>
            <span className="flex items-center gap-1">{soundCardIcons.chart} Played {sound.playCount}x</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleEnabled}
            className={`p-2 rounded-lg transition-colors ${
              sound.enabled
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-slate-700 text-slate-500'
            }`}
            aria-label={sound.enabled ? 'Disable' : 'Enable'}
          >
            {sound.enabled ? soundCardIcons.check : soundCardIcons.circle}
          </button>
          <button
            onClick={onEdit}
            className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            aria-label="Edit"
          >
            {soundCardIcons.edit}
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
            aria-label="Delete"
          >
            {soundCardIcons.trash}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Edit Modal Component
// =============================================================================

interface EditSoundModalProps {
  sound: CustomSound;
  onSave: (sound: CustomSound) => Promise<void>;
  onClose: () => void;
}

function EditSoundModal({ sound, onSave, onClose }: EditSoundModalProps) {
  const [name, setName] = useState(sound.name);
  const [description, setDescription] = useState(sound.description);
  const [volume, setVolume] = useState(sound.volume);
  const [loop, setLoop] = useState(sound.loop);
  const [repeatCount, setRepeatCount] = useState(sound.repeatCount);
  const [repeatDelayMs, setRepeatDelayMs] = useState(sound.repeatDelayMs);
  const [triggers, setTriggers] = useState<SoundTrigger[]>(sound.triggers);
  const [priority, setPriority] = useState(sound.priority);
  const [isSaving, setIsSaving] = useState(false);

  const toggleTrigger = (trigger: SoundTrigger) => {
    setTriggers(prev =>
      prev.includes(trigger)
        ? prev.filter(t => t !== trigger)
        : [...prev, trigger]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...sound,
        name,
        description,
        volume,
        loop,
        repeatCount,
        repeatDelayMs,
        triggers,
        priority,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Edit Sound</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                         text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                         text-white focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Volume */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <label className="text-slate-400">Volume</label>
              <span className="text-emerald-400 font-mono">{volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500
                         [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Loop & Repeat */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => {
                  setLoop(e.target.checked);
                  if (e.target.checked) setRepeatCount(0);
                }}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
              />
              <span className="text-sm text-slate-400">Loop continuously</span>
            </label>

            {!loop && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">Repeat</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-slate-900/50 border border-slate-600 rounded-lg
                             text-white text-center focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-slate-500">×</span>
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <label className="text-slate-400">Priority</label>
              <span className="text-blue-400 font-mono">{priority}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500
                         [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Triggers */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Triggers</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(TRIGGER_DESCRIPTIONS) as [SoundTrigger, typeof TRIGGER_DESCRIPTIONS[SoundTrigger]][]).map(
                ([trigger, info]) => (
                  <button
                    key={trigger}
                    onClick={() => toggleTrigger(trigger)}
                    className={`p-2 rounded-lg text-left transition-colors text-sm ${
                      triggers.includes(trigger)
                        ? 'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-900/50 border border-slate-600 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span>{info.icon}</span> {info.label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg
                       font-medium hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || triggers.length === 0}
            className="flex-1 py-2 bg-emerald-500 text-white rounded-lg
                       font-medium hover:bg-emerald-600 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}
