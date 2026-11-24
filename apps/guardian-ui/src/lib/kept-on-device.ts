/**
 * What this device keeps, counted
 *
 * Settings, Data on this device, says how many alerts, saved pictures (the
 * alert pictures kept among them), pets and sounds of the person's own this
 * device holds.
 *
 * @module lib/kept-on-device
 */

import { countKeptRecords } from './client-db';
import { getAllCustomSounds } from './custom-sounds-db';
import { useAnimalAlertStore } from '../stores/animal-alert-store';

export interface KeptCounts {
  alerts: number;
  pictures: number;
  pets: number;
  sounds: number;
}

/** Alerts count the alert records and the Wildlife sightings History shows. */
export async function countKept(): Promise<KeptCounts> {
  const [records, sounds] = await Promise.all([countKeptRecords(), getAllCustomSounds()]);
  const sightings = useAnimalAlertStore.getState().detectionHistory.length;
  return { ...records, alerts: records.alerts + sightings, sounds: sounds.length };
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 alerts, 1 saved picture, 1 pet, 0 sounds"; with nothing kept, "Nothing saved on this device yet." */
export function keptOnDeviceWords(c: KeptCounts): string {
  if (c.alerts + c.pictures + c.pets + c.sounds === 0) return 'Nothing saved on this device yet.';
  return [
    counted(c.alerts, 'alert', 'alerts'),
    counted(c.pictures, 'saved picture', 'saved pictures'),
    counted(c.pets, 'pet', 'pets'),
    counted(c.sounds, 'sound', 'sounds'),
  ].join(', ');
}
