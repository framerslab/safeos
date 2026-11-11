'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Device identifiers stay in this browser and are never sent to the server. */
export const useCameraStore = create<{
  deviceId: string;
  setDeviceId: (deviceId: string) => void;
}>()(persist((set) => ({
  deviceId: '',
  setDeviceId: (deviceId) => set({ deviceId }),
}), { name: 'safeos-camera' }));
