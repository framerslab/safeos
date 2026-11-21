/**
 * Start watching
 *
 * The dashboard's key starts the way last watched, and Motion and sound
 * before any watch on this device. It opens the camera while the dashboard is
 * on screen, so the dashboard can say why the camera did not open, and holds
 * the open camera for the way's page, which takes it with no second request
 * (lib/camera-handoff). The tab holds the device's one watch from before the
 * camera is asked for (lib/tab-channel).
 *
 * @module lib/start-watch
 */

import { WAYS, type WayId } from './app-routes';
import { cameraProblem, openCamera } from './camera-constraints';
import { closeCamera, dropStart, holdStart } from './camera-handoff';
import type { SubjectProfileDB } from './client-db';
import { modelOnDevice } from './model-on-device';
import { claimWatch } from './tab-channel';
import type { LastWay } from './watch-session';
import { useCameraStore } from '@/stores/camera-store';

/** What Start watching uses. */
export interface StartChoice {
  way: WayId;
  /** Lost and Found: the pet the watch looks for. */
  pet?: SubjectProfileDB;
}

/**
 * The way last watched. Lost and Found only while its pet is saved and is a
 * subject of the kind pet or other; in every other case Motion and sound.
 */
export function startChoice(last: LastWay | null, subjects: SubjectProfileDB[]): StartChoice {
  if (!last || last.way === 'monitor') return { way: 'monitor' };
  if (last.way === 'lost-found') {
    const petId = last.pet;
    const pet = petId ? subjects.find((subject) => subject.id === petId) : undefined;
    return pet && (pet.type === 'pet' || pet.type === 'other') ? { way: 'lost-found', pet } : { way: 'monitor' };
  }
  return { way: last.way };
}

/** When a subject was saved; a date that does not parse counts as the earliest. */
const savedAt = (subject: SubjectProfileDB) => {
  const at = Date.parse(subject.createdAt);
  return Number.isFinite(at) ? at : -Infinity;
};

/**
 * The pet the Lost and Found row shows: the pet last watched while it is
 * saved, else the pet saved most recently, else none. A subject of the kind
 * person is never one.
 */
export function rowPet(last: LastWay | null, subjects: SubjectProfileDB[]): SubjectProfileDB | null {
  const pets = subjects.filter((subject) => subject.type !== 'person');
  const petId = last?.way === 'lost-found' ? last.pet : undefined;
  const watched = petId ? pets.find((pet) => pet.id === petId) : undefined;
  if (watched) return watched;
  let newest: SubjectProfileDB | null = null;
  for (const pet of pets) {
    if (!newest || savedAt(pet) > savedAt(newest)) newest = pet;
  }
  return newest;
}

const nameOf = (way: WayId) => WAYS.find((one) => one.id === way)?.name ?? 'Motion and sound';

/** "Start watching uses Lost and Found, for Mittens." */
export function startLine(choice: StartChoice): string {
  return choice.way === 'lost-found' && choice.pet
    ? `Start watching uses ${nameOf('lost-found')}, for ${choice.pet.name}.`
    : `Start watching uses ${nameOf(choice.way)}.`;
}

/** The address the press opens: /monitor/ for Motion and sound and for Lost and Found, else the way's own page. */
export function startAddress(choice: StartChoice): string {
  return choice.way === 'security' ? '/security/' : choice.way === 'wildlife' ? '/wildlife/' : '/monitor/';
}

export type StartOutcome = 'opened' | 'needs-model' | 'blocked' | 'in-use' | 'failed' | 'stopped';

/**
 * Opens the camera while the dashboard is on screen and hands it to the way's
 * page. People and Wildlife with no detection model on this device open their
 * page at its own question and ask for no camera. The tab holds the device's
 * watch (`claimWatch`) from before the camera is asked for; another tab that
 * takes over meanwhile ends the start: 'stopped', its camera closed and
 * nothing opened.
 */
export async function startWatch(choice: StartChoice, go: (address: string) => void): Promise<StartOutcome> {
  const needsModel = choice.way === 'security' || choice.way === 'wildlife';
  if (needsModel && !(await modelOnDevice())) {
    go(startAddress(choice));
    return 'needs-model';
  }
  // This tab holds the device's watch from here, before the camera is asked
  // for; another tab that takes over meanwhile ends this start.
  let stopped = false;
  const release = claimWatch(choice.way, () => {
    stopped = true;
    dropStart();
    release();
  });
  // Motion and sound listens, and Lost and Found's check runs beside it.
  const listens = !needsModel;
  let camera: MediaStream;
  try {
    camera = await openCamera({ deviceId: listens ? useCameraStore.getState().deviceId : '', audio: listens });
  } catch (error) {
    release();
    return stopped ? 'stopped' : cameraProblem(error);
  }
  if (stopped) {
    closeCamera(camera);
    return 'stopped';
  }
  holdStart(choice.pet ? { way: choice.way, pet: choice.pet.id } : { way: choice.way }, camera, release);
  go(startAddress(choice));
  return 'opened';
}
