'use client';

/**
 * Watch for: Motion and sound, or Lost and Found
 *
 * The watch's first choice, above its camera and its settings. Motion and
 * sound sounds an alert when something moves or makes a sound. Lost and Found
 * also compares what the camera sees with a saved pet's photos, by colour and
 * shape, while the watch runs. The choice is setup's own Lost & Found choice
 * (lostFoundChosen in the onboarding store), so setup and the watch show the
 * same one; the pet is kept as chosenPetId in the Lost & Found store. Both are
 * this device's.
 *
 * useWatchFor reads the saved pets from this device's database and keeps the
 * Lost & Found store's comparison in step with the watch: it compares while
 * the watch runs with Lost and Found chosen and a pet saved, and stops when
 * Motion and sound is chosen, with no restart of the camera.
 *
 * @module components/monitor/WatchFor
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { useLostFoundStore, type SubjectProfile } from '../../stores/lost-found-store';
import { readSavedPets, type SubjectProfileDB } from '../../lib/client-db';
import type { VisualFingerprint } from '../../lib/visual-fingerprint';

// =============================================================================
// Words
// =============================================================================

export type WatchWay = 'motion_sound' | 'lost_found';

const WAYS: Array<{ way: WatchWay; label: string }> = [
  { way: 'motion_sound', label: 'Motion and sound' },
  { way: 'lost_found', label: 'Lost and Found' },
];

const TITLES: Record<WatchWay, string> = {
  motion_sound: 'Motion and sound | SafeOS',
  lost_found: 'Lost and Found | SafeOS',
};

const MOTION_LINE = 'Sounds an alert on this device when something moves or makes a sound.';
const LIMITS_LINE = 'It can alert on an animal that looks alike. It works best in daylight, with a pet whose colours stand out.';
const NO_PET_LINE = 'Save a few photos of your pet to compare with what the camera sees.';
const READ_FAILED = 'Saved pets could not be read on this device. Reload the page to try again.';
/** The frame's line while Lost and Found is chosen with no pet saved. */
export const NO_PET_FRAME_LINE = 'Without a saved pet, it watches for motion and sound.';

const possessive = (name: string) => `${name}’s`;
const comparesLine = (name: string) =>
  `Compares what the camera sees with ${possessive(name)} photos, by colour and shape. Motion and sound alerts go on too.`;
const photoCount = (count: number) => (count === 1 ? '1 photo' : `${count} photos`);
const savedPhoto = (name: string, index: number, count: number) => `${name}, saved photo ${index} of ${count}`;
const clock = () => new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date());

// =============================================================================
// State
// =============================================================================

type PetsRead = 'loading' | 'ready' | 'failed';

export interface WatchFor {
  /** What the watch runs as: Motion and sound until the stored choice is read, and while the saved pets cannot be read. */
  way: WatchWay;
  /** The stored choice, which the error row answers to. */
  lostFoundChosen: boolean;
  chooseWay: (way: WatchWay) => void;
  pets: SubjectProfileDB[];
  petsRead: PetsRead;
  /** The pet the watch compares with: the one chosen, or the newest saved. */
  pet: SubjectProfileDB | null;
  choosePet: (id: string) => void;
  /** The pet's photos are being compared with the camera's picture. */
  comparing: boolean;
  /** The sentence read once from the polite status. */
  status: string;
}

const toSubject = (pet: SubjectProfileDB): SubjectProfile => ({
  id: pet.id,
  name: pet.name,
  type: pet.type,
  description: pet.description,
  fingerprint: pet.fingerprint as VisualFingerprint,
  referenceImages: pet.referenceImages,
  createdAt: pet.createdAt,
  lastActiveAt: pet.lastActiveAt,
  matchCount: pet.matchCount,
});

/**
 * The watch's Watch for. `watching` is true from Start Monitoring until the
 * watch stops.
 */
export function useWatchFor(watching: boolean): WatchFor {
  // The stored choice is this browser's; the page's first render, before it
  // is read, matches the built page, with Motion and sound.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lostFoundStored = useOnboardingStore((state) => state.lostFoundChosen);
  const setLostFoundChosen = useOnboardingStore((state) => state.setLostFoundChosen);
  const chosenPetId = useLostFoundStore((state) => state.chosenPetId);
  const activeSubject = useLostFoundStore((state) => state.activeSubject);
  const activeSubjectId = activeSubject?.id ?? null;
  const setActiveSubject = useLostFoundStore((state) => state.setActiveSubject);

  const [pets, setPets] = useState<SubjectProfileDB[]>([]);
  const [petsRead, setPetsRead] = useState<PetsRead>('loading');
  useEffect(() => {
    let current = true;
    readSavedPets()
      .then((saved) => {
        if (!current) return;
        setPets(saved);
        setPetsRead('ready');
      })
      .catch(() => {
        if (current) setPetsRead('failed');
      });
    return () => {
      current = false;
    };
  }, []);

  // Photos added to the pet on the watch (Add Photos while it compares) go to
  // the Lost & Found store's pet and to its saved record. The pets read here
  // take them as well, so the pet's count, Choose a pet and a later choice of
  // the pet keep them.
  useEffect(() => {
    if (!activeSubject) return;
    setPets((saved) => {
      const index = saved.findIndex((record) => record.id === activeSubject.id);
      if (index === -1) return saved;
      const record = saved[index];
      if (record.referenceImages === activeSubject.referenceImages && record.fingerprint === activeSubject.fingerprint) {
        return saved;
      }
      const next = [...saved];
      next[index] = {
        ...record,
        referenceImages: activeSubject.referenceImages,
        fingerprint: activeSubject.fingerprint,
        lastActiveAt: activeSubject.lastActiveAt,
      };
      return next;
    });
  }, [activeSubject]);

  const lostFoundChosen = mounted && lostFoundStored;
  const way: WatchWay = lostFoundChosen && petsRead !== 'failed' ? 'lost_found' : 'motion_sound';
  // The pet chosen here or on the Lost & Found page; until one is, the newest
  // saved pet. A thing saved there is the watch's only once it is chosen.
  const pet = pets.find((saved) => saved.id === chosenPetId) ?? pets.find((saved) => saved.type === 'pet') ?? null;

  // The comparison reads the pet from the Lost & Found store.
  useEffect(() => {
    if (way !== 'lost_found' || !pet || activeSubjectId === pet.id) return;
    setActiveSubject(toSubject(pet));
  }, [way, pet, activeSubjectId, setActiveSubject]);

  // It compares while the watch runs with Lost and Found and a pet.
  const comparing = watching && way === 'lost_found' && pet !== null;
  useEffect(() => {
    const store = useLostFoundStore.getState();
    if (comparing && store.activeSubject) {
      if (!store.isWatching) store.startWatching();
    } else if (!comparing && store.isWatching) {
      store.stopWatching();
    }
  }, [comparing, activeSubjectId]);
  // Leaving the watch ends its comparison with it.
  useEffect(
    () => () => {
      const store = useLostFoundStore.getState();
      if (store.isWatching) store.stopWatching();
    },
    []
  );

  // Said once when the comparison starts, changes pet or stops during a watch.
  const [status, setStatus] = useState('');
  const comparedRef = useRef<string | null>(null);
  const comparedName = comparing && pet ? pet.name : null;
  useEffect(() => {
    if (comparedName === comparedRef.current) return;
    if (comparedName) setStatus(`Comparing with ${possessive(comparedName)} photos from ${clock()}.`);
    else setStatus(watching ? `Stopped comparing at ${clock()}.` : '');
    comparedRef.current = comparedName;
  }, [comparedName, watching]);

  // The page's title names the way.
  useEffect(() => {
    const before = document.title;
    document.title = TITLES[way];
    return () => {
      document.title = before;
    };
  }, [way]);

  const chooseWay = useCallback(
    (next: WatchWay) => setLostFoundChosen(next === 'lost_found'),
    [setLostFoundChosen]
  );
  const choosePet = useCallback(
    (id: string) => {
      const chosen = pets.find((saved) => saved.id === id);
      if (chosen) setActiveSubject(toSubject(chosen));
    },
    [pets, setActiveSubject]
  );

  return { way, lostFoundChosen, chooseWay, pets, petsRead, pet, choosePet, comparing, status };
}

const WIDE = '(min-width: 1024px)';

/**
 * True from 1024 px, where the pet card heads the right column. Read at once
 * in the browser: the pet shows only after the page has read the stored
 * choice, so the first render matches the built page either way.
 */
export function useWideWatch(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

// =============================================================================
// Glyphs
// =============================================================================

function CheckGlyph() {
  return (
    <svg className="watch-for__check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProblemGlyph() {
  return (
    <svg className="watch-pet__problem" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M6 1l5.5 10h-11z" fill="currentColor" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The pet's empty photo square: the track colour with a paw outline. */
function EmptyPhoto() {
  return (
    <span className="watch-pet__photo watch-pet__photo--empty" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <ellipse cx="12" cy="16" rx="4.5" ry="3.5" />
        <ellipse cx="6" cy="10.5" rx="1.8" ry="2.3" />
        <ellipse cx="18" cy="10.5" rx="1.8" ry="2.3" />
        <ellipse cx="9.3" cy="6" rx="1.8" ry="2.3" />
        <ellipse cx="14.7" cy="6" rx="1.8" ry="2.3" />
      </svg>
    </span>
  );
}

// =============================================================================
// The chooser
// =============================================================================

interface ChooserProps {
  watchFor: WatchFor;
  watching: boolean;
  /** From 1024 px the pet card heads the right column instead of the pet row. */
  wide: boolean;
}

/**
 * The heading "Watch for", its two options, the chosen option's line and,
 * below 1024 px, the pet row. Its polite status reads the comparison's start
 * and stop.
 */
export function WatchForChooser({ watchFor, watching, wide }: ChooserProps) {
  const { way, chooseWay, pet, petsRead, lostFoundChosen, status } = watchFor;
  const line = way === 'motion_sound' ? MOTION_LINE : pet ? comparesLine(pet.name) : null;

  return (
    <section aria-labelledby="watch-for-heading" className="watch-for">
      <div className="watch-for__bar">
        <h2 id="watch-for-heading" className="watch-for__heading">Watch for</h2>
        <div role="radiogroup" aria-labelledby="watch-for-heading" className="watch-for__options">
          {WAYS.map(({ way: option, label }) => {
            const chosen = way === option;
            return (
              <label key={option} className="watch-for__option" data-chosen={chosen ? 'true' : undefined}>
                <input
                  type="radio"
                  name="watch-for"
                  value={option}
                  checked={chosen}
                  onChange={() => chooseWay(option)}
                  // A press keeps the option also when it shows checked while the
                  // stored choice differs (after a failed read of the saved pets).
                  onClick={() => chooseWay(option)}
                />
                {chosen && <CheckGlyph />}
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {line && <p className={`watch-for__line${watching ? ' watch-for__line--watching' : ''}`}>{line}</p>}

      {way === 'lost_found' && !wide && <WatchForPet watchFor={watchFor} layout="row" />}

      {petsRead === 'failed' && lostFoundChosen && (
        <div className="watch-pet watch-pet--row">
          <p className="watch-pet__failed">
            <ProblemGlyph />
            <span>{READ_FAILED}</span>
          </p>
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">{status}</div>
    </section>
  );
}

// =============================================================================
// The pet
// =============================================================================

interface PetProps {
  watchFor: WatchFor;
  /** The row under the chooser below 1024 px, the card heading the right column from 1024 px. */
  layout: 'row' | 'card';
}

/**
 * The pet the watch compares with: its first saved photo, its name, its count
 * of photos and Change pet, with the limits line; or "No pet saved" and Add a
 * pet; or "Loading saved pets…" while they are read.
 */
export function WatchForPet({ watchFor, layout }: PetProps) {
  const { pet, pets, petsRead, choosePet } = watchFor;
  const [choosing, setChoosing] = useState(false);
  const changeRef = useRef<HTMLButtonElement | null>(null);
  const className = `watch-pet watch-pet--${layout}`;

  const close = useCallback(() => {
    setChoosing(false);
    // Focus returns to Change pet once the dialog has gone.
    window.requestAnimationFrame(() => changeRef.current?.focus());
  }, []);

  if (petsRead === 'failed') return null;

  if (petsRead === 'loading') {
    return (
      <div className={className}>
        <div className="watch-pet__main">
          <EmptyPhoto />
          <p className="watch-pet__line">Loading saved pets{'…'}</p>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className={className}>
        <div className="watch-pet__main">
          <EmptyPhoto />
          <div className="watch-pet__words">
            <p className="watch-pet__name">No pet saved</p>
            <p className="watch-pet__line">{NO_PET_LINE}</p>
          </div>
        </div>
        <Link href="/lost-found/" className="watch-key watch-pet__key">Add a pet</Link>
      </div>
    );
  }

  const photos = pet.referenceImages;
  return (
    <div className={className}>
      <div className="watch-pet__main">
        {photos[0] ? (
          <img className="watch-pet__photo" src={photos[0]} alt={`${possessive(pet.name)} first saved photo`} />
        ) : (
          <EmptyPhoto />
        )}
        <div className="watch-pet__words">
          <p className="watch-pet__name" translate="no">{pet.name}</p>
          <p className="watch-pet__count">{photoCount(photos.length)}</p>
          {layout === 'card' && (
            <button ref={changeRef} type="button" className="watch-key watch-pet__key" onClick={() => setChoosing(true)}>
              Change pet
            </button>
          )}
        </div>
        {layout === 'row' && (
          <button ref={changeRef} type="button" className="watch-key watch-pet__key" onClick={() => setChoosing(true)}>
            Change pet
          </button>
        )}
      </div>
      {layout === 'card' && photos.length > 1 && (
        <div className="watch-pet__more">
          {photos.slice(1).map((photo, i) => (
            <img key={i} src={photo} alt={savedPhoto(pet.name, i + 2, photos.length)} />
          ))}
        </div>
      )}
      <p className="watch-pet__limits">{LIMITS_LINE}</p>
      {choosing && (
        <ChoosePet pets={pets} chosenId={pet.id} onChoose={choosePet} onClose={close} />
      )}
    </div>
  );
}

// =============================================================================
// Choose a pet
// =============================================================================

interface ChoosePetProps {
  pets: SubjectProfileDB[];
  chosenId: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/**
 * The dialog "Choose a pet": each saved pet with its photo, its name and its
 * count, the chosen one checked. A press chooses and closes; the arrow keys
 * move the choice; Escape and Close close it with no change. Focus is held
 * inside it, from the chosen pet, until it closes.
 */
function ChoosePet({ pets, chosenId, onChoose, onClose }: ChoosePetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // The arrow keys move the checked pet here; a press chooses it for the
  // watch and closes, and Escape or Close leave the watch's pet as it was.
  const [picked, setPicked] = useState(chosenId);
  const byArrow = useRef(false);

  useEffect(() => {
    const chosen = dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
      ?? dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]');
    chosen?.focus();
  }, []);

  const holdFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const stops = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], input[type="radio"]:checked')];
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="watch-dialog__scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="choose-pet-heading"
        className="watch-dialog"
        onKeyDown={holdFocus}
      >
        <div className="watch-dialog__head">
          <h2 id="choose-pet-heading" className="watch-dialog__heading">Choose a pet</h2>
          <button type="button" className="watch-key watch-key--square" aria-label="Close" onClick={onClose}>
            <CloseGlyph />
          </button>
        </div>
        <div role="radiogroup" aria-labelledby="choose-pet-heading" className="watch-dialog__list">
          {pets.map((saved) => {
            const chosen = saved.id === picked;
            const count = saved.referenceImages.length;
            return (
              <label key={saved.id} className="watch-dialog__pet" data-chosen={chosen ? 'true' : undefined}>
                <input
                  type="radio"
                  name="choose-pet"
                  aria-label={saved.name}
                  checked={chosen}
                  onChange={() => setPicked(saved.id)}
                  onKeyDown={(event) => {
                    byArrow.current = event.key.startsWith('Arrow');
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onChoose(saved.id);
                      onClose();
                    }
                  }}
                  onKeyUp={() => {
                    byArrow.current = false;
                  }}
                  onClick={() => {
                    if (byArrow.current) return;
                    onChoose(saved.id);
                    onClose();
                  }}
                />
                {saved.referenceImages[0] ? (
                  <img className="watch-dialog__photo" src={saved.referenceImages[0]} alt={savedPhoto(saved.name, 1, count)} />
                ) : (
                  <EmptyPhoto />
                )}
                <span className="watch-dialog__words">
                  <span className="watch-dialog__name" translate="no">{saved.name}</span>
                  <span className="watch-dialog__count">{photoCount(count)}</span>
                </span>
                {chosen && <CheckGlyph />}
              </label>
            );
          })}
        </div>
        <div className="watch-dialog__foot">
          <Link href="/lost-found/" className="watch-key">Add a pet</Link>
        </div>
      </div>
    </div>
  );
}
