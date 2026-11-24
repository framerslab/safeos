/**
 * Settings, Notifications: "Show the picture in alert notifications".
 *
 * Off at first. On, a Motion, Picture change or Lost and Found alert's
 * notification carries the camera's picture with its box drawn in. The
 * switch is inactive, with its reason in its description, in a browser that
 * shows a notification's words alone, while the browser has not allowed the
 * site's notifications (beside the key that asks it), and while it has
 * blocked them. The choice is kept on this device.
 *
 * @module components/alert-pictures/NotificationPictureRow
 */

'use client';

import { useEffect, useId, useState } from 'react';

import { showsNotificationPictures } from '../../lib/alert-pictures/capture';
import { postPictureNews, settingsNews } from '../../lib/alert-pictures/channel';
import {
  ALLOW_NOTIFICATIONS,
  BLOCKED_LINE,
  LOCK_SCREEN_LINE,
  NOTIFICATION_PICTURE_SWITCH,
  THIS_DEVICE_LINE,
  WORDS_ALONE_LINE,
} from '../../lib/alert-pictures/words';
import { useAlertPicturesStore } from '../../stores/alert-pictures-store';

type Permission = 'granted' | 'default' | 'denied' | 'none';

const permissionNow = (): Permission =>
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'none';

export function NotificationPictureRow() {
  const label = useId();
  const line = useId();
  const why = useId();
  const allow = useId();
  const stored = useAlertPicturesStore((state) => state.inNotifications);
  const setInNotifications = useAlertPicturesStore((state) => state.setInNotifications);

  // What this browser says, read after the first paint so the page's HTML and the device agree.
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<Permission>('none');
  const [pictures, setPictures] = useState(true);
  useEffect(() => {
    setPermission(permissionNow());
    setPictures(showsNotificationPictures());
    setReady(true);
  }, []);

  // An answer changed in the browser's site settings is read again when the page comes back to view,
  // and when the browser says the answer changed.
  useEffect(() => {
    const reread = () => setPermission(permissionNow());
    const onView = () => { if (document.visibilityState === 'visible') reread(); };
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', onView);
    let status: PermissionStatus | null = null;
    let stopped = false;
    navigator.permissions?.query({ name: 'notifications' }).then(
      (found) => {
        if (stopped) return;
        status = found;
        status.addEventListener('change', reread);
      },
      () => undefined,
    );
    return () => {
      stopped = true;
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', onView);
      status?.removeEventListener('change', reread);
    };
  }, []);

  const wordsAlone = ready && !pictures;
  const reason: 'words-alone' | 'ask' | 'blocked' | null = !ready ? null
    : wordsAlone ? 'words-alone'
      : permission === 'default' ? 'ask'
        : permission === 'denied' ? 'blocked'
          : null;
  const inactive = reason !== null;
  const on = ready && stored;

  const toggle = () => {
    if (!ready || inactive) return;
    setInNotifications(!stored);
    postPictureNews(settingsNews(useAlertPicturesStore.getState()));
  };

  const ask = async () => {
    try {
      await Notification.requestPermission();
    } catch {
      // A browser that refuses the ask leaves the answer as it was.
    }
    setPermission(permissionNow());
  };

  const described = [line, reason === 'words-alone' || reason === 'blocked' ? why : null, reason === 'ask' ? allow : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="alert-pictures-note-picture" data-notification-picture-row="">
      {/* The whole row is the switch's target. */}
      <div className="alert-pictures-note-picture__row" onClick={toggle}>
        <span id={label} className="alert-pictures-row__label" data-lead="">{NOTIFICATION_PICTURE_SWITCH}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={label}
          aria-describedby={described}
          aria-disabled={inactive ? true : undefined}
          className="alert-pictures-switch"
        >
          <span className="alert-pictures-switch__track" aria-hidden="true">
            <span className="alert-pictures-switch__knob" />
          </span>
        </button>
      </div>
      <p id={line} className="alert-pictures-line alert-pictures-note-picture__line" data-lead="">{LOCK_SCREEN_LINE}</p>
      <p className="alert-pictures-quiet alert-pictures-note-picture__line">{THIS_DEVICE_LINE}</p>
      {reason === 'words-alone' && <p id={why} className="alert-pictures-quiet alert-pictures-note-picture__line">{WORDS_ALONE_LINE}</p>}
      {reason === 'blocked' && <p id={why} className="alert-pictures-quiet alert-pictures-note-picture__line">{BLOCKED_LINE}</p>}
      {reason === 'ask' && (
        <div className="alert-pictures-note-picture__ask">
          <button id={allow} type="button" className="alert-pictures-key" onClick={() => void ask()}>{ALLOW_NOTIFICATIONS}</button>
        </div>
      )}
    </div>
  );
}

export default NotificationPictureRow;
