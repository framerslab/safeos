'use client';

/**
 * Settings, Your own server
 *
 * The address of a server of the person's own, opened in the address
 * dialog, and, while an address is saved, the name this device sends to it,
 * with its own Save. A name the server does not take is kept as typed and the
 * page says it was not saved. Offline, Save waits and the page says why. A
 * session made on this device alone sends nothing, and the page says so; a
 * clear of all data while the name saves leaves no copy of it on this device.
 *
 * @module app/settings/server/page
 */

import { useEffect, useRef, useState } from 'react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { isServerSession, useAuthStore } from '@/stores/auth-store';
import { getLocalDataGeneration, isCurrentLocalData, readAccountClearMarker } from '@/lib/local-data-generation';
import { PageHead } from '@/components/settings/PageHead';
import { Group } from '@/components/settings/Group';
import { FieldRow } from '@/components/settings/FieldRow';
import { SavedNote } from '@/components/settings/SavedNote';
import { ChevronGlyph } from '@/components/settings/glyphs';
import { SAVED_FOR_MS, type SaveNote } from '@/lib/settings-save';
import { keepNameOnDevice, readNameOnDevice } from '@/lib/name-on-device';

const NOT_SAVED = 'Your name was not saved. Try again.';
const OFFLINE = 'Your server cannot be reached while this device is offline.';
const NO_SESSION = 'This device is not signed in to your server, so your name was not sent.';

/** Whether this device has a connection, followed as it changes. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);
  return online;
}

export default function YourOwnServerPage() {
  const { config } = useBackendStatus();
  const address = config?.apiUrl ?? '';
  const profileName = useAuthStore((s) => s.profile?.displayName ?? '');
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const online = useOnline();
  // The name this device keeps, read once the page has mounted.
  const [deviceName, setDeviceName] = useState('');
  const shownName = profileName || deviceName;
  const [name, setName] = useState(shownName);
  const latest = useRef(name);
  latest.current = name;
  const [typed, setTyped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<SaveNote>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDeviceName(readNameOnDevice());
  }, []);

  // A profile read after the page opened fills the field, unless the person
  // has typed in it.
  useEffect(() => {
    if (!typed) setName(shownName);
  }, [shownName, typed]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const save = async () => {
    if (!online || saving) return;
    const submitted = name;
    setSaving(true);
    setError(null);
    setNote(null);
    // A clear of all data, here or in another tab, while the name saves takes
    // the device's copy with it: the name is not put back on this device.
    const counter = getLocalDataGeneration();
    const marker = readAccountClearMarker();
    try {
      const { profile, sessionToken } = useAuthStore.getState();
      // With no profile read yet the store keeps nothing: the name is not saved.
      if (!profile) throw new Error('no profile');
      // A session made on this device alone holds no place on the server to send to.
      if (!isServerSession(sessionToken)) {
        setError(NO_SESSION);
        return;
      }
      await updateProfile({ displayName: submitted });
      if (!isCurrentLocalData(counter) || readAccountClearMarker() !== marker) return;
      keepNameOnDevice(submitted);
      setDeviceName(submitted);
      // A name typed while this one was saving stays as typed.
      if (latest.current === submitted) setTyped(false);
      setNote('saved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote(null), SAVED_FOR_MS);
    } catch {
      setError(NOT_SAVED);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings look-part">
      <div className="settings-page">
        <PageHead title="Your own server" />
        <Group id="server-rows">
          <div id="address" className="set-anchor">
            <button
              type="button"
              className="set-row set-link set-link--button"
              aria-labelledby="server-address-name"
              aria-describedby={address ? 'server-address-value' : undefined}
              onClick={() => window.dispatchEvent(new CustomEvent('safeos:open-backend-settings'))}
            >
              <span className="set-link__words">
                <span id="server-address-name" className="set-row__name">
                  Server address
                </span>
                {address ? (
                  <span id="server-address-value" className="set-row__value">
                    {address}
                  </span>
                ) : null}
              </span>
              <ChevronGlyph />
            </button>
          </div>
          {address ? (
            <div id="name" className="set-anchor">
              <FieldRow
                id="server-name"
                label="Your name on your server"
                value={name}
                autoComplete="name"
                error={error}
                onChange={(value) => {
                  setTyped(true);
                  setError(null);
                  setName(value);
                }}
              />
              <div className="set-save">
                <button
                  type="button"
                  className="key key--solid set-key"
                  aria-disabled={!online || saving || undefined}
                  onClick={save}
                >
                  Save
                </button>
                <SavedNote note={note} />
              </div>
              {online ? null : <p className="set-line">{OFFLINE}</p>}
            </div>
          ) : null}
        </Group>
      </div>
    </div>
  );
}
