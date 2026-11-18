/**
 * The camera between the dashboard and a way's page
 *
 * The dashboard's start key opens the camera while the dashboard is on
 * screen, so it can say that the camera is starting, refused or in use. The
 * open camera and the watch it was opened for are held here, in memory and
 * never in an address, until the way's page takes them: Back, Forward or a
 * reload finds nothing held and starts nothing. A camera no page takes is
 * closed.
 *
 * @module lib/camera-handoff
 */

import type { WayId } from './app-routes';

export interface StartRequest {
  way: WayId;
  /** Lost and Found: the id of the pet to watch for. */
  pet?: string;
}

export type StartPage = 'monitor' | 'security' | 'wildlife';

const UNTAKEN_MS = 10_000;

let held: { request: StartRequest; camera: MediaStream; taken: boolean; release?: () => void } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** The page where a way's watch runs. Lost and Found's check runs on Motion and sound's page. */
export function pageOfStart(way: WayId): StartPage {
  return way === 'security' ? 'security' : way === 'wildlife' ? 'wildlife' : 'monitor';
}

export function closeCamera(camera: MediaStream | null | undefined): void {
  camera?.getTracks().forEach((track) => track.stop());
}

function clear(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  held = null;
}

/**
 * Closes a held camera: no page took it, or the page that took its start was
 * left or ended its watch before its feed took it. The tab's claim on the
 * watch goes with it.
 */
export function dropStart(): void {
  const camera = held?.camera;
  const release = held?.release;
  clear();
  closeCamera(camera);
  release?.();
}

/**
 * Holds the camera the dashboard's key opened, with the watch it was opened
 * for. `release` lets go of the tab's claim on the watch (tab-channel's
 * `claimWatch`) when the camera is closed unused; a feed that takes the camera
 * leaves the claim to the page's own watch, which takes it over.
 */
export function holdStart(request: StartRequest, camera: MediaStream, release?: () => void): void {
  dropStart();
  held = { request, camera, taken: false, release };
  timer = setTimeout(dropStart, UNTAKEN_MS);
}

/** The start a page was opened for, once. The camera stays held for that page's own feed. */
export function takeStart(page: StartPage): StartRequest | null {
  if (!held || held.taken) return null;
  if (pageOfStart(held.request.way) !== page) {
    dropStart();
    return null;
  }
  held.taken = true;
  if (timer) clearTimeout(timer);
  timer = null;
  return held.request;
}

/** The held camera, once, for the feed of the page that took the start. The feed owns it from here. */
export function takeHeldCamera(): MediaStream | null {
  if (!held || !held.taken) return null;
  const camera = held.camera;
  const video = camera.getVideoTracks();
  if (video.length === 0 || video.some((track) => track.readyState !== 'live')) {
    dropStart();
    return null;
  }
  clear();
  return camera;
}
