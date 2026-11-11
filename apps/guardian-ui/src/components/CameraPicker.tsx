'use client';

import { useEffect, useId, useState } from 'react';
import { useCameraStore } from '../stores/camera-store';

export function CameraPicker({ refreshKey = false }: { refreshKey?: boolean }) {
  const id = useId();
  const { deviceId, setDeviceId } = useCameraStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState(false);
  const [availabilityKnown, setAvailabilityKnown] = useState(false);

  useEffect(() => {
    let active = true;
    let request = 0;
    const media = navigator.mediaDevices;
    const refresh = async () => {
      const current = ++request;
      try {
        const available = await media.enumerateDevices();
        if (!active || request !== current) return;
        const cameras = available.filter(device => device.kind === 'videoinput');
        const identitiesHidden = cameras.some(device => !device.deviceId);
        setAvailabilityKnown(known => !identitiesHidden && (known || refreshKey || cameras.length > 0));
        setDevices(cameras.filter(device => device.deviceId));
        setError(false);
      } catch {
        if (active && request === current) { setError(true); setAvailabilityKnown(false); }
      }
    };
    void refresh();
    media?.addEventListener('devicechange', refresh);
    return () => { active = false; media?.removeEventListener('devicechange', refresh); };
  }, [refreshKey]);

  const unlisted = deviceId && !devices.some(device => device.deviceId === deviceId);
  const missing = unlisted && availabilityKnown;
  return (
    <div className="p-4 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-steel-300)]">Camera</label>
      <select
        id={id}
        value={deviceId}
        onChange={(event) => setDeviceId(event.target.value)}
        className="w-full min-h-11 rounded-lg border border-[var(--color-steel-600)] bg-[var(--color-steel-900)] px-3 py-2 text-sm text-[var(--color-steel-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
        aria-describedby={`${id}-help`}
      >
        <option value="">Default camera</option>
        {unlisted && <option value={deviceId}>{missing ? 'Saved camera (unavailable)' : 'Saved camera (permission required)'}</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
        ))}
      </select>
      <p id={`${id}-help`} className="text-sm text-[var(--color-steel-400)]">
        {error ? 'Camera list unavailable. Check browser permissions.' : missing
          ? 'Reconnect the saved camera or choose another camera.'
          : 'Choice is saved on this device. Camera names may appear after access is granted.'}
      </p>
    </div>
  );
}
