/**
 * Alert pictures: the person's four choices, kept on this device.
 *
 * Keep alert pictures (on at first), how long a picture is kept before it is
 * deleted (3 days at first), whether the notice before the first watch has
 * been answered, and whether an alert's notification shows its picture (off
 * at first). The choices are this browser's: every tab reads them again
 * when another tab saves them.
 *
 * @module stores/alert-pictures-store
 */

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type DeleteAfterDays = 1 | 3 | 7 | 30 | null;

export const ALERT_PICTURES_KEY = 'safeos-alert-pictures';

interface AlertPicturesChoices {
  /** Each alert's pictures are saved on this device. */
  keep: boolean;
  /** A kept picture is deleted after this many days; null keeps it until the person deletes it. */
  deleteAfterDays: DeleteAfterDays;
  /** The notice before the first watch has been answered on this device. */
  noticeAnswered: boolean;
  /** An alert's notification shows its picture. */
  inNotifications: boolean;
  /**
   * When a choice was last made, in any tab: news of a choice made before it is older than the
   * choices this tab holds. A choice made here is later than every choice this tab has heard of.
   */
  chosenAt: number;
}

interface AlertPicturesState extends AlertPicturesChoices {
  setKeep: (keep: boolean) => void;
  setDeleteAfterDays: (days: DeleteAfterDays) => void;
  /** The notice's answer: the choice as set there, and the notice is not shown again. */
  answerNotice: (choice: { keep: boolean; deleteAfterDays: DeleteAfterDays }) => void;
  setInNotifications: (show: boolean) => void;
  reset: () => void;
}

/** The newest time of a choice this tab has heard from another tab. */
let heardAt = 0;

/** Notes the time of a choice another tab made: a choice made here after it is later. */
export function heardChoiceAt(at: number): void {
  heardAt = Math.max(heardAt, at);
}

const DEFAULTS: AlertPicturesChoices = {
  keep: true,
  deleteAfterDays: 3,
  noticeAnswered: false,
  inNotifications: false,
  chosenAt: 0,
};

/**
 * Local storage that never throws: a choice the browser cannot keep (a full
 * or refused store) holds in memory until the page is reloaded.
 */
const quietStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Kept in memory alone.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

export const useAlertPicturesStore = create<AlertPicturesState>()(
  persist(
    (set, get) => {
      // Now, or just after the newest choice this tab holds or has heard of, whichever is later:
      // two choices made in one millisecond are told apart.
      const chosenNow = () => Math.max(Date.now(), get().chosenAt + 1, heardAt + 1);
      return {
        ...DEFAULTS,
        setKeep: (keep) => set({ keep, chosenAt: chosenNow() }),
        setDeleteAfterDays: (deleteAfterDays) => set({ deleteAfterDays, chosenAt: chosenNow() }),
        answerNotice: ({ keep, deleteAfterDays }) => set({ keep, deleteAfterDays, noticeAnswered: true, chosenAt: chosenNow() }),
        setInNotifications: (inNotifications) => set({ inNotifications, chosenAt: chosenNow() }),
        reset: () => set({ ...DEFAULTS }),
      };
    },
    {
      name: ALERT_PICTURES_KEY,
      storage: createJSONStorage(() => quietStorage),
      partialize: ({ keep, deleteAfterDays, noticeAnswered, inNotifications, chosenAt }) => ({ keep, deleteAfterDays, noticeAnswered, inNotifications, chosenAt }),
    },
  ),
);

// Another tab saved the choices, or cleared them: this tab reads them again.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== null && event.key !== ALERT_PICTURES_KEY) return;
    if (event.key === null || event.newValue === null) {
      useAlertPicturesStore.setState({ ...DEFAULTS });
      return;
    }
    void useAlertPicturesStore.persist.rehydrate();
  });
}
