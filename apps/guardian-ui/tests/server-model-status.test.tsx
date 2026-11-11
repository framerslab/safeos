/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ModelsPage from '@/app/settings/models/page';
import { BackendStatusProvider } from '@/contexts/BackendStatusContext';
import { BackendSettings } from '@/components/BackendSettings';
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

beforeEach(() => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test', wsUrl: '', ollamaUrl: 'http://ollama:11434', configured: true }));
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal });
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith('https://api.example.test')) return { ok: true, json: async () => ({ ollama: { available: true, models: [{ name: 'moondream' }] } }) } as Response;
    throw new TypeError('Host not reachable from browser');
  });
});
it('shows models that only the SafeOS server can reach', async () => {
  render(<ModelsPage />);
  await screen.findByText('Connected');
  expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/status', expect.anything());
  expect((global.fetch as jest.Mock).mock.calls.every(([url]) => String(url).startsWith('https://api.example.test'))).toBe(true);
});
it('checks the model server through SafeOS in backend settings', async () => {
  render(<BackendStatusProvider><BackendSettings isModal onClose={() => {}} /></BackendStatusProvider>);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/status', expect.anything()));
  expect((global.fetch as jest.Mock).mock.calls.every(([url]) => String(url).startsWith('https://api.example.test'))).toBe(true);
});
