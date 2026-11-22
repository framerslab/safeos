/** @jest-environment jsdom */
/**
 * Your own server
 *
 * The page holds the server's address, opened in the address dialog, and,
 * while an address is saved, the name this device sends to it, saved with
 * its own Save. A name the server refuses is kept as typed and the page says
 * it was not saved. Offline, Save waits and the page says why.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ServerPage from '@/app/settings/server/page';
import { useAuthStore } from '@/stores/auth-store';

let mockApiUrl = 'https://watch.example.org';
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'connected' }, config: { apiUrl: mockApiUrl } }),
}));

const NOT_SAVED = 'Your name was not saved. Try again.';
const OFFLINE = 'Your server cannot be reached while this device is offline.';

function withProfile(updateProfile: jest.Mock) {
  useAuthStore.setState({
    profile: { id: 'person-1', displayName: 'Sam', preferences: {} } as never,
    updateProfile,
  } as never);
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockApiUrl = 'https://watch.example.org';
  localStorage.clear();
});

it('opens the address dialog from Server address', () => {
  withProfile(jest.fn());
  const opened = jest.fn();
  window.addEventListener('safeos:open-backend-settings', opened);
  render(<ServerPage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Your own server' })).toBeTruthy();
  const address = screen.getByRole('button', { name: /^Server address/ });
  expect(address.closest('#address')).toBeTruthy();
  expect(address.textContent).toContain('https://watch.example.org');
  fireEvent.click(address);
  expect(opened).toHaveBeenCalledTimes(1);
  window.removeEventListener('safeos:open-backend-settings', opened);
});

it('saves the name to the server and says Saved', async () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  withProfile(updateProfile);
  render(<ServerPage />);
  const field = screen.getByRole('textbox', { name: 'Your name on your server' });
  expect(field).toHaveProperty('value', 'Sam');
  expect(field.closest('#name')).toBeTruthy();
  fireEvent.change(field, { target: { value: 'Robin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ displayName: 'Robin' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(screen.queryByText(NOT_SAVED)).toBeNull();
});

it('keeps the name as typed and says it was not saved when the server refuses', async () => {
  const updateProfile = jest.fn().mockRejectedValue(new Error('refused'));
  withProfile(updateProfile);
  render(<ServerPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name on your server' }), { target: { value: 'Robin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(NOT_SAVED)).toBeTruthy();
  const field = screen.getByRole('textbox', { name: 'Your name on your server' });
  expect(field).toHaveProperty('value', 'Robin');
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(screen.queryByText('Saved')).toBeNull();
});

it('says the name was not saved when no profile has been read yet', async () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  useAuthStore.setState({ profile: null, updateProfile } as never);
  render(<ServerPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name on your server' }), { target: { value: 'Robin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(NOT_SAVED)).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Your name on your server' })).toHaveProperty('value', 'Robin');
  expect(screen.queryByText('Saved')).toBeNull();
});

it('keeps a name typed while an earlier one is being saved', async () => {
  let finish: () => void = () => undefined;
  const updateProfile = jest.fn(() => new Promise<void>((resolve) => {
    finish = resolve;
  }));
  withProfile(updateProfile);
  render(<ServerPage />);
  const field = () => screen.getByRole('textbox', { name: 'Your name on your server' });
  fireEvent.change(field(), { target: { value: 'Robin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.change(field(), { target: { value: 'Robin Lee' } });
  await act(async () => {
    // The server takes the first name, as the store records it.
    useAuthStore.setState({ profile: { id: 'person-1', displayName: 'Robin', preferences: {} } } as never);
    finish();
  });
  expect(field()).toHaveProperty('value', 'Robin Lee');
});

it('shows the name this device keeps when the profile holds none', async () => {
  localStorage.setItem('safeos_user_settings', JSON.stringify({ displayName: 'Robin' }));
  useAuthStore.setState({ profile: { id: 'person-1', displayName: '', preferences: {} }, updateProfile: jest.fn() } as never);
  render(<ServerPage />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your name on your server' })).toHaveProperty('value', 'Robin'));
});

it('offers no name field while no server address is saved', () => {
  mockApiUrl = '';
  withProfile(jest.fn());
  render(<ServerPage />);
  expect(screen.getByRole('button', { name: /^Server address/ })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'Your name on your server' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});

it('keeps Save waiting while the device is offline, and says why', async () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  withProfile(updateProfile);
  jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
  render(<ServerPage />);
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  fireEvent.click(save);
  await act(async () => {});
  expect(updateProfile).not.toHaveBeenCalled();
});
