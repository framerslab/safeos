/**
 * The dashboard
 *
 * Whether this device is watching and the one key that starts it, the four
 * ways to watch, and the alerts since the person last looked. A device whose
 * setup is not done sees the same page, with Start setup as its one key.
 *
 * @module components/dashboard/Dashboard
 */

'use client';

import { useEffect, useState } from 'react';
import { getAllSubjectProfiles, type SubjectProfileDB } from '@/lib/client-db';
import { useDeviceAlerts } from '@/lib/device-alerts';
import { useSetupState } from '@/lib/use-setup-done';
import { SinceYouLastLooked } from './SinceYouLastLooked';
import { WatchState } from './WatchState';
import { WaysToWatch } from './WaysToWatch';

/** Every saved Lost and Found subject, read once when the page opens; null until read, [] when the read fails. */
export function useSavedSubjects(): SubjectProfileDB[] | null {
  const [subjects, setSubjects] = useState<SubjectProfileDB[] | null>(null);
  useEffect(() => {
    let live = true;
    getAllSubjectProfiles()
      .then((saved) => {
        if (live) setSubjects(saved);
      })
      // A list that cannot be read counts as no pet saved.
      .catch(() => {
        if (live) setSubjects([]);
      });
    return () => {
      live = false;
    };
  }, []);
  return subjects;
}

export function Dashboard() {
  const setUp = useSetupState();
  const subjects = useSavedSubjects();
  const { status, newAlerts } = useDeviceAlerts();
  return (
    <main className="dash">
      <WatchState setUp={setUp} subjects={subjects} newAlerts={status === 'ready' ? newAlerts.length : 0} />
      <WaysToWatch setUp={setUp} subjects={subjects} />
      <SinceYouLastLooked />
    </main>
  );
}

export default Dashboard;
