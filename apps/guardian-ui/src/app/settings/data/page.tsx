'use client';

/**
 * Settings, Data on this device
 *
 * Counts what this device keeps, exports the settings as a file, and clears
 * all data after a question asked in place. Offline, the question adds that
 * SafeOS will not open again until the device is back online: the installed
 * copy goes with the rest, and only a load with a connection stores it again.
 *
 * @module app/settings/data/page
 */

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { clearLocalData } from '@/lib/local-data';
import { countKept, keptOnDeviceWords } from '@/lib/kept-on-device';
import { PageHead } from '@/components/settings/PageHead';
import { Group } from '@/components/settings/Group';
import { ConfirmInPlace } from '@/components/settings/ConfirmInPlace';
import { ProblemGlyph } from '@/components/settings/glyphs';

const QUESTION = 'Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device.';
const OFFLINE = ' SafeOS will not open again until you are back online.';
const FAILED = 'Could not clear all local data. Please try again.';

/** Today as this device's calendar reads it: "2026-11-22". */
function today(): string {
  const at = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

function download(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export default function DataOnThisDevicePage() {
  const exportSettings = useSettingsStore((s) => s.exportSettings);
  const [words, setWords] = useState<string | null>(null);
  const [exported, setExported] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const clearKey = useRef<HTMLButtonElement>(null);
  const giveBack = useRef(false);

  useEffect(() => {
    let live = true;
    countKept()
      .then((counts) => {
        if (live) setWords(keptOnDeviceWords(counts));
      })
      .catch(() => {
        // The counts could not be read: the line stays empty.
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (asking === null && giveBack.current) {
      giveBack.current = false;
      clearKey.current?.focus();
    }
  }, [asking]);

  const exportNow = () => {
    const name = `safeos-settings-${today()}.json`;
    download(new Blob([exportSettings()], { type: 'application/json' }), name);
    setExported(`Downloaded ${name}.`);
  };

  const ask = () => {
    setFailed(false);
    setAsking(navigator.onLine === false ? QUESTION + OFFLINE : QUESTION);
  };

  const clearAll = async () => {
    giveBack.current = true;
    setAsking(null);
    try {
      await clearLocalData();
      window.location.reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="settings look-part">
      <div className="settings-page">
        <PageHead
          title="Data on this device"
          lead={words === null ? <span className="set-row__loading" aria-hidden="true" /> : words}
        />
        <Group id="data-export">
          <div className="set-row set-action">
            <button type="button" className="key key--outline set-key" onClick={exportNow}>
              Export settings
            </button>
            <p className="set-line" role="status" aria-live="polite">
              {exported}
            </p>
          </div>
        </Group>
        <Group id="data-clear">
          <div className="set-row set-action">
            {asking === null ? (
              <button ref={clearKey} type="button" className="key key--outline set-key" onClick={ask}>
                <ProblemGlyph />
                Clear all data on this device
              </button>
            ) : (
              <ConfirmInPlace
                question={asking}
                confirm="Clear all data"
                onConfirm={clearAll}
                onCancel={() => {
                  giveBack.current = true;
                  setAsking(null);
                }}
              />
            )}
            <div role="status" aria-live="polite">
              {failed ? (
                <p className="set-failure">
                  <ProblemGlyph />
                  {FAILED}
                </p>
              ) : null}
            </div>
          </div>
        </Group>
      </div>
    </div>
  );
}
