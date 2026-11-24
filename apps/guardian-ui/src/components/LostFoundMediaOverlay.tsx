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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === ' ') {
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
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Lost and Found alert: colours like ${subjectName}’s`}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconAlertCircle size={32} className="text-red-500 animate-pulse" />
            <div>
              <h2 className="text-white text-xl font-bold">
                Lost and Found alert
              </h2>
              <p className="text-white/80 text-sm">
                {`Colours like ${subjectName}’s`}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close alert"
          >
            <IconX size={24} className="text-white" />
          </button>
        </div>
      </div>

      {/* Main Image Display */}
      <div className="flex-1 flex items-center justify-center p-4 pt-20 pb-24">
        {currentImage ? (
          <img
            src={currentImage}
            alt={`${subjectName} - Image ${currentImageIndex + 1} of ${uploadedImages.length}`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-fade-in"
            style={{ maxHeight: 'calc(100vh - 180px)' }}
          />
        ) : (
          <div className="text-white/60 text-lg">No images available</div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Image indicators */}
          {uploadedImages.length > 1 && (
            <div className="flex gap-2">
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
              <div className="text-white/60 text-sm">
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
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
            >
              {isMuted ? (
                <IconVolumeX size={20} className="text-white" />
              ) : (
                <IconVolume2 size={20} className="text-white" />
              )}
            </button>

            <button
              onClick={handlePauseToggle}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={isPaused ? 'Resume' : 'Pause'}
              aria-pressed={isPaused}
            >
              {isPaused ? (
                <IconPlay size={20} className="text-white" />
              ) : (
                <IconPause size={20} className="text-white" />
              )}
            </button>

            {uploadedImages.length > 1 && (
              <button
                onClick={handleSkipImage}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Next image"
              >
                <IconSkipForward size={20} className="text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="text-center mt-3 text-white/40 text-xs">
          Press <kbd className="px-1 py-0.5 bg-white/10 rounded">Space</kbd> to pause,
          <kbd className="px-1 py-0.5 bg-white/10 rounded ml-1">→</kbd> for next image,
          <kbd className="px-1 py-0.5 bg-white/10 rounded ml-1">Esc</kbd> to close
        </div>
      </div>

      {/* Pulsing border effect */}
      <div className="absolute inset-0 pointer-events-none border-4 border-red-500/50 animate-pulse" />

      <style jsx>{`
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
