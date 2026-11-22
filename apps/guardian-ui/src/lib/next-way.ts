/**
 * The next watch's way and pet
 *
 * Setup and the watch's Watch for keep one choice: Lost and Found while
 * setup's `lostFoundChosen` holds, else Motion and sound. The pet is the one
 * chosen on the watch or the Lost & Found page, else the newest saved pet,
 * as the watch's Watch for takes it.
 *
 * @module lib/next-way
 */

'use client';

import { useEffect, useState } from 'react';
import { readSavedPets, type SubjectProfileDB } from './client-db';
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

  useEffect(() => {
    setMounted(true);
    let live = true;
    readSavedPets()
      .then((saved) => {
        if (live) setPets(saved);
      })
      .catch(() => {
        if (live) setPets([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const way: NextWay = mounted && lostFoundChosen ? 'lost_found' : 'motion_sound';
  return { way, pet: pets ? petForWatch(pets, chosenPetId) : null, read: mounted && pets !== null };
}
