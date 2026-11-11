/**
 * Notification Settings Page
 *
 * Per-channel notification configuration. Email (Resend) lives here because
 * it carries per-user credentials and a recipient address — the rest of the
 * main /settings page handles app-wide preferences only.
 *
 * @module app/settings/notifications/page
 */

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { useSettingsStore } from '@/stores/settings-store';
import { hydrateSavedSettings } from '@/lib/settings-hydration';
import { useAuthStore } from '../../../stores/auth-store';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import {
  IconBell,
  IconMail,
  IconMessageSquare,
  IconPhone,
  IconCheck,
  IconWarning,
  IconExternalLink,
  IconShield,
} from '@/components/icons';
import { HelpTooltip } from '@/components/HelpTooltip';

// =============================================================================
// Types
// =============================================================================

interface NotificationsSettings {
  /** Browser Push — works fully offline (PWA). */
  browserPush: boolean;
  /** Email alerts via Resend. Fires only when enabled AND recipient set. */
  emailEnabled: boolean;
  emailRecipient: string;
  /** When true, the user supplies their own Resend API key + sender. */
  emailUseOwnKey: boolean;
  emailResendApiKey: string;
  emailSenderOverride: string;
  /** SMS alerts via Twilio. Fires only when enabled AND number set. */
  smsEnabled: boolean;
  smsRecipient: string;
  /** When true, the user supplies their own Twilio account SID + auth token + number. */
  smsUseOwnKey: boolean;
  smsAccountSid: string;
  smsAuthToken: string;
  smsFromNumber: string;
  /** Telegram is server-managed — no per-user bot tokens. */
  telegramEnabled: boolean;
  /** Quiet hours (24h HH:MM). */
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Minimum severity to deliver outside of in-app browser alerts. */
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
}

interface ServerStatus {
  pushSubscriptions: number;
  telegramChats: number;
  smsEnabled: boolean;
  telegramEnabled: boolean;
  emailEnabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'safeos_notifications_settings';

const DEFAULTS: NotificationsSettings = {
  browserPush: true,
  emailEnabled: false,
  emailRecipient: '',
  emailUseOwnKey: false,
  emailResendApiKey: '',
  emailSenderOverride: '',
  smsEnabled: false,
  smsRecipient: '',
  smsUseOwnKey: false,
  smsAccountSid: '',
  smsAuthToken: '',
  smsFromNumber: '',
  telegramEnabled: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  minSeverity: 'medium',
};

// =============================================================================
// Helpers
// =============================================================================

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** E.164 phone number — leading +, country code, 7–14 more digits. */
function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value.trim());
}

function loadFromStorage(): NotificationsSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    const settings = { ...DEFAULTS, ...parsed, emailResendApiKey: '', smsAuthToken: '' };
    // Remove credentials saved by older versions as soon as this page opens.
    saveToStorage(settings);
    return settings;
  } catch {
    return DEFAULTS;
  }
}

function saveToStorage(settings: NotificationsSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const { emailResendApiKey, smsAuthToken, ...preferences } = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('[Notifications] failed to persist settings:', error);
  }
}

// =============================================================================
// Page
// =============================================================================

export default function NotificationsSettingsPage() {
  const { profile, updateProfile, sessionToken } = useAuthStore();
  const { quietHoursSettings, updateQuietHoursSettings } = useSettingsStore();
  const { status: backendStatus, config: backendConfig } = useBackendStatus();

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<NotificationsSettings>(DEFAULTS);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverStatusError, setServerStatusError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [testEmailStatus, setTestEmailStatus] = useState<
    { type: 'idle' } | { type: 'sending' } | { type: 'success'; messageId: string } | { type: 'error'; message: string }
  >({ type: 'idle' });

  const [testSmsStatus, setTestSmsStatus] = useState<
    { type: 'idle' } | { type: 'sending' } | { type: 'success'; sid: string } | { type: 'error'; message: string }
  >({ type: 'idle' });

  // ---------------------------------------------------------------------------
  // Hydrate
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setMounted(true);
    const stored = loadFromStorage();
    hydrateSavedSettings(profile);
    const shared = useSettingsStore.getState().quietHoursSettings;
    setSettings({ ...stored, quietHoursEnabled: shared.enabled, quietHoursStart: shared.startTime, quietHoursEnd: shared.endTime });
  }, []);

  useEffect(() => {
    hydrateSavedSettings(profile);
    if (!profile?.notificationSettings) return;
    setSettings((prev) => ({
      ...prev,
      browserPush: profile.notificationSettings?.browserPush ?? prev.browserPush,
      smsEnabled: profile.notificationSettings?.sms ?? prev.smsEnabled,
      telegramEnabled: profile.notificationSettings?.telegram ?? prev.telegramEnabled,
    }));
  }, [profile]);

  // ---------------------------------------------------------------------------
  // Keep both settings pages on the same schedule.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setSettings((prev) => ({ ...prev, quietHoursEnabled: quietHoursSettings.enabled, quietHoursStart: quietHoursSettings.startTime, quietHoursEnd: quietHoursSettings.endTime }));
  }, [quietHoursSettings]);

  // ---------------------------------------------------------------------------
  // Fetch server status
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (backendStatus.api !== 'connected') return;

    const controller = new AbortController();
    fetch(`${backendConfig.apiUrl}/api/notifications/status`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.status) setServerStatus(json.status);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setServerStatusError(err.message ?? 'Could not reach server');
      });

    return () => controller.abort();
  }, [backendStatus.api, backendConfig.apiUrl]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const update = useCallback(<K extends keyof NotificationsSettings>(key: K, value: NotificationsSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveToStorage(next);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    saveToStorage(settings);
    updateQuietHoursSettings({ enabled: settings.quietHoursEnabled, startTime: settings.quietHoursStart, endTime: settings.quietHoursEnd });

    try {
      await updateProfile({
        notificationSettings: {
          browserPush: settings.browserPush,
          sms: settings.smsEnabled,
          telegram: settings.telegramEnabled,
          quietHoursStart: settings.quietHoursEnabled ? settings.quietHoursStart : null,
          quietHoursEnd: settings.quietHoursEnabled ? settings.quietHoursEnd : null,
        } as any,
      });
      setSaveMessage({ type: 'success', text: 'Notification settings saved.' });
    } catch (error) {
      console.error('[Notifications] save failed:', error);
      setSaveMessage({
        type: 'success',
        text: 'Saved locally. Sync to server failed — will retry next time you connect.',
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }, [settings, updateProfile, updateQuietHoursSettings]);

  // ---------------------------------------------------------------------------
  // Test email
  // ---------------------------------------------------------------------------

  const canTestEmail = useMemo(() => {
    if (!settings.emailEnabled) return false;
    if (!isValidEmail(settings.emailRecipient)) return false;
    if (settings.emailUseOwnKey) {
      return settings.emailResendApiKey.trim().length > 0;
    }
    return serverStatus?.emailEnabled === true;
  }, [settings, serverStatus]);

  const handleTestEmail = useCallback(async () => {
    if (!canTestEmail) return;
    if (backendStatus.api !== 'connected') {
      setTestEmailStatus({ type: 'error', message: 'Monitoring server is unreachable.' });
      return;
    }

    setTestEmailStatus({ type: 'sending' });

    try {
      const body: Record<string, string> = { to: settings.emailRecipient.trim() };
      if (settings.emailUseOwnKey) {
        body.resendApiKey = settings.emailResendApiKey.trim();
        if (settings.emailSenderOverride.trim()) {
          body.fromOverride = settings.emailSenderOverride.trim();
        }
      }

      // The server answers this route only for a signed-in caller.
      const res = await fetch(`${backendConfig.apiUrl}/api/notifications/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }

      setTestEmailStatus({ type: 'success', messageId: data.messageId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestEmailStatus({ type: 'error', message });
    }
  }, [canTestEmail, backendStatus.api, backendConfig.apiUrl, settings, sessionToken]);

  // ---------------------------------------------------------------------------
  // Test SMS (Twilio)
  // ---------------------------------------------------------------------------

  const canTestSms = useMemo(() => {
    if (!settings.smsEnabled) return false;
    if (!isValidPhone(settings.smsRecipient)) return false;
    if (settings.smsUseOwnKey) {
      return (
        settings.smsAccountSid.trim().length > 0 &&
        settings.smsAuthToken.trim().length > 0 &&
        isValidPhone(settings.smsFromNumber)
      );
    }
    return serverStatus?.smsEnabled === true;
  }, [settings, serverStatus]);

  const handleTestSms = useCallback(async () => {
    if (!canTestSms) return;
    if (backendStatus.api !== 'connected') {
      setTestSmsStatus({ type: 'error', message: 'Monitoring server is unreachable.' });
      return;
    }

    setTestSmsStatus({ type: 'sending' });

    try {
      const body: Record<string, string> = { to: settings.smsRecipient.trim() };
      if (settings.smsUseOwnKey) {
        body.twilioAccountSid = settings.smsAccountSid.trim();
        body.twilioAuthToken = settings.smsAuthToken.trim();
        body.twilioFromNumber = settings.smsFromNumber.trim();
      }

      // The server answers this route only for a signed-in caller.
      const res = await fetch(`${backendConfig.apiUrl}/api/notifications/test-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }

      setTestSmsStatus({ type: 'success', sid: data.sid });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestSmsStatus({ type: 'error', message });
    }
  }, [canTestSms, backendStatus.api, backendConfig.apiUrl, settings, sessionToken]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const apiOnline = backendStatus.api === 'connected';
  const serverHasResend = serverStatus?.emailEnabled === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <BackButton className="mb-4" />

        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Notifications</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            How SafeOS Guardian reaches you when something is detected. Browser push works offline.
            Email, SMS, and Telegram require an online monitoring server.
          </p>
        </header>

        {saveMessage && (
          <div
            role="status"
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              saveMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/15 border border-red-500/30 text-red-200'
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        <div className="mb-6 p-4 text-sm text-slate-300 border border-slate-700 rounded-lg">
          <p>Provider secrets stay in memory while this page is open. They are not saved in browser storage.
            Enter them again after leaving this page. Test messages send them to your configured SafeOS server.</p>
          <button type="button" className="mt-2 underline" onClick={() => {
            update('emailResendApiKey', '');
            update('smsAuthToken', '');
          }}>Clear provider secrets</button>
        </div>

        {/* Backend status banner */}
        {!apiOnline && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/40 rounded-lg">
            <div className="flex items-start gap-3">
              <IconWarning size={20} className="text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-100">
                <p className="font-semibold mb-1">No monitoring server connected</p>
                <p className="text-amber-100/90 leading-relaxed">
                  Email, SMS, and Telegram alerts require a SafeOS API server. Browser push still
                  works on this device while the app is open. See{' '}
                  <Link href="/help/integrations" className="underline">
                    integration setup
                  </Link>{' '}
                  for details.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ----- Browser push --------------------------------------------- */}
        <Section icon={<IconBell size={18} />} title="Browser push" subtitle="Works offline, on this device.">
          <Toggle
            label="Send browser notifications"
            description="Show OS-level notifications when motion, sound, or distress is detected."
            checked={settings.browserPush}
            onChange={(v) => update('browserPush', v)}
          />
        </Section>

        {/* ----- Email (Resend) ------------------------------------------- */}
        <Section
          icon={<IconMail size={18} />}
          title="Email alerts"
          subtitle={
            apiOnline
              ? serverHasResend
                ? 'Server has Resend configured — toggle on and add your address.'
                : 'Server has no Resend key. Add your own key below to send email alerts.'
              : 'Connect a monitoring server to send email alerts.'
          }
        >
          <Toggle
            label="Enable email alerts"
            description="Only sends when this toggle is ON AND a recipient address is set."
            checked={settings.emailEnabled}
            onChange={(v) => update('emailEnabled', v)}
          />

          {settings.emailEnabled && (
            <div className="mt-4 space-y-4 border-t border-slate-700/50 pt-4">
              <Field
                label="Recipient email"
                htmlFor="email-recipient"
                tooltip={{
                  label: 'Help: recipient email',
                  body: (
                    <>
                      Where SafeOS sends alert emails. Use any address you check.
                      Only fires for medium / high / critical severity events — info / low stay in-app.
                    </>
                  ),
                }}
              >
                <input
                  id="email-recipient"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={settings.emailRecipient}
                  onChange={(e) => update('emailRecipient', e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                {settings.emailRecipient && !isValidEmail(settings.emailRecipient) && (
                  <p className="mt-1 text-xs text-amber-300">Doesn&apos;t look like a valid email address.</p>
                )}
              </Field>

              <Toggle
                label="Use my own Resend account"
                description={
                  <>
                    Paste your own Resend API key + verified sender so emails come from your domain.
                    Required if the server has no Resend key.{' '}
                    <Link href="/help/integrations/resend" className="text-emerald-300 underline-offset-2 hover:underline">
                      How do I set up Resend?
                    </Link>
                  </>
                }
                checked={settings.emailUseOwnKey}
                onChange={(v) => update('emailUseOwnKey', v)}
              />

              {settings.emailUseOwnKey && (
                <div className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                  <Field
                    label="Resend API key"
                    htmlFor="resend-key"
                    tooltip={{
                      label: 'Help: Resend API key',
                      body: (
                        <>
                          A long token starting with <code className="px-1 bg-slate-900 rounded">re_</code>. Create one at{' '}
                          <a
                            href="https://resend.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 underline-offset-2 hover:underline"
                          >
                            resend.com/api-keys
                          </a>{' '}
                          (give it <strong>Sending access</strong>). Free tier covers 3,000 emails/month.
                          Stored only in this browser&apos;s local storage.
                        </>
                      ),
                    }}
                  >
                    <input
                      id="resend-key"
                      type="password"
                      autoComplete="off"
                      value={settings.emailResendApiKey}
                      onChange={(e) => update('emailResendApiKey', e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Get one at{' '}
                      <a
                        href="https://resend.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
                      >
                        resend.com/api-keys
                        <IconExternalLink size={12} />
                      </a>
                      . Stored only on this device.
                    </p>
                  </Field>

                  <Field
                    label="Sender address (From)"
                    htmlFor="resend-sender"
                    tooltip={{
                      label: 'Help: sender address',
                      body: (
                        <>
                          The <code className="px-1 bg-slate-900 rounded">From:</code> address recipients see.
                          Must be on a domain you&apos;ve <strong>verified in Resend</strong> (Domains tab — adds SPF + DKIM DNS).
                          For testing, leave blank and the server falls back to its default.
                        </>
                      ),
                    }}
                  >
                    <input
                      id="resend-sender"
                      type="text"
                      autoComplete="off"
                      value={settings.emailSenderOverride}
                      onChange={(e) => update('emailSenderOverride', e.target.value)}
                      placeholder='SafeOS Alerts <alerts@yourdomain.com>'
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Must be a domain verified in your Resend account. Leave blank to use the server&apos;s
                      default sender.
                    </p>
                  </Field>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={!canTestEmail || testEmailStatus.type === 'sending' || !apiOnline}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                >
                  {testEmailStatus.type === 'sending' ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <IconMail size={14} />
                      Send test email
                    </>
                  )}
                </button>

                <Link
                  href="/help/integrations/resend"
                  className="text-xs text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
                >
                  How do I set up Resend?
                  <IconExternalLink size={12} />
                </Link>
              </div>

              {testEmailStatus.type === 'success' && (
                <div className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-200 inline-flex items-center gap-2">
                  <IconCheck size={14} />
                  Test email queued (message id <span className="font-mono">{testEmailStatus.messageId.slice(0, 8)}…</span>). Check your inbox.
                </div>
              )}
              {testEmailStatus.type === 'error' && (
                <div className="px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-200">
                  Test failed: {testEmailStatus.message}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ----- SMS (Twilio) --------------------------------------------- */}
        <Section
          icon={<IconPhone size={18} />}
          title="SMS alerts"
          subtitle={
            apiOnline
              ? serverStatus?.smsEnabled
                ? 'Server has Twilio configured — toggle on and add your phone number.'
                : 'Server has no Twilio credentials. Add your own below to send SMS alerts.'
              : 'Connect a monitoring server to send SMS alerts.'
          }
        >
          <Toggle
            label="Enable SMS alerts"
            description="Only sends when this toggle is ON AND a recipient number is set. SMS fires for high + critical severity."
            checked={settings.smsEnabled}
            onChange={(v) => update('smsEnabled', v)}
          />

          {settings.smsEnabled && (
            <div className="mt-4 space-y-4 border-t border-slate-700/50 pt-4">
              <Field
                label="Recipient phone number"
                htmlFor="sms-recipient"
                tooltip={{
                  label: 'Help: recipient phone number',
                  body: (
                    <>
                      Phone number that receives alert texts. Must be in <strong>E.164 format</strong>:
                      leading <code className="px-1 bg-slate-900 rounded">+</code> then country code then digits.
                      Example: <code className="px-1 bg-slate-900 rounded">+15551234567</code> (US),
                      <code className="px-1 bg-slate-900 rounded">+447700900123</code> (UK).
                    </>
                  ),
                }}
              >
                <input
                  id="sms-recipient"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={settings.smsRecipient}
                  onChange={(e) => update('smsRecipient', e.target.value)}
                  placeholder="+15551234567"
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                {settings.smsRecipient && !isValidPhone(settings.smsRecipient) && (
                  <p className="mt-1 text-xs text-amber-300">
                    Use E.164 format: <code className="px-1 bg-slate-900 rounded">+15551234567</code>
                  </p>
                )}
              </Field>

              <Toggle
                label="Use my own Twilio account"
                description={
                  <>
                    Paste your own Twilio Account SID + Auth Token + From number. Required if the
                    server has no Twilio credentials.{' '}
                    <Link href="/help/integrations/twilio" className="text-emerald-300 underline-offset-2 hover:underline">
                      How do I set up Twilio?
                    </Link>
                  </>
                }
                checked={settings.smsUseOwnKey}
                onChange={(v) => update('smsUseOwnKey', v)}
              />

              {settings.smsUseOwnKey && (
                <div className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                  <Field
                    label="Twilio Account SID"
                    htmlFor="twilio-sid"
                    tooltip={{
                      label: 'Help: Twilio Account SID',
                      body: (
                        <>
                          Unique ID for your Twilio account, starts with{' '}
                          <code className="px-1 bg-slate-900 rounded">AC</code> followed by 32 hex chars.
                          Find it on your{' '}
                          <a
                            href="https://console.twilio.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 underline-offset-2 hover:underline"
                          >
                            Twilio Console dashboard
                          </a>{' '}
                          under <strong>Account Info</strong>. Not a secret — safe to share for support requests.
                        </>
                      ),
                    }}
                  >
                    <input
                      id="twilio-sid"
                      type="text"
                      autoComplete="off"
                      value={settings.smsAccountSid}
                      onChange={(e) => update('smsAccountSid', e.target.value)}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Find at{' '}
                      <a
                        href="https://console.twilio.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
                      >
                        console.twilio.com
                        <IconExternalLink size={12} />
                      </a>{' '}
                      → Account Info.
                    </p>
                  </Field>

                  <Field
                    label="Twilio Auth Token"
                    htmlFor="twilio-token"
                    tooltip={{
                      label: 'Help: Twilio Auth Token',
                      body: (
                        <>
                          <strong>Secret</strong> — treat like a password. Shown only on first reveal
                          in the Twilio Console; rotate via <strong>Account → API Credentials</strong>.
                          Stored only in this browser&apos;s local storage and sent to your monitoring
                          server only when an alert fires.
                        </>
                      ),
                    }}
                  >
                    <input
                      id="twilio-token"
                      type="password"
                      autoComplete="off"
                      value={settings.smsAuthToken}
                      onChange={(e) => update('smsAuthToken', e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••"
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Reveal on the Twilio Console under <strong>Account Info</strong>. Treat like a password.
                    </p>
                  </Field>

                  <Field
                    label="From number"
                    htmlFor="twilio-from"
                    tooltip={{
                      label: 'Help: From number',
                      body: (
                        <>
                          A phone number you <strong>own in Twilio</strong> (purchased or ported).
                          E.164 format. Buy at{' '}
                          <a
                            href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 underline-offset-2 hover:underline"
                          >
                            Console → Phone Numbers → Buy a number
                          </a>
                          {' '}(~$1/month + ~$0.0079 per outbound SMS in the US). Trial accounts can only
                          send to verified numbers.
                        </>
                      ),
                    }}
                  >
                    <input
                      id="twilio-from"
                      type="tel"
                      autoComplete="off"
                      value={settings.smsFromNumber}
                      onChange={(e) => update('smsFromNumber', e.target.value)}
                      placeholder="+15551234567"
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    {settings.smsFromNumber && !isValidPhone(settings.smsFromNumber) && (
                      <p className="mt-1 text-xs text-amber-300">
                        Use E.164 format: <code className="px-1 bg-slate-900 rounded">+15551234567</code>
                      </p>
                    )}
                  </Field>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <button
                  type="button"
                  onClick={handleTestSms}
                  disabled={!canTestSms || testSmsStatus.type === 'sending' || !apiOnline}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                >
                  {testSmsStatus.type === 'sending' ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <IconPhone size={14} />
                      Send test SMS
                    </>
                  )}
                </button>

                <Link
                  href="/help/integrations/twilio"
                  className="text-xs text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
                >
                  Twilio setup walkthrough
                  <IconExternalLink size={12} />
                </Link>
              </div>

              {testSmsStatus.type === 'success' && (
                <div className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-200 inline-flex items-center gap-2">
                  <IconCheck size={14} />
                  Test SMS queued (sid <span className="font-mono">{testSmsStatus.sid.slice(0, 10)}…</span>). Check your phone.
                </div>
              )}
              {testSmsStatus.type === 'error' && (
                <div className="px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-200">
                  Test failed: {testSmsStatus.message}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ----- Telegram ------------------------------------------------- */}
        <Section
          icon={<IconMessageSquare size={18} />}
          title="Telegram alerts"
          subtitle="Configured by the server operator only — no per-user bot tokens."
        >
          <Toggle
            label="Send Telegram alerts"
            description="Server delivers to every chat that registered with the SafeOS bot."
            checked={settings.telegramEnabled}
            onChange={(v) => update('telegramEnabled', v)}
            disabled={!apiOnline || !serverStatus?.telegramEnabled}
          />
          {apiOnline && serverStatus && !serverStatus.telegramEnabled && (
            <p className="mt-2 text-xs text-slate-400">
              Your monitoring server has no Telegram bot token set. See{' '}
              <Link href="/help/integrations/telegram" className="text-emerald-300 underline-offset-2 hover:underline">
                Telegram setup
              </Link>
              .
            </p>
          )}
        </Section>

        {/* ----- Quiet hours --------------------------------------------- */}
        <Section icon={<IconShield size={18} />} title="Quiet hours" subtitle="Use the same quiet hours as monitoring and sound settings.">
          <Toggle
            label="Enable quiet hours"
            description="Applies the quiet-hours sound mode configured in alert settings. Emergency alerts remain audible."
            checked={settings.quietHoursEnabled}
            onChange={(v) => update('quietHoursEnabled', v)}
          />
          {settings.quietHoursEnabled && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Start" htmlFor="quiet-start">
                <input
                  id="quiet-start"
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => update('quietHoursStart', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </Field>
              <Field label="End" htmlFor="quiet-end">
                <input
                  id="quiet-end"
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => update('quietHoursEnd', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </Field>
            </div>
          )}
        </Section>

        {/* ----- Save ---------------------------------------------------- */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between sticky bottom-4">
          <p className="text-xs text-slate-400">
            Changes are saved on this device immediately, and synced to your profile when online.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {serverStatusError && (
          <p className="mt-6 text-xs text-amber-300">Server status unavailable: {serverStatusError}</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// UI primitives
// =============================================================================

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
      <header className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 flex-shrink-0 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mt-0.5">{subtitle}</p>}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 sm:gap-4 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          checked ? 'bg-emerald-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</div>}
      </div>
    </label>
  );
}

function Field({
  label,
  htmlFor,
  children,
  tooltip,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  tooltip?: { label: string; body: React.ReactNode };
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-medium text-slate-200 mb-2">
        <span>{label}</span>
        {tooltip && <HelpTooltip label={tooltip.label}>{tooltip.body}</HelpTooltip>}
      </label>
      {children}
    </div>
  );
}
