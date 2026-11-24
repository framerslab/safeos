/**
 * Settings
 *
 * One list of every settings page, each row with its value. On a phone the
 * look row and the Help row stand above it. Every value saves the moment it
 * moves, so the page has no Save key; a browser that refuses storage is told
 * so at the top.
 *
 * @module app/settings/page
 */

'use client';

import { useEffect } from 'react';
import { hydrateSavedSettings } from '@/lib/settings-hydration';
import { useAuthStore } from '@/stores/auth-store';
import { PhoneRows } from '@/components/settings/PhoneRows';
import { PageHead } from '@/components/settings/PageHead';
import { StorageLine } from '@/components/settings/StorageLine';
import { SettingsList } from '@/components/settings/SettingsList';

export default function SettingsPage() {
  const { profile } = useAuthStore();

  // Preferences a person saved before the shared store held them are read
  // once when the page opens.
  useEffect(() => {
    hydrateSavedSettings(profile);
  }, [profile]);

  return (
    <>
      <PhoneRows />
      <div className="settings look-part">
        <div className="settings-page">
          <PageHead title="Settings" lead="Kept on this device. A change saves the moment you make it." back={false} />
          <StorageLine />
          <SettingsList />
        </div>
      </div>
    </>
  );
}
