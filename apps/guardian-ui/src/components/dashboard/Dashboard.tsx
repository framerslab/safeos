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
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { getAllSubjectProfiles, type SubjectProfileDB } from '@/lib/client-db';
import { useDeviceAlerts } from '@/lib/device-alerts';
import { useSetupState } from '@/lib/use-setup-done';
import { useWebSocket } from '@/lib/websocket';
import { useMonitoringStore } from '@/stores/monitoring-store';
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

/**
 * On a device with its own server connected, the dashboard keeps that
 * server's socket open, which starts the device's session there, and adds the
 * alerts the server sends. safeos.sh as served connects to no server.
 */
function useServerAlerts(): void {
  const { status, config } = useBackendStatus();
  const addAlert = useMonitoringStore((state) => state.addAlert);
  const connected = status.api === 'connected' && !!config.apiUrl;
  useWebSocket(connected ? config.wsUrl : '', {
    onMessage: (message) => {
      if (message.type === 'alert') addAlert(message.payload);
    },
  });
}

export function Dashboard() {
  useServerAlerts();
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
