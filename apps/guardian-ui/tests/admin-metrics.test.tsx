/** @jest-environment jsdom */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import AdminPage from '@/app/admin/page';
it('shows missing server measurements as unavailable rather than zero', async () => {
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => String(url).includes('/api/status')
    ? { healthy: true, stats: { activeStreams: 3, totalAlerts: 12, cloudFallbackRate: 0 }, ollama: { available: true, models: [] } }
    : { flags: [], total: 0 } } as Response));
  render(<AdminPage />);
  const analysis = await screen.findByText('Analysis Today');
  expect(within(analysis.parentElement!).getByText('Unavailable')).toBeTruthy();
  expect(within(screen.getByText('Active Streams').parentElement!).getByText('3')).toBeTruthy();
  expect(within(screen.getByText('CPU Usage').parentElement!).getByText('Unavailable')).toBeTruthy();
  expect(within(screen.getByText('System Uptime').parentElement!).getByText('Unavailable')).toBeTruthy();
});
