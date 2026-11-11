/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Page from '@/app/settings/notifications/page';
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it('does not persist typed provider secrets and removes legacy saved values', async () => {
  localStorage.setItem('safeos_notifications_settings', JSON.stringify({ emailEnabled: true, emailUseOwnKey: true, smsEnabled: true, smsUseOwnKey: true, emailResendApiKey: 'old-mail-secret', smsAuthToken: 'old-sms-secret' }));
  render(<Page />);
  const mail = await screen.findByLabelText('Resend API key', { selector: 'input' });
  expect(localStorage.getItem('safeos_notifications_settings')).not.toMatch(/old-mail-secret|old-sms-secret/);
  fireEvent.change(mail, { target: { value: 'new-mail-secret' } });
  fireEvent.change(screen.getByLabelText('Twilio Auth Token', { selector: 'input' }), { target: { value: 'new-sms-secret' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  const stored = localStorage.getItem('safeos_notifications_settings')!;
  expect(stored).not.toMatch(/old-mail-secret|old-sms-secret|new-mail-secret|new-sms-secret/);
  fireEvent.click(screen.getByRole('button', { name: 'Clear provider secrets' }));
  expect((mail as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Twilio Auth Token', { selector: 'input' }) as HTMLInputElement).value).toBe('');
});
