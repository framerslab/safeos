/** @jest-environment jsdom */
/**
 * The way and the pet in the address, against a choice made first
 *
 * An address that names Lost and Found and a pet is read once the saved pets
 * are read. A choice the person makes on Watch for before that read settles
 * stands: the address does not override it, and it is written to the address.
 */
import { act, renderHook } from '@testing-library/react';
import { useWatchFor } from '@/components/monitor/WatchFor';
import type { SubjectProfileDB } from '@/lib/client-db';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

// The saved pets' read, held until the test settles it.
const mockPetsRead: { settle: (pets: SubjectProfileDB[]) => void } = { settle: () => {} };
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  readSavedPets: () => new Promise((resolve) => { mockPetsRead.settle = resolve; }),
}));

const mittens: SubjectProfileDB = {
  id: 'pet-1', name: 'Mittens', type: 'pet', description: '', fingerprint: null,
  referenceImages: [], createdAt: new Date().toISOString(), lastActiveAt: null, matchCount: 0,
};

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.setState({ lostFoundChosen: false });
  useLostFoundStore.setState({ activeSubject: null, isWatching: false });
  window.history.replaceState(null, '', '/monitor/?way=lost-found&pet=pet-1');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

it('keeps Motion and sound chosen while the pets were read, and writes it to the address', async () => {
  useOnboardingStore.setState({ lostFoundChosen: true });
  const { result } = renderHook(() => useWatchFor(false));
  await act(async () => {});
  act(() => result.current.chooseWay('motion_sound'));
  await act(async () => { mockPetsRead.settle([mittens]); });
  expect(result.current.way).toBe('motion_sound');
  expect(window.location.search).toBe('?way=monitor');
});

it('opens the watch the address names when nothing was chosen first', async () => {
  const { result } = renderHook(() => useWatchFor(false));
  await act(async () => {});
  await act(async () => { mockPetsRead.settle([mittens]); });
  expect(result.current.way).toBe('lost_found');
  expect(result.current.pet?.id).toBe('pet-1');
  expect(window.location.search).toBe('?way=lost-found&pet=pet-1');
});

it('writes a choice made while the pets were read to an address that named no way', async () => {
  window.history.replaceState(null, '', '/monitor/');
  const { result } = renderHook(() => useWatchFor(false));
  await act(async () => {});
  act(() => result.current.chooseWay('lost_found'));
  await act(async () => { mockPetsRead.settle([mittens]); });
  expect(result.current.way).toBe('lost_found');
  expect(new URLSearchParams(window.location.search).get('way')).toBe('lost-found');
});
