'use client';

/**
 * The list of settings pages
 *
 * Every settings page in four groups, each row its page's name and its value
 * in words, read from this device's own stores. The first group has no
 * heading: Detection, Alert sounds and Quiet hours, each with a small picture
 * of its value. Then Alerts, Camera picture and This device, and, only while
 * a server address is saved, Your own server. Before the page has mounted
 * each value is a short loading bar, never a default.
 *
 * @module components/settings/SettingsList
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { useSettingsStore, quietHoursActiveAt } from '@/stores/settings-store';
import { useWatchSettings } from '@/stores/watch-settings';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationAsk } from '@/lib/browser-asks';
import { useBrowserNotificationsOn } from '@/lib/notification-choices';
import { useNextWay } from '@/lib/next-way';
import { useModelOnDevice } from '@/lib/model-on-device';
import { MODEL_SIZE_MB } from '@/lib/detection-model-facts';
import { useAccessibility, useTheme } from '@/lib/theme-manager';
import { getAllCustomSounds } from '@/lib/custom-sounds-db';
import { readNameOnDevice } from '@/lib/name-on-device';
import {
  detectionValue,
  lookValue,
  modelValue,
  notificationsValue,
  quietBand,
  quietValue,
  soundsValue,
  unansweredValue,
  zonesValue,
} from '@/lib/settings-values';
import { Group } from './Group';
import { LinkRow } from './LinkRow';
import { ListMeters, PetPhoto, QuietBand, VolumeBar } from './ListPictures';

export const TEST_ALERTS_VALUE = 'Play each sound and try an alert';
export const DATA_VALUE = 'Alerts, pictures, pets, sounds and settings';

/** The count of the person's own sounds; null until read, 'unread' when the read fails. */
function useOwnSoundCount(): number | 'unread' | null {
  const [count, setCount] = useState<number | 'unread' | null>(null);
  useEffect(() => {
    let live = true;
    getAllCustomSounds()
      .then((sounds) => {
        if (live) setCount(sounds.length);
      })
      .catch(() => {
        if (live) setCount('unread');
      });
    return () => {
      live = false;
    };
  }, []);
  return count;
}

/** The time now, read again each minute; null before mount. */
function useMinute(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const ROWS = {
  detection: '/settings/detection/',
  sounds: '/settings/sounds/',
  quiet: '/settings/schedule/',
  unanswered: '/settings/escalation/',
  notifications: '/settings/notifications/',
  tests: '/settings/test-alerts/',
  zones: '/settings/zones/',
  model: '/settings/models/',
  look: '/settings/appearance/',
  data: '/settings/data/',
};

const bare = (href: string) => href.replace(/[#?].*$/, '').replace(/\/+$/, '');

export function SettingsList({ current }: { current?: string | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { watchSettings } = useWatchSettings();
  const activePresetId = useSettingsStore((s) => s.activePresetId);
  const globalMute = useSettingsStore((s) => s.globalMute);
  const quiet = useSettingsStore((s) => s.quietHoursSettings);
  const cooldown = useSettingsStore((s) => s.timingSettings.cooldownPeriod);
  const levels = useSettingsStore((s) => s.alertEscalationLevels);
  const zones = useSettingsStore((s) => s.detectionZones);
  const profileName = useAuthStore((s) => s.profile?.displayName ?? '');
  const { way, pet, read: petsRead } = useNextWay();
  const ownSounds = useOwnSoundCount();
  const now = useMinute();
  const { ask } = useNotificationAsk();
  const browserOn = useBrowserNotificationsOn();
  const onDevice = useModelOnDevice();
  const { themeMode } = useTheme();
  const { largeText } = useAccessibility();
  const { config } = useBackendStatus();
  const serverAddress = config?.apiUrl ?? '';
  // The name sent to the server, else the one this device keeps.
  const displayName = profileName || (mounted ? readNameOnDevice() : '');

  const motion = watchSettings.motionSensitivity;
  const sound = watchSettings.audioSensitivity;
  const soundOn = watchSettings.audioDetectionEnabled !== false;
  const volume = watchSettings.alertVolume;
  // Lost and Found with no pet saved runs as Motion and sound.
  const forPet = way === 'lost_found' && pet ? pet : null;
  const louderAfter = levels.find((level) => level.level === 2)?.delaySeconds ?? levels[1]?.delaySeconds ?? 0;

  const values = mounted
    ? {
        detection:
          way === 'lost_found' && !petsRead
            ? null
            : detectionValue({ settingId: activePresetId, motion, sound, soundOn, pet: forPet?.name ?? null }),
        sounds: ownSounds === null ? null : soundsValue({ volume, own: ownSounds, muted: globalMute }),
        quiet: now ? quietValue(quiet, quietHoursActiveAt(quiet, now)) : null,
        unanswered: unansweredValue(cooldown, louderAfter),
        notifications: browserOn === null ? null : notificationsValue(ask, browserOn),
        tests: TEST_ALERTS_VALUE,
        zones: zonesValue(zones),
        model: modelValue(onDevice, MODEL_SIZE_MB),
        look: lookValue(themeMode, largeText),
        data: DATA_VALUE,
      }
    : null;

  const value = (key: keyof typeof ROWS) => (values ? values[key] : null);
  const isCurrent = (href: string) => (current ? bare(current) === bare(href) : false);
  const row = (key: keyof typeof ROWS, name: string, extra?: { picture?: ReactNode; lead?: ReactNode }) => (
    <li>
      <LinkRow
        href={ROWS[key]}
        name={name}
        value={value(key)}
        valueId={`settings-value-${key}`}
        current={isCurrent(ROWS[key])}
        picture={extra?.picture}
        lead={extra?.lead}
      />
    </li>
  );

  const photo = forPet?.referenceImages?.[0];

  return (
    <nav className="set-list" aria-label="Settings pages">
      <Group id="settings-first" list>
        {row('detection', 'Detection', {
          picture: values?.detection ? <ListMeters motion={motion} sound={sound} soundOn={soundOn} /> : undefined,
          lead: values?.detection && photo ? <PetPhoto src={photo} /> : undefined,
        })}
        {row('sounds', 'Alert sounds', { picture: values?.sounds ? <VolumeBar volume={volume} /> : undefined })}
        {row('quiet', 'Quiet hours', {
          picture: values?.quiet ? <QuietBand band={quiet.enabled ? quietBand(quiet.startTime, quiet.endTime) : []} /> : undefined,
        })}
      </Group>
      <Group id="settings-alerts" heading="Alerts" list>
        {row('unanswered', 'Unanswered alerts')}
        {row('notifications', 'Notifications')}
        {row('tests', 'Test alerts')}
      </Group>
      <Group id="settings-camera" heading="Camera picture" list>
        {row('zones', 'Detection zones')}
        {row('model', 'Detection model')}
      </Group>
      <Group id="settings-device" heading="This device" list>
        {row('look', 'Look and text')}
        {row('data', 'Data on this device')}
      </Group>
      {mounted && serverAddress ? (
        <Group id="settings-server" heading="Your own server" list>
          <li>
            <LinkRow
              href="/settings/server/#address"
              name="Server address"
              value={serverAddress}
              valueId="settings-value-address"
              current={isCurrent('/settings/server/')}
            />
          </li>
          <li>
            <LinkRow
              href="/settings/server/#name"
              name="Your name on your server"
              value={displayName || undefined}
              valueId="settings-value-name"
            />
          </li>
          <li>
            <LinkRow href="/webhooks/" name="Webhooks" valueId="settings-value-webhooks" />
          </li>
          <li>
            <LinkRow href="/admin/" name="Admin" valueId="settings-value-admin" />
          </li>
        </Group>
      ) : null}
    </nav>
  );
}

export default SettingsList;
