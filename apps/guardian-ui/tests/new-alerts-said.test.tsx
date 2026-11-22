/** @jest-environment jsdom */
/**
 * The spoken count of new alerts
 *
 * The status region says the count each time it rises after the first read,
 * and nothing when it falls. A rise to a count it said before is said again.
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NewAlertsSaid } from '@/components/app/NewAlertsCount';

afterEach(cleanup);

it('says a rise to a count it said before, after the count fell', () => {
  const view = render(<NewAlertsSaid count={0} ready />);
  const region = () => screen.getByRole('status');
  expect(region().textContent).toBe('');

  view.rerender(<NewAlertsSaid count={1} ready />);
  expect(region().textContent).toBe('1 new alert');

  view.rerender(<NewAlertsSaid count={0} ready />);
  expect(region().textContent).toBe('');

  view.rerender(<NewAlertsSaid count={1} ready />);
  expect(region().textContent).toBe('1 new alert');
});
