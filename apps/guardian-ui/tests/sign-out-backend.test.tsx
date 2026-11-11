/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeCaches } from './helpers/browser-data';
import { BackendStatusProvider, useBackendStatus } from '@/contexts/BackendStatusContext';
import { AuthButton } from '@/components/AuthButton';
import { useAuthStore } from '@/stores/auth-store';
import { getApiUrl } from '@/lib/env';
function ServerAddress() {
  const { config } = useBackendStatus();
  return <output aria-label="Connected server">{config.apiUrl}</output>;
}
it('keeps the selected server consistent across account sign-out', async () => {
  process.env.NEXT_PUBLIC_STATIC_MODE = 'true';
  fakeCaches();
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test', wsUrl: '', ollamaUrl: '', configured: true }));
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ollama: { available: true, models: [] } }) } as Response));
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, isGuest: false, sessionToken: 'review-session' });
  render(<BackendStatusProvider><AuthButton /><ServerAddress /></BackendStatusProvider>);
  await screen.findByText('https://api.example.test');
  fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
  await waitFor(() => expect(useAuthStore.getState().sessionToken).toBeNull());
  expect(getApiUrl()).toBe('https://api.example.test');
  expect(screen.getByLabelText('Connected server').textContent).toBe(getApiUrl());
  delete process.env.NEXT_PUBLIC_STATIC_MODE;
});
