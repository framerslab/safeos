/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPage from '@/app/admin/page';

it.each([['Approve', 'approved'], ['Reject', 'rejected'], ['Escalate', 'escalated']])('%s sends the server review status', async (label, expected) => {
  const requests: string[] = [];
  global.fetch = jest.fn(async (_url, init) => {
    if (init?.method === 'POST') requests.push(JSON.parse(String(init.body)).action);
    return { ok: true, json: async () => ({ data: [{ id: 'flag-1', streamId: 'stream-1', category: 'review', tier: 1, reason: 'Needs review', status: 'pending', createdAt: new Date().toISOString() }] }) } as Response;
  });
  render(<AdminPage />);
  fireEvent.click(await screen.findByRole('button', { name: /^reviews/i }));
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(requests).toEqual([expected]));
});
