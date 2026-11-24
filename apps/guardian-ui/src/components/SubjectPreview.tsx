/**
 * Subject Preview Component
 * 
 * Displays the active subject being watched, with the comparison's reading
 * against the alert line and the checks in a row like the pet's photos.
 * 
 * @module components/SubjectPreview
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { IconPaw, IconUser, IconSearch, IconX, IconCheck } from './icons';
import { useLostFoundStore } from '../stores/lost-found-store';
import { LINE_WORDS, checksInARow, lineState, savedSightings } from '../lib/lost-found-words';
import { addReferencePhotos, generateFingerprint } from '../lib/visual-fingerprint';
import { MAX_PET_PHOTOS } from '../lib/pet-photo-limits';
import { createThumbnailFromSource, readFileAsDataUrl } from '../lib/image-utils';
import { saveSubjectProfile, type SubjectProfileDB } from '../lib/client-db';
import { readAccountClearMarker } from '../lib/local-data-generation';
import type { MatchResult } from '../lib/subject-matcher';

// =============================================================================
// Types
// =============================================================================

interface SightingReadingProps {
  score: number;
  alertLine: number;
  full?: boolean;
}

export function SightingReading({ score, alertLine, full = false }: SightingReadingProps) {
  const state = lineState(score, alertLine);
  const over = state === 'over';
  const bar = over ? 'bg-orange-400' : 'bg-emerald-500';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
        <span className="text-[var(--color-steel-300)]">
          {full ? 'Colours and shape now' : 'Colours and shape'}
        </span>
        <span className="font-medium text-[var(--color-steel-50)]">{LINE_WORDS[state]}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 bg-[var(--color-steel-700)] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 motion-reduce:transition-none ${bar}`}
          style={{ width: `${Math.max(score, 0)}%` }}
        />
      </div>
    </div>
  );
}

interface RecentSightingsProps {
  sightings: MatchResult[];
  alertLine: number;
}

export function RecentSightings({ sightings, alertLine }: RecentSightingsProps) {
  if (sightings.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-[var(--color-steel-300)] mb-3">
        Recent possible sightings
      </h4>
      <div className="space-y-2">
        {sightings.slice(0, 5).map((sighting) => {
          const over = lineState(sighting.confidence, alertLine) === 'over';
          return (
            <div
              key={sighting.id}
              className="flex flex-wrap items-center justify-between gap-x-2 p-2 bg-[var(--color-steel-800)] rounded-lg"
            >
              <span className="text-sm text-[var(--color-steel-300)]">
                {new Date(sighting.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-sm font-medium text-[var(--color-steel-50)]">
                {over ? 'Over the line' : 'Under the line'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SubjectPreviewProps {
  /** Display mode: 'compact' for overlay, 'full' for standalone */
  mode?: 'compact' | 'full';
  /** Show close button */
  showClose?: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Click handler */
  onClick?: () => void;
  /** Photos added here were saved to the subject, as given. */
  onPhotosSaved?: (saved: SubjectProfileDB) => void;
  /**
   * The account marker the subject was read under, when the caller knows it.
   * Photos are saved only while local storage holds that marker; without it,
   * the marker read as the photos are picked counts.
   */
  savedUnder?: () => string;
  /** How many pictures this device keeps for the subject, when the caller read them. */
  savedPictures?: number;
}

// =============================================================================
// SubjectPreview Component
// =============================================================================

export function SubjectPreview({
  mode = 'compact',
  showClose = true,
  onClose,
  onClick,
  onPhotosSaved,
  savedUnder,
  savedPictures,
}: SubjectPreviewProps) {
  const {
    activeSubject,
    isWatching,
    currentConfidence,
    consecutiveMatches,
    recentMatches,
    stopWatching,
    updateSubject,
    settings,
  } = useLostFoundStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUpdatingReferences, setIsUpdatingReferences] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const alertLine = settings.minConfidenceForAlert;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pet':
        return <IconPaw size={mode === 'compact' ? 16 : 24} />;
      case 'person':
        return <IconUser size={mode === 'compact' ? 16 : 24} />;
      default:
        return <IconSearch size={mode === 'compact' ? 16 : 24} />;
    }
  };

  const onAddReferenceImages = useCallback(async (files: FileList | null) => {
    if (!activeSubject || !files) return;

    const remaining = Math.max(0, MAX_PET_PHOTOS - (activeSubject.referenceImages?.length || 0));
    if (remaining <= 0) {
      setReferenceError(`Maximum of ${MAX_PET_PHOTOS} reference images reached.`);
      return;
    }

    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remaining);

    if (imageFiles.length === 0) {
      setReferenceError('Please select image files.');
      return;
    }

    setReferenceError(null);
    setIsUpdatingReferences(true);
    // The photos are added to the subject as it is now. Once all local data is cleared, in this
    // tab or another, the subject is gone and nothing of it is saved back.
    const clearedUnder = savedUnder ? savedUnder() : readAccountClearMarker();
    const current = () => readAccountClearMarker() === clearedUnder;

    try {
      const newReferenceImages: string[] = [];

      for (const file of imageFiles) {
        const raw = await readFileAsDataUrl(file);
        const thumb = await createThumbnailFromSource(raw, {
          maxWidth: 512,
          maxHeight: 512,
          quality: 0.88,
          mimeType: 'image/jpeg',
        });
        newReferenceImages.push(thumb);
      }

      const mergedFingerprint = await addReferencePhotos(
        activeSubject.fingerprint,
        activeSubject.referenceImages,
        newReferenceImages,
        (photo) => generateFingerprint(photo, activeSubject.name)
      );
      const updatedReferenceImages = [...activeSubject.referenceImages, ...newReferenceImages].slice(0, MAX_PET_PHOTOS);
      const lastActiveAt = new Date().toISOString();
      if (!current()) return;

      updateSubject(activeSubject.id, {
        fingerprint: mergedFingerprint,
        referenceImages: updatedReferenceImages,
        lastActiveAt,
      });

      const saved: SubjectProfileDB = {
        id: activeSubject.id,
        name: activeSubject.name,
        type: activeSubject.type,
        description: activeSubject.description,
        fingerprint: mergedFingerprint,
        referenceImages: updatedReferenceImages,
        createdAt: activeSubject.createdAt,
        lastActiveAt,
        matchCount: activeSubject.matchCount,
      };
      // Another subject may be the one shown by now: the caller hears which subject was saved.
      if ((await saveSubjectProfile(saved, current)) === 'saved') onPhotosSaved?.(saved);
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : 'Failed to add reference images.');
    } finally {
      setIsUpdatingReferences(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [activeSubject, updateSubject, onPhotosSaved, savedUnder]);

  if (!activeSubject) {
    return null;
  }

  if (mode === 'compact') {
    return (
      <div
        data-lost-found-card="picture"
        className={`
          bg-[var(--color-steel-900)]/95 backdrop-blur-sm
          border border-[var(--color-steel-700)] rounded-xl
          p-3 min-w-[200px] max-w-[280px]
          ${onClick ? 'cursor-pointer hover:border-[var(--color-steel-600)]' : ''}
          transition-all
        `}
        onClick={onClick}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {/* Subject thumbnail */}
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--color-steel-800)] flex-shrink-0">
            {activeSubject.referenceImages[0] ? (
              <img
                src={activeSubject.referenceImages[0]}
                alt={activeSubject.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--color-steel-500)]">
                {getTypeIcon(activeSubject.type)}
              </div>
            )}
          </div>
          
          {/* Name and status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white truncate">
                {activeSubject.name}
              </span>
              {isWatching && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <p className="text-xs text-[var(--color-steel-400)]">
              {isWatching ? 'Watching...' : 'Paused'}
            </p>
          </div>
          
          {/* Close button */}
          {showClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                stopWatching();
                onClose?.();
              }}
              aria-label={`Close ${activeSubject.name}`}
              className="p-1 text-[var(--color-steel-400)] hover:text-white transition-colors"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        
        {/* The reading against the alert line */}
        {isWatching && (
          <div className="space-y-1">
            <SightingReading score={currentConfidence} alertLine={alertLine} />

            {/* Checks in a row like the pet's photos */}
            {consecutiveMatches > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <IconCheck size={12} className="text-emerald-400" />
                <span className="text-xs text-emerald-400">
                  {checksInARow(consecutiveMatches, activeSubject.name)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div data-lost-found-card="full" className="bg-[var(--color-steel-900)] border border-[var(--color-steel-700)] rounded-xl p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        {/* Subject image */}
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-[var(--color-steel-800)] flex-shrink-0">
          {activeSubject.referenceImages[0] ? (
            <img
              src={activeSubject.referenceImages[0]}
              alt={activeSubject.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-steel-500)]">
              {getTypeIcon(activeSubject.type)}
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-semibold text-white">
              {activeSubject.name}
            </h3>
            {isWatching && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                Active
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-sm text-[var(--color-steel-400)]">
            <span className="capitalize">{activeSubject.type}</span>
            {savedPictures !== undefined && (
              <>
                <span>•</span>
                <span>{savedSightings(savedPictures)}</span>
              </>
            )}
          </div>
          
          {activeSubject.description && (
            <p className="text-sm text-[var(--color-steel-400)] mt-2">
              {activeSubject.description}
            </p>
          )}
        </div>
        
        {/* Close button */}
        {showClose && (
          <button
            onClick={() => {
              stopWatching();
              onClose?.();
            }}
            aria-label={`Close ${activeSubject.name}`}
            className="p-2 text-[var(--color-steel-400)] hover:text-white transition-colors"
          >
            <IconX size={20} />
          </button>
        )}
      </div>
      
      {isWatching && (
        <div className="mb-6">
          <SightingReading score={currentConfidence} alertLine={alertLine} full />
        </div>
      )}

      <RecentSightings sightings={recentMatches} alertLine={alertLine} />

      {/* Reference images */}
      {activeSubject.referenceImages.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="text-sm font-medium text-[var(--color-steel-300)]">
                Reference Images
              </h4>
              <p className="text-xs text-[var(--color-steel-500)] mt-1">
                Add up to 5 photos, each cropped close.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onAddReferenceImages(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUpdatingReferences || activeSubject.referenceImages.length >= 5}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                  isUpdatingReferences || activeSubject.referenceImages.length >= 5
                    ? 'bg-[var(--color-steel-800)] text-[var(--color-steel-500)] border-[var(--color-steel-700)] cursor-not-allowed'
                    : 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30'
                }`}
              >
                {isUpdatingReferences ? 'Adding…' : 'Add Photos'}
              </button>
            </div>
          </div>

          {referenceError && (
            <div className="mb-3 text-xs text-red-400">
              {referenceError}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {activeSubject.referenceImages.map((img, i) => (
              <div
                key={i}
                className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--color-steel-800)]"
              >
                <img
                  src={img}
                  alt={`Reference ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Compact Overlay Version
// =============================================================================

/**
 * The watched pet over the camera's picture: its photo, its name and where the
 * comparison's reading sits against the alert line. It has no key of its own: on the watch, Watch for is
 * where the comparison starts and stops, so the two never disagree.
 */
export function SubjectPreviewOverlay() {
  const { activeSubject, isWatching } = useLostFoundStore();

  if (!activeSubject || !isWatching) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 z-10">
      <SubjectPreview mode="compact" showClose={false} />
    </div>
  );
}

export default SubjectPreview;
