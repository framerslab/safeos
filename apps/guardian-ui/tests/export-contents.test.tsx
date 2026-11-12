/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ExportPage from '@/app/export/page';
import { useAuthStore } from '@/stores/auth-store';
it('describes owned monitoring settings and the full exports record limits', () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, sessionToken: 'export-session' });
  render(<ExportPage />);
  expect(screen.getByText(/monitoring profiles and active choices/i)).toBeTruthy();
  expect(screen.getByText(/1,000 streams and 5,000 each/i)).toBeTruthy();
});
