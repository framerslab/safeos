/**
 * @jest-environment jsdom
 */

/**
 * Notification Settings Page Tests
 *
 * Renders the settings page and presses its "Send test email" and "Send test
 * SMS" buttons. The server answers both routes only for a signed-in caller,
 * so each request must carry the session token.
 *
 * @module tests/notifications-settings-page.test
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: () => undefined, push: () => undefined }),
}));

jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({
    status: { api: 'connected' },
    config: { apiUrl: 'http://api.test' },
  }),
}));

jest.mock('@/stores/auth-store', () => {
  const state = {
    profile: null,
    sessionToken: 'session-token-for-test',
    updateProfile: async () => undefined,
  };
  const useAuthStore = Object.assign(() => state, { getState: () => state });
  return { useAuthStore };
});

type FetchCall = { url: string; init?: { method?: string; headers?: Record<string, string> } };

const calls: FetchCall[] = [];

function reply(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

beforeEach(() => {
  cleanup();
  calls.length = 0;
  localStorage.clear();
  localStorage.setItem(
    'safeos_notifications_settings',
    JSON.stringify({
      emailEnabled: true,
      emailRecipient: 'parent@example.com',
      smsEnabled: true,
      smsRecipient: '+15551234567',
    })
  );
  (global as any).fetch = (url: string, init?: FetchCall['init']) => {
    calls.push({ url, init });
    if (url.endsWith('/api/notifications/status')) {
      return reply({
        status: {
          pushSubscriptions: 0,
          telegramChats: 0,
          smsEnabled: true,
          telegramEnabled: false,
          emailEnabled: true,
        },
      });
    }
    if (url.endsWith('/api/notifications/test-email')) {
      return reply({ success: true, messageId: 'message-1' });
    }
    if (url.endsWith('/api/notifications/test-sms')) {
      return reply({ success: true, sid: 'sms-1' });
    }
    return reply({});
  };
});

async function press(name: RegExp): Promise<void> {
  const button = (await screen.findByRole('button', { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

function sessionHeader(path: string): string | undefined {
  const call = calls.find((c) => c.url.endsWith(path));
  return call?.init?.headers?.['X-Session-Token'];
}

describe('notification settings test buttons', () => {
  it('send the session token with the test mail', async () => {
    const Page = require('@/app/settings/notifications/page').default;
    render(<Page />);
    await press(/send test email/i);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/test-email'))).toBe(true));
    expect(sessionHeader('/api/notifications/test-email')).toBe('session-token-for-test');
  });

  it('send the session token with the test text', async () => {
    const Page = require('@/app/settings/notifications/page').default;
    render(<Page />);
    await press(/send test sms/i);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/test-sms'))).toBe(true));
    expect(sessionHeader('/api/notifications/test-sms')).toBe('session-token-for-test');
  });
});

describe('authenticated notification status and server tests', () => {
  it.each(['@/app/settings/page', '@/app/settings/notifications/page'])('loads status with the session from %s', async path => {
    const Page = require(path).default;
    render(<Page />);
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/notifications/status'))).toBe(true));
    expect(sessionHeader('/api/notifications/status')).toBe('session-token-for-test');
    if (path === '@/app/settings/page') {
      fireEvent.click(screen.getByRole('button', { name: /^notifications$/i }));
      const label = await screen.findByText('SMS provider configured');
      expect(label.parentElement?.textContent).toContain('Yes');
    } else {
      expect(await screen.findByText(/Server has Twilio configured/)).toBeTruthy();
    }
  });

  it('sends the current session from the server test button', async () => {
    const Page = require('@/app/settings/test-alerts/page').default;
    render(<Page />);
    await press(/^test push$/i);
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/notifications/test'))).toBe(true));
    expect(sessionHeader('/api/notifications/test')).toBe('session-token-for-test');
  });
});
