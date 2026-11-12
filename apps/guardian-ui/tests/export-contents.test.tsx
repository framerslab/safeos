/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ExportPage from '@/app/export/page';
import { useAuthStore } from '@/stores/auth-store';
it('describes owned monitoring settings and the full exports record limits', () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, sessionToken: 'export-session' });
  render(<ExportPage />);
  expect(screen.getByText(/monitoring profiles and active choices/i)).toBeTruthy();
  expect(screen.getByText(/1,000 streams and 5,000 each/i)).toBeTruthy();
});

it.each([
  ['profile', 'Profile & Settings', 2],
  ['all', 'Full Data Export', 2],
  ['profile', 'Profile & Settings', 0],
  ['all', 'Full Data Export', 0],
] as const)('reports omitted settings after a %s download (%s, count %s)', async (kind, label, omitted) => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, sessionToken: 'export-session' });
  const originalFetch = global.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const data = { monitoringSettingsOmitted: omitted, monitoringProfiles: [{ id: 'owned-profile', settings: null }] };
  const payload = kind === 'profile' ? { success: true, data } : data;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const createURL = jest.fn(() => 'blob:export');
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, headers: { get: () => null }, blob: async () => blob,
    clone: () => ({ json: async () => payload }),
  });
  URL.createObjectURL = createURL;
  URL.revokeObjectURL = jest.fn();
  try {
    render(<ExportPage />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Export' }));
    await screen.findByText(new RegExp(`Downloaded safeos-${kind}-`));
    expect(createURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    if (omitted > 0) {
      expect(screen.getByText(/2 monitoring profiles had unreadable settings left out/i)).toBeTruthy();
      expect(screen.getByText(/monitoringSettingsOmitted/)).toBeTruthy();
    } else {
      expect(screen.queryByText(/unreadable settings left out/i)).toBeNull();
    }
  } finally {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    click.mockRestore();
  }
});
