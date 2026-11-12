/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPage from '@/app/privacy/page';
it('states saved-history protection, new alert limits, no age removal and tab update guidance', () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/alerts saved before this update/i)).toBeTruthy();
  expect(screen.getByText(/100 monitoring alerts/i)).toBeTruthy();
  expect(screen.getByText(/500 alerts/i)).toBeTruthy();
  expect(screen.getByText(/acknowledged alerts.*first/i)).toBeTruthy();
  expect(screen.getByText(/never removed because of.*age/i)).toBeTruthy();
  expect(screen.getByText(/other SafeOS tabs/i)).toBeTruthy();
  expect(screen.getByText(/November 12, 2026/)).toBeTruthy();
});
