/**
 * The pet's saved photo beside a Lost and Found sighting's pictures.
 *
 * A sighting keeps the camera's picture and its close-up; the pet's photo is
 * the one saved with the pet on this device, read where it is shown and
 * never copied into the alert or its pictures. A pet deleted since the
 * sighting leaves no photo, and the sighting keeps its own pictures.
 *
 * @module lib/alert-pictures/pet-photo
 */

import { useEffect, useState } from 'react';

import { useLostFoundStore } from '../../stores/lost-found-store';
import { getSubjectProfile } from '../client-db';

/** The name a sighting asks about: the pet's, or "your pet" where the alert carries none. */
export function petNameOf(alert: { subjectName?: string }): string {
  const name = alert.subjectName?.trim();
  return name ? name : 'your pet';
}

/** The pet's first saved photo, or null while it is read and where the pet has none. */
export function usePetPhoto(subjectId: string | undefined): string | null {
  // The pets this tab holds, then the pets saved in this browser's database.
  const held = useLostFoundStore((state) => (
    subjectId ? state.subjects.find((subject) => subject.id === subjectId)?.referenceImages[0] ?? null : null
  ));
  const [saved, setSaved] = useState<{ id: string; photo: string | null } | null>(null);

  useEffect(() => {
    if (!subjectId || held) return;
    let alive = true;
    void getSubjectProfile(subjectId).then((profile) => {
      if (alive) setSaved({ id: subjectId, photo: profile?.referenceImages?.[0] ?? null });
    });
    return () => { alive = false; };
  }, [subjectId, held]);

  if (held) return held;
  return saved && saved.id === subjectId ? saved.photo : null;
}
