/**
 * The next watch's way and pet
 *
 * Setup and the watch's Watch for keep one choice: Lost and Found while
 * setup's `lostFoundChosen` holds, else Motion and sound. The pet is the one
 * chosen on the watch or the Lost & Found page, else the newest saved pet,
 * as the watch's Watch for takes it. A clear of all data in another tab
 * drops the pets held here and reads them again, as Watch for does.
 *
 * @module lib/next-way
 */

'use client';

import { useEffect, useState } from 'react';
import { readSavedPets, type SubjectProfileDB } from './client-db';
import { ACCOUNT_CLEAR_MARKER_KEY, readAccountClearMarker } from './local-data-generation';
import { useOnboardingStore } from '../stores/onboarding-store';
import { useLostFoundStore } from '../stores/lost-found-store';

export type NextWay = 'motion_sound' | 'lost_found';

/** The chosen pet, else the newest saved pet of the kind pet; `pets` newest first. */
export function petForWatch(pets: SubjectProfileDB[], chosenPetId: string | null): SubjectProfileDB | null {
  return pets.find((saved) => saved.id === chosenPetId) ?? pets.find((saved) => saved.type === 'pet') ?? null;
}

/** The way the next watch takes and its pet; `read` once the saved pets have been read. */
export function useNextWay(): { way: NextWay; pet: SubjectProfileDB | null; read: boolean } {
  const lostFoundChosen = useOnboardingStore((state) => state.lostFoundChosen);
  const chosenPetId = useLostFoundStore((state) => state.chosenPetId);
  const [mounted, setMounted] = useState(false);
  const [pets, setPets] = useState<SubjectProfileDB[] | null>(null);
  // Counts the clears of all data this page has heard of; each one reads the pets again.
  const [clears, setClears] = useState(0);

  useEffect(() => {
    setMounted(true);
    let live = true;
    const readUnder = readAccountClearMarker();
    readSavedPets()
      .then((saved) => {
        if (!live) return;
        // Pets read before a clear that has landed since are the cleared device's: read again.
        if (readAccountClearMarker() !== readUnder) {
          setClears((count) => count + 1);
          return;
        }
        setPets(saved);
      })
      .catch(() => {
        if (live) setPets([]);
      });
    return () => {
      live = false;
    };
  }, [clears]);

  // Another tab cleared all data: the account marker's storage event says so.
  // The pets held here are the cleared device's, so they go, and are read again.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCOUNT_CLEAR_MARKER_KEY) return;
      setPets(null);
      setClears((count) => count + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const way: NextWay = mounted && lostFoundChosen ? 'lost_found' : 'motion_sound';
  return { way, pet: pets ? petForWatch(pets, chosenPetId) : null, read: mounted && pets !== null };
}
