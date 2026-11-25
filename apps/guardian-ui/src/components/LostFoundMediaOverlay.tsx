/**
 * Lost & Found Media Overlay
 *
 * Full-screen overlay that shows the pet's photos when a Lost & Found alert
 * sounds. It names the pet's colours, as the alert list does: no score and no
 * claim that the pet was found.
 * Integrates with CustomMediaPlayer for audio, TTS, and image cycling.
 *
 * @module components/LostFoundMediaOverlay
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { IconX, IconVolume2, IconVolumeX, IconPause, IconPlay, IconSkipForward, IconAlertCircle } from './icons';
import {
  CustomMediaPlayer,
  getMediaPlayer,
  resetMediaPlayer,
  type UploadedImage,
  type PlaybackState,
  type CustomMediaConfig
} from '@/lib/custom-media-player';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { sightingLines, sightingQuestion } from '@/lib/lost-found-words';

// =============================================================================
// Types
// =============================================================================

export interface LostFoundMediaOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Callback when overlay is closed */
  onClose: () => void;
  /** Subject name for display */
  subjectName: string;
  /** Images to display (from referenceImages or custom) */
  images: string[];
  /** Optional custom audio files (base64) */
  audioFiles?: Array<{ data: string; name: string; mimeType: string }>;
}

/** The keys Tab reaches while the pictures show. */
const STOPS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// =============================================================================
// Component
// =============================================================================

export function LostFoundMediaOverlay({
  isOpen,
  onClose,
  subjectName,
  images,
  audioFiles = [],
}: LostFoundMediaOverlayProps) {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const playerRef = useRef<CustomMediaPlayer | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Get settings from store
  const settings = useLostFoundStore((state) => state.settings);

  // Convert string images to UploadedImage format
  const uploadedImages: UploadedImage[] = images.map((data, index) => ({
    id: `img-${index}`,
    name: `${subjectName} - Image ${index + 1}`,
    data,
    mimeType: 'image/jpeg',
    uploadedAt: Date.now(),
  }));

  // Initialize media player
  useEffect(() => {
    if (!isOpen || uploadedImages.length === 0) return;

    // Reset any existing player
    resetMediaPlayer();

    const config: Partial<CustomMediaConfig> = {
      images: uploadedImages,
      audioFiles: audioFiles.map((audio, index) => ({
        id: `audio-${index}`,
        name: audio.name,
        data: audio.data,
        mimeType: audio.mimeType,
        uploadedAt: Date.now(),
      })),
      playbackMode: settings.customMediaPlaybackMode,
      repeatCount: settings.customMediaRepeatCount,
      timerDurationMs: settings.customMediaTimerMs,
      displayIntervalMs: settings.customMediaImageIntervalMs,
      shuffleOrder: false,
      ttsMessages: settings.customMediaTTSEnabled ? settings.customMediaTTSMessages : [],
      ttsEnabled: settings.customMediaTTSEnabled,
      audioEnabled: audioFiles.length > 0,
      imageEnabled: true,
    };

    const player = getMediaPlayer(config, {
      onImageChange: (image, index) => {
        if (image) {
          setCurrentImage(image.data);
          setCurrentImageIndex(index);
        }
      },
      onPlaybackEnd: (reason) => {
        if (reason !== 'manual') {
          // Auto-close after playback completes (count or timer reached)
          setTimeout(() => onClose(), 500);
        }
      },
      onError: (error) => {
        console.error('[LostFoundMediaOverlay] Playback error:', error);
      },
    });

    playerRef.current = player;

    // Start playback
    player.start();

    // Set initial image
    if (uploadedImages.length > 0) {
      setCurrentImage(uploadedImages[0].data);
    }

    // Update state periodically
    const stateInterval = setInterval(() => {
      if (playerRef.current) {
        setPlaybackState(playerRef.current.getState());
      }
    }, 100);

    return () => {
      clearInterval(stateInterval);
      if (playerRef.current) {
        playerRef.current.stop('manual');
        resetMediaPlayer();
        playerRef.current = null;
      }
    };
  }, [isOpen, images.length]);

  // Handle close
  const handleClose = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop('manual');
      resetMediaPlayer();
      playerRef.current = null;
    }
    onClose();
  }, [onClose]);

  // Handle pause/resume
  const handlePauseToggle = useCallback(() => {
    if (!playerRef.current) return;

    if (isPaused) {
      playerRef.current.resume();
      setIsPaused(false);
    } else {
      playerRef.current.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  // Handle skip to next image
  const handleSkipImage = useCallback(() => {
    if (uploadedImages.length <= 1) return;

    const nextIndex = (currentImageIndex + 1) % uploadedImages.length;
    setCurrentImage(uploadedImages[nextIndex].data);
    setCurrentImageIndex(nextIndex);
  }, [currentImageIndex, uploadedImages]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    setIsMuted(!isMuted);
    // Note: Actual muting would require modifying Howl volume
    // For now this is visual only - full implementation would need
    // player.setVolume(isMuted ? 1 : 0)
  }, [isMuted]);

  // The pictures take focus when they open and give it back when they close. No key of theirs takes
  // it, so a press meant for the watch closes nothing.
  useEffect(() => {
    const dialog = panel.current;
    if (!isOpen || !dialog) return;
    const before = document.activeElement;
    dialog.focus();
    return () => {
      const here = document.activeElement;
      const held = !here || here === document.body || dialog.contains(here);
      if (held && before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, [isOpen]);

  // Handle escape key, and keep Tab on the pictures' own keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Tab' && panel.current) {
        const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(STOPS));
        const [first, last] = [stops[0], stops[stops.length - 1]];
        const here = document.activeElement;
        const inside = panel.current.contains(here) && here !== panel.current;
        if (e.shiftKey ? !inside || here === first : !inside || here === last) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      } else if (e.key === ' ') {
        // A key that holds focus takes the press itself.
        if (e.target instanceof Element && panel.current?.contains(e.target) && e.target.closest('button')) return;
        e.preventDefault();
        handlePauseToggle();
      } else if (e.key === 'ArrowRight') {
        handleSkipImage();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose, handlePauseToggle, handleSkipImage]);

  if (!isOpen) return null;

  // Format remaining time
  const formatTime = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="lost-found-media fixed inset-0 z-[9999] flex flex-col overflow-y-auto outline-none"
      role="alertdialog"
      aria-modal="true"
      aria-label={sightingQuestion(subjectName)}
    >
      {/* Header */}
      <div className="relative z-10 shrink-0 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconAlertCircle size={32} className="shrink-0 text-red-500 animate-pulse" />
            <div>
              <h2 className="title font-bold" data-lead>
                {sightingQuestion(subjectName)}
              </h2>
              <p className="quiet">
                {sightingLines(subjectName)[0]}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="control p-2 rounded-full shrink-0 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close alert"
          >
            <IconX size={24} />
          </button>
        </div>
      </div>

      {/* Main Image Display */}
      <div className="min-h-24 flex-1 flex items-center justify-center p-4">
        {currentImage ? (
          <img
            src={currentImage}
            alt={`${subjectName} - Image ${currentImageIndex + 1} of ${uploadedImages.length}`}
            className="max-w-full max-h-full object-contain rounded-lg animate-fade-in"
          />
        ) : (
          <div className="quiet">No images available</div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="relative z-10 shrink-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Image indicators */}
          {uploadedImages.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCurrentImage(uploadedImages[index].data);
                    setCurrentImageIndex(index);
                  }}
                  className={`w-3 h-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                    index === currentImageIndex
                      ? 'bg-white'
                      : 'bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`View image ${index + 1}`}
                  aria-current={index === currentImageIndex ? 'true' : undefined}
                >
                  <span className={`w-3 h-3 rounded-full ${
                    index === currentImageIndex ? 'bg-white' : 'bg-white/40'
                  }`} />
                </button>
              ))}
            </div>
          )}

          {/* Playback info */}
          <div className="flex-1 text-center">
            {playbackState && (
              <div className="quiet">
                {settings.customMediaPlaybackMode === 'count' && (
                  <>Cycle {playbackState.completedCycles + 1} of {settings.customMediaRepeatCount}</>
                )}
                {settings.customMediaPlaybackMode === 'timer' && (
                  <>Remaining: {formatTime(playbackState.remainingMs)}</>
                )}
                {settings.customMediaPlaybackMode === 'loop' && (
                  <>Looping - Cycle {playbackState.completedCycles + 1}</>
                )}
              </div>
            )}
          </div>

          {/* Control buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleMuteToggle}
              className="control p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
            >
              {isMuted ? (
                <IconVolumeX size={20} />
              ) : (
                <IconVolume2 size={20} />
              )}
            </button>

            <button
              onClick={handlePauseToggle}
              className="control p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={isPaused ? 'Resume' : 'Pause'}
              aria-pressed={isPaused}
            >
              {isPaused ? (
                <IconPlay size={20} />
              ) : (
                <IconPause size={20} />
              )}
            </button>

            {uploadedImages.length > 1 && (
              <button
                onClick={handleSkipImage}
                className="control p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Next image"
              >
                <IconSkipForward size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="quiet mt-3 text-center">
          Press <kbd className="px-1 py-0.5 rounded">Space</kbd> to pause,
          <kbd className="px-1 py-0.5 rounded ml-1">→</kbd> for next image,
          <kbd className="px-1 py-0.5 rounded ml-1">Esc</kbd> to close
        </div>
      </div>

      {/* Pulsing border effect */}
      <div className="absolute inset-0 pointer-events-none border-4 border-red-500/50 animate-pulse" />

      <style jsx>{`
        /* The watch's page is a grid that starts its parts at their top: this one fills the window. */
        .lost-found-media {
          align-self: stretch;
          background: #000;
          color: #f4f5f6;
          font-size: max(18px, 1.125rem);
          line-height: 1.4;
        }
        .title {
          font-size: max(20px, 1.375rem);
        }
        .quiet {
          color: #d4d4d4;
        }
        .control,
        kbd {
          background: #202020;
        }
        .control:hover {
          background: #383838;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default LostFoundMediaOverlay;
