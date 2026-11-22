/** @jest-environment jsdom */
/**
 * Data on this device
 *
 * The page counts what this device keeps (alerts, saved pictures, pets and
 * sounds), exports the settings as a file and says so, and asks in place
 * before it clears all data: no browser confirm box, Cancel clears nothing
 * and gives focus back to the key, and while the device is offline the
 * question says SafeOS will not open again until it is back online.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import './helpers/browser-data';
import { cacheAlert, saveMatchFrame, saveSubjectProfile } from '@/lib/client-db';
import { countKept, keptOnDeviceWords } from '@/lib/kept-on-device';
import DataPage from '@/app/settings/data/page';

const mockClear = jest.fn<Promise<void>, []>();
jest.mock('@/lib/local-data', () => ({
  ...jest.requireActual('@/lib/local-data'),
  clearLocalData: () => mockClear(),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }),
}));

const QUESTION = 'Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device.';
const OFFLINE = ' SafeOS will not open again until you are back online.';

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockClear.mockReset();
});

it('says nothing is saved on a new device', async () => {
  expect(keptOnDeviceWords({ alerts: 0, pictures: 0, pets: 0, sounds: 0 })).toBe('Nothing saved on this device yet.');
  expect(await countKept()).toEqual({ alerts: 0, pictures: 0, pets: 0, sounds: 0 });
  render(<DataPage />);
  await screen.findByText('Nothing saved on this device yet.');
  expect(screen.getByRole('heading', { level: 1, name: 'Data on this device' })).toBeTruthy();
});

it('counts what this device keeps', async () => {
  await cacheAlert({ id: 'alert-1', acknowledged: false, createdAt: new Date(1000).toISOString() });
  await cacheAlert({ id: 'alert-2', acknowledged: true, createdAt: new Date(2000).toISOString() });
  await saveMatchFrame({
    id: 'match-1', subjectId: 'pet-1', frameData: 'frame', thumbnailData: 'thumb', confidence: 80, timestamp: 1000,
    details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
    region: null, acknowledged: false, notes: '', exported: false,
  });
  await saveSubjectProfile({
    id: 'pet-1', name: 'Mittens', type: 'pet', description: '', fingerprint: null, referenceImages: [],
    createdAt: new Date(0).toISOString(), lastActiveAt: null, matchCount: 0,
  });
  expect(await countKept()).toEqual({ alerts: 2, pictures: 1, pets: 1, sounds: 0 });
  expect(keptOnDeviceWords({ alerts: 2, pictures: 1, pets: 1, sounds: 0 })).toBe('2 alerts, 1 saved picture, 1 pet, 0 sounds');
  expect(keptOnDeviceWords({ alerts: 1, pictures: 2, pets: 2, sounds: 1 })).toBe('1 alert, 2 saved pictures, 2 pets, 1 sound');
  render(<DataPage />);
  await screen.findByText('2 alerts, 1 saved picture, 1 pet, 0 sounds');
});

it('asks in place before clearing, and clears nothing on Cancel', async () => {
  const confirmBox = jest.spyOn(window, 'confirm');
  const clear = mockClear.mockResolvedValue(undefined);
  jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(true);
  render(<DataPage />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  const question = screen.getByText(QUESTION);
  expect(question.textContent).toBe(QUESTION);
  expect(document.activeElement).toBe(question);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(clear).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear all data on this device' }));
  expect(confirmBox).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
  await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
  expect(confirmBox).not.toHaveBeenCalled();
});

it('says so when clearing fails', async () => {
  mockClear.mockRejectedValue(new Error('blocked'));
  render(<DataPage />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
  await screen.findByText('Could not clear all local data. Please try again.');
});

it('adds the offline sentence while the device is offline', async () => {
  jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
  const clear = mockClear.mockResolvedValue(undefined);
  render(<DataPage />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  expect(screen.getByText(QUESTION + OFFLINE)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(clear).not.toHaveBeenCalled();
});

it('downloads the settings as a file and says so', async () => {
  jest.useFakeTimers({
    now: new Date(2026, 10, 22, 9, 30, 0),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'queueMicrotask'],
  });
  const made: Blob[] = [];
  const createObjectURL = jest.fn((blob: Blob) => {
    made.push(blob);
    return 'blob:settings';
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: jest.fn() });
  const downloads: string[] = [];
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  try {
    render(<DataPage />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Export settings' }));
    expect(downloads).toEqual(['safeos-settings-2026-11-22.json']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(made[0].type).toBe('application/json');
    const status = await screen.findByText('Downloaded safeos-settings-2026-11-22.json.');
    expect(status.closest('[role="status"]')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
