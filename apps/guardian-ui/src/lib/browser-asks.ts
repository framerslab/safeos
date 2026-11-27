/**
 * What the browser has answered for the camera and for notifications
 *
 * The dashboard says when the camera or notifications are blocked for this
 * site and offers the fix that is owed. It reads the browser's own answer and
 * follows a change of it. Where the browser will not say, the answer is
 * unknown and the dashboard says nothing of it.
 *
 * @module lib/browser-asks
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export type Ask = 'granted' | 'blocked' | 'not-asked' | 'unknown';

function asAsk(state: string | undefined): Ask {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'blocked';
  if (state === 'prompt' || state === 'default') return 'not-asked';
  return 'unknown';
}

/** The camera's permission read once now, mapped as useCameraAsk maps it. */
export async function cameraAskNow(): Promise<Ask> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return asAsk(status.state);
  } catch {
    return 'unknown';
  }
}

/** One permission's answer, read and followed; 'unknown' until the read answers or where the browser will not say. */
function usePermissionAsk(name: 'camera' | 'microphone'): Ask {
  const [ask, setAsk] = useState<Ask>('unknown');
  useEffect(() => {
    let live = true;
    let status: PermissionStatus | null = null;
    const follow = () => {
      if (live && status) setAsk(asAsk(status.state));
    };
    try {
      void navigator.permissions.query({ name: name as PermissionName }).then(
        (answer) => {
          if (!live) return;
          status = answer;
          status.onchange = follow;
          follow();
        },
        () => {
          if (live) setAsk('unknown');
        }
      );
    } catch {
      // No permissions to ask: the answer stays unknown.
    }
    return () => {
      live = false;
      if (status) status.onchange = null;
    };
  }, [name]);
  return ask;
}

/** The browser's answer for the camera on this site, kept up to date. 'unknown' where the browser will not say. */
export function useCameraAsk(): Ask {
  return usePermissionAsk('camera');
}

/** The microphone's permission, read and followed as useCameraAsk reads the camera's; 'unknown' until the read answers. */
export function useMicrophoneAsk(): Ask {
  return usePermissionAsk('microphone');
}

function notificationAnswer(): Ask {
  try {
    return typeof Notification === 'undefined' ? 'unknown' : asAsk(Notification.permission);
  } catch {
    return 'unknown';
  }
}

/** The same for notifications, with the function that asks the browser. */
export function useNotificationAsk(): { ask: Ask; request: () => Promise<void> } {
  const [ask, setAsk] = useState<Ask>('unknown');
  useEffect(() => {
    const read = () => setAsk(notificationAnswer());
    // The answer can change in the browser's own settings while the page is
    // away; it is read again when the page comes back into view.
    const shown = () => {
      if (document.visibilityState === 'visible') read();
    };
    read();
    document.addEventListener('visibilitychange', shown);
    return () => document.removeEventListener('visibilitychange', shown);
  }, []);
  const request = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    try {
      await Notification.requestPermission();
    } catch {
      // A refused or failed request: the answer below says what holds.
    }
    setAsk(notificationAnswer());
  }, []);
  return { ask, request };
}
