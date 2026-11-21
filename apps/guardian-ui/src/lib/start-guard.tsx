/**
 * The question before a second watch
 *
 * One watch runs on a device at a time, across its tabs. A start key asks the
 * other tabs first; while one of them watches, the key shows the question
 * and starts only after the person chose to watch here and the other tab has
 * stopped.
 *
 * @module lib/start-guard
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OtherTabDialog } from '@/components/dashboard/OtherTabDialog';
import { askOtherTabs, releaseStart, takeOverWatch } from './tab-channel';

/**
 * Asks before a second watch starts on this device. `guard(start, opener)`
 * runs `start` at once when no other tab watches or starts; else it shows the
 * dialog, and runs `start` once Watch here has stopped the other tab
 * (`takeOverWatch()` true). While that tab goes on watching, the dialog shows
 * again and nothing starts. Cancel and Escape start nothing and return focus
 * to `opener`. A start whose page was left before it could run does not run.
 * A tab told none watches holds the start (`askOtherTabs`) until the way's
 * watch begins, so a press in another tab meanwhile asks the person; a
 * `start` that returns a promise lets go of it when the promise settles, and
 * leaving the page lets go of it too.
 */
export function useStartGuard() {
  const [asked, setAsked] = useState<{ start: () => unknown; opener: HTMLElement | null } | null>(null);
  // An answer that comes after the page was left starts nothing.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
      releaseStart();
    };
  }, []);

  const guard = useCallback(async (start: () => unknown, opener: HTMLElement | null = null) => {
    const answer = await askOtherTabs();
    if (!shown.current) {
      if (!answer.watching) releaseStart();
      return;
    }
    if (answer.watching) {
      setAsked({ start, opener });
      return;
    }
    const started = start();
    if (started instanceof Promise) {
      try {
        await started;
      } finally {
        releaseStart();
      }
    }
  }, []);

  const dialog = asked ? (
    <OtherTabDialog
      onWatchHere={() => {
        const ask = asked;
        setAsked(null);
        void takeOverWatch().then((stopped) => {
          if (!shown.current) return;
          // A tab that goes on answering is watching: the question stays.
          if (stopped) ask.start();
          else setAsked(ask);
        });
      }}
      onCancel={() => {
        const { opener } = asked;
        setAsked(null);
        opener?.focus();
      }}
    />
  ) : null;

  return { guard, dialog };
}
