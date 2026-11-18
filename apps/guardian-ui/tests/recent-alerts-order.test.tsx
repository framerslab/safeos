/** @jest-environment jsdom */
/**
 * The alert menu's recent cards, newest first
 *
 * A card whose event repeated is listed at its newest alert. Saved history
 * comes back in the order the cards were made, so the menu sorts by each
 * card's newest alert before it keeps ten: a card made before ten others that
 * repeated after them is listed first.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { useMonitoringStore, type Alert } from '@/stores/monitoring-store';

require('fake-indexeddb/auto');

afterEach(cleanup);

const card = (id: string, minute: number, extra: Partial<Alert> = {}): Alert => {
  const at = `2026-11-01T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return { id, streamId: 'camera', severity: 'low', message: id, createdAt: at, timestamp: at, acknowledged: false, ...extra };
};

it('lists first a card that repeated after ten cards made later than it', () => {
  // As history comes back: made newest first, the repeated card last.
  const later = Array.from({ length: 10 }, (_, i) => card(`later-${i + 1}`, 10 - i));
  const repeated = card('repeated-card', 0, { timestamp: '2026-11-01T10:20:00.000Z', repeats: 4, severity: 'critical' });
  useMonitoringStore.setState({ alerts: [...later, repeated] });

  render(<NotificationDropdown />);
  fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));

  const listed = screen.getAllByText(/^(later-\d+|repeated-card)$/).map((node) => node.textContent);
  expect(listed).toHaveLength(10);
  expect(listed[0]).toBe('repeated-card');
  expect(listed[1]).toBe('later-1');
});
