/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SystemStatus } from '@/components/SystemStatus';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'connected', ollama: 'connected' }, config: { apiUrl: 'https://api.example.test', ollamaUrl: '' } }) }));
const stats = { activeStreams: 1, totalAlerts: 0, pendingAlerts: 0, systemHealth: 'healthy' as const, ollamaStatus: 'online' as const, analysisQueueSize: 0, cloudFallbackRate: 0 };
beforeEach(() => {
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal });
});
it('describes installed models without inventing their running state', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ollama: { available: true, models: [{ name: 'moondream', size: '1 GB' }] } }) } as Response));
  render(<SystemStatus stats={stats} />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand system details' }));
  await screen.findByText('moondream');
  expect(screen.getByText('Installed; running state unavailable')).toBeTruthy();
});
