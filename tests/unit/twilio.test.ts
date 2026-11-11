/**
 * Twilio SMS Service Unit Tests
 *
 * Covers config resolution (server env vs BYO override), error paths, the
 * encoding-aware truncation helper, and the template wrappers.
 *
 * @module tests/unit/twilio
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Twilio SDK mock — captures messages.create({...}) calls without hitting the API.
// =============================================================================

const createMock = vi.fn();

vi.mock('twilio', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

let twilio: typeof import('../../src/lib/alerts/twilio.js');
let twilioFactory: any;

beforeEach(async () => {
  vi.resetModules();
  createMock.mockReset();
  createMock.mockResolvedValue({ sid: 'SM_test_sid_123' });
  // Default: server has creds
  process.env['TWILIO_ACCOUNT_SID'] = 'AC_server';
  process.env['TWILIO_AUTH_TOKEN'] = 'tok_server';
  process.env['TWILIO_PHONE_NUMBER'] = '+15550001111';

  const twilioModule = await import('twilio');
  twilioFactory = (twilioModule as any).default;
  // The mock factory is hoisted once per file in vitest; reset its call history
  // each test so .toHaveBeenCalledTimes assertions reflect just this test.
  twilioFactory.mockClear();
  twilio = await import('../../src/lib/alerts/twilio.js');
});

afterEach(() => {
  delete process.env['TWILIO_ACCOUNT_SID'];
  delete process.env['TWILIO_AUTH_TOKEN'];
  delete process.env['TWILIO_PHONE_NUMBER'];
});

// =============================================================================
// isTwilioConfigured
// =============================================================================

describe('isTwilioConfigured', () => {
  it('returns true when all three env vars are set', () => {
    expect(twilio.isTwilioConfigured()).toBe(true);
  });

  it('returns false when TWILIO_ACCOUNT_SID is missing', async () => {
    delete process.env['TWILIO_ACCOUNT_SID'];
    vi.resetModules();
    twilio = await import('../../src/lib/alerts/twilio.js');
    expect(twilio.isTwilioConfigured()).toBe(false);
  });

  it('returns false when TWILIO_AUTH_TOKEN is missing', async () => {
    delete process.env['TWILIO_AUTH_TOKEN'];
    vi.resetModules();
    twilio = await import('../../src/lib/alerts/twilio.js');
    expect(twilio.isTwilioConfigured()).toBe(false);
  });

  it('returns false when TWILIO_PHONE_NUMBER is missing', async () => {
    delete process.env['TWILIO_PHONE_NUMBER'];
    vi.resetModules();
    twilio = await import('../../src/lib/alerts/twilio.js');
    expect(twilio.isTwilioConfigured()).toBe(false);
  });
});

// =============================================================================
// sendTwilioSms
// =============================================================================

describe('sendTwilioSms', () => {
  it('uses server env credentials when no override is supplied', async () => {
    await twilio.sendTwilioSms('+15559876543', 'hello');

    expect(twilioFactory).toHaveBeenCalledWith('AC_server', 'tok_server');
    expect(createMock).toHaveBeenCalledWith({
      body: 'hello',
      from: '+15550001111',
      to: '+15559876543',
    });
  });

  it('returns sid + to + from on success', async () => {
    const result = await twilio.sendTwilioSms('+15559876543', 'hi');
    expect(result).toEqual({
      sid: 'SM_test_sid_123',
      to: '+15559876543',
      from: '+15550001111',
    });
  });

  it('uses BYO override when supplied', async () => {
    await twilio.sendTwilioSms('+15559876543', 'hi', {
      override: {
        accountSid: 'AC_user',
        authToken: 'tok_user',
        fromNumber: '+15552223333',
      },
    });

    expect(twilioFactory).toHaveBeenCalledWith('AC_user', 'tok_user');
    expect(createMock).toHaveBeenCalledWith({
      body: 'hi',
      from: '+15552223333',
      to: '+15559876543',
    });
  });

  it('partial override fills in missing fields from server env', async () => {
    await twilio.sendTwilioSms('+15559876543', 'hi', {
      override: { fromNumber: '+15554445555' },
    });

    expect(twilioFactory).toHaveBeenCalledWith('AC_server', 'tok_server');
    expect(createMock).toHaveBeenCalledWith({
      body: 'hi',
      from: '+15554445555',
      to: '+15559876543',
    });
  });

  it('throws TwilioNotConfiguredError when no credentials are available', async () => {
    delete process.env['TWILIO_ACCOUNT_SID'];
    delete process.env['TWILIO_AUTH_TOKEN'];
    delete process.env['TWILIO_PHONE_NUMBER'];
    vi.resetModules();
    twilio = await import('../../src/lib/alerts/twilio.js');

    await expect(twilio.sendTwilioSms('+15559876543', 'hi')).rejects.toBeInstanceOf(
      twilio.TwilioNotConfiguredError,
    );
  });

  it('throws TwilioNotConfiguredError when fromNumber missing everywhere', async () => {
    delete process.env['TWILIO_PHONE_NUMBER'];
    vi.resetModules();
    twilio = await import('../../src/lib/alerts/twilio.js');

    await expect(
      twilio.sendTwilioSms('+15559876543', 'hi', {
        override: { accountSid: 'AC_x', authToken: 'tok_x' },
      }),
    ).rejects.toBeInstanceOf(twilio.TwilioNotConfiguredError);
  });

  it('caches Twilio client per accountSid+authToken pair', async () => {
    await twilio.sendTwilioSms('+15559876543', 'a');
    await twilio.sendTwilioSms('+15559876543', 'b');

    // Same server creds → factory called only once
    expect(twilioFactory).toHaveBeenCalledTimes(1);

    await twilio.sendTwilioSms('+15559876543', 'c', {
      override: { accountSid: 'AC_user', authToken: 'tok_user', fromNumber: '+15552223333' },
    });

    // New creds → factory called again
    expect(twilioFactory).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// truncateForSms
// =============================================================================

describe('truncateForSms', () => {
  it('keeps short GSM-7 messages untouched', () => {
    expect(twilio.truncateForSms('hello world')).toBe('hello world');
  });

  it('truncates long GSM-7 to 153 chars with ellipsis (concat-segment limit)', () => {
    const input = 'a'.repeat(200);
    const result = twilio.truncateForSms(input);
    expect(result.length).toBe(153);
    expect(result.endsWith('...')).toBe(true);
    expect(result.startsWith('a'.repeat(150))).toBe(true);
  });

  it('keeps short UCS-2 messages untouched', () => {
    expect(twilio.truncateForSms('hello 🦁')).toBe('hello 🦁');
  });

  it('truncates long UCS-2 to 67 chars with ellipsis', () => {
    // Contains emoji, forcing UCS-2 encoding (67-char single-segment limit).
    const input = '🦁'.repeat(50) + 'extra content that should be cut';
    const result = twilio.truncateForSms(input);
    expect(result.length).toBeLessThanOrEqual(67);
    expect(result.endsWith('...')).toBe(true);
  });

  it('treats GSM-7 extension chars as GSM-safe', () => {
    // Curly braces are in the GSM-7 extension table.
    const input = '{test ' + 'a'.repeat(200) + ' end}';
    const result = twilio.truncateForSms(input);
    expect(result.length).toBe(153);
  });

  it('switches encoding decision based on a single non-GSM character', () => {
    const gsmOnly = 'a'.repeat(60);
    const withEmDash = 'a'.repeat(59) + '—'; // em dash is NOT GSM-7
    expect(twilio.truncateForSms(gsmOnly)).toBe(gsmOnly);
    expect(twilio.truncateForSms(withEmDash)).toBe(withEmDash);
    // The em-dash version is 60 chars but > UCS-2 limit (67) only if longer;
    // length 60 ≤ 67, so it stays put — but a 100-char version should truncate.
    const longWithEmDash = 'a'.repeat(99) + '—';
    const truncated = twilio.truncateForSms(longWithEmDash);
    expect(truncated.length).toBeLessThanOrEqual(67);
  });
});

// =============================================================================
// sendAlertSms
// =============================================================================

describe('sendAlertSms', () => {
  it('formats with severity tag and severity uppercase', async () => {
    await twilio.sendAlertSms('+15559876543', 'medium', 'Motion', 'Front door');

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '[SafeOS MEDIUM] Motion: Front door',
      }),
    );
  });

  it('truncates long messages before send', async () => {
    const long = 'x'.repeat(500);
    await twilio.sendAlertSms('+15559876543', 'critical', 'Title', long);

    const call = createMock.mock.calls[0][0];
    expect(call.body.length).toBe(153);
    expect(call.body.endsWith('...')).toBe(true);
    expect(call.body.startsWith('[SafeOS CRITICAL] Title:')).toBe(true);
  });

  it('forwards BYO override to underlying send', async () => {
    await twilio.sendAlertSms('+15559876543', 'high', 'T', 'M', {
      override: {
        accountSid: 'AC_byo',
        authToken: 'tok_byo',
        fromNumber: '+15553334444',
      },
    });

    expect(twilioFactory).toHaveBeenCalledWith('AC_byo', 'tok_byo');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+15553334444' }),
    );
  });
});

// =============================================================================
// sendTestSms
// =============================================================================

describe('sendTestSms', () => {
  it('sends a test message to the recipient', async () => {
    const result = await twilio.sendTestSms('+15559876543');

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15559876543',
        body: expect.stringContaining('SafeOS Guardian'),
      }),
    );
    expect(result.sid).toBe('SM_test_sid_123');
  });

  it('forwards BYO override', async () => {
    await twilio.sendTestSms('+15559876543', {
      override: { accountSid: 'AC_x', authToken: 'tok_x', fromNumber: '+15555556666' },
    });

    expect(twilioFactory).toHaveBeenCalledWith('AC_x', 'tok_x');
  });
});

// =============================================================================
// TwilioNotConfiguredError
// =============================================================================

describe('TwilioNotConfiguredError', () => {
  it('has the correct name + extends Error', () => {
    const err = new twilio.TwilioNotConfiguredError('missing creds');
    expect(err.name).toBe('TwilioNotConfiguredError');
    expect(err.message).toBe('missing creds');
    expect(err).toBeInstanceOf(Error);
  });
});
