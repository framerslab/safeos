/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BackendStatusProvider } from '@/contexts/BackendStatusContext';
import { BackendSettings } from '@/components/BackendSettings';
import ExportPage from '@/app/export/page';
import { useAuthStore } from '@/stores/auth-store';

it('uses a server saved in Settings for exports in a static build', async () => {
  process.env.NEXT_PUBLIC_STATIC_MODE = 'true';
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
  const settings = render(<BackendStatusProvider><BackendSettings isModal onClose={() => {}} /></BackendStatusProvider>);
  fireEvent.change(screen.getByPlaceholderText('https://safeos-api.yourdomain.com'), { target: { value: 'https://api.example.test' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  await waitFor(() => expect(localStorage.getItem('safeos_backend_config')).toContain('https://api.example.test'));
  settings.unmount();
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, sessionToken: 'test-session' });
  render(<ExportPage />);
  fireEvent.click(screen.getByRole('button', { name: /download export/i }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/export/alerts?format=json', expect.anything()));
  delete process.env.NEXT_PUBLIC_STATIC_MODE;
});
