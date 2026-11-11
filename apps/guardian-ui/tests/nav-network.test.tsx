/** @jest-environment jsdom */
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { Nav } from '@/components/layout/Nav';
jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

afterEach(cleanup);
it.each([null, JSON.stringify({ count: 42, fetchedAt: 0 })])('does not contact another host before agreement (cache %s)', (cache) => {
  localStorage.clear();
  if (cache) localStorage.setItem('safeos_github_stars', cache);
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = fetchMock;
  render(<Nav />);
  expect(fetchMock).not.toHaveBeenCalled();
});
