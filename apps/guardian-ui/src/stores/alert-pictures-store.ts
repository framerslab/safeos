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
}

interface AlertPicturesState extends AlertPicturesChoices {
  setKeep: (keep: boolean) => void;
  setDeleteAfterDays: (days: DeleteAfterDays) => void;
  /** The notice's answer: the choice as set there, and the notice is not shown again. */
  answerNotice: (choice: { keep: boolean; deleteAfterDays: DeleteAfterDays }) => void;
  setInNotifications: (show: boolean) => void;
  reset: () => void;
}

const DEFAULTS: AlertPicturesChoices = {
  keep: true,
  deleteAfterDays: 3,
  noticeAnswered: false,
  inNotifications: false,
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
    (set) => ({
      ...DEFAULTS,
      setKeep: (keep) => set({ keep }),
      setDeleteAfterDays: (deleteAfterDays) => set({ deleteAfterDays }),
      answerNotice: ({ keep, deleteAfterDays }) => set({ keep, deleteAfterDays, noticeAnswered: true }),
      setInNotifications: (inNotifications) => set({ inNotifications }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: ALERT_PICTURES_KEY,
      storage: createJSONStorage(() => quietStorage),
      partialize: ({ keep, deleteAfterDays, noticeAnswered, inNotifications }) => ({ keep, deleteAfterDays, noticeAnswered, inNotifications }),
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
