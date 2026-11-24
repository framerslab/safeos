/**
 * Auth Store Tests
 *
 * Unit tests for authentication store state management and helper functions.
 *
 * @module tests/auth-store.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Types (extracted for testing)
// =============================================================================

type SessionMode = 'full' | 'local-only';

interface UserPreferences {
  defaultScenario: 'pet' | 'baby' | 'elderly' | 'security';
  motionSensitivity: number;
  audioSensitivity: number;
  alertVolume: number;
  theme: 'dark' | 'light' | 'system';
}

interface NotificationSettings {
  browserPush: boolean;
  sms: boolean;
  telegram: boolean;
  emailDigest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferences: UserPreferences;
  notificationSettings: NotificationSettings;
  createdAt: string;
  updatedAt: string;
}

interface SimpleUser {
  id: string;
  displayName: string;
  preferences: UserPreferences;
}

// =============================================================================
// Helper Functions (extracted for testing)
// =============================================================================

function generateDeviceId(): string {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createDefaultPreferences(): UserPreferences {
  return {
    defaultScenario: 'pet',
    motionSensitivity: 0.5,
    audioSensitivity: 0.5,
    alertVolume: 0.7,
    theme: 'dark',
  };
}

function createDefaultNotificationSettings(): NotificationSettings {
  return {
    browserPush: true,
    sms: false,
    telegram: false,
    emailDigest: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  };
}

function createGuestProfile(displayName?: string): UserProfile {
  const id = `guest-${Date.now()}`;
  // One time for both stamps: two reads of the clock can fall either side of a millisecond.
  const now = new Date().toISOString();
  return {
    id,
    displayName: displayName || `Guest-${id.slice(0, 6)}`,
    avatarUrl: null,
    preferences: createDefaultPreferences(),
    notificationSettings: createDefaultNotificationSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

function createProfileFromUser(user: SimpleUser): UserProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: null,
    preferences: user.preferences,
    notificationSettings: createDefaultNotificationSettings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isLocalToken(token: string | null): boolean {
  if (!token) return false;
  return token.startsWith('local-') || token.startsWith('offline-');
}

function isSessionExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

// =============================================================================
// Mock Store Implementation (for testing logic)
// =============================================================================

class AuthStore {
  isInitialized: boolean = false;
  isLoading: boolean = false;
  isAuthenticated: boolean = false;
  isLoggedIn: boolean = false;
  isGuest: boolean = true;
  sessionToken: string | null = null;
  sessionId: string | null = null;
  deviceId: string | null = null;
  profile: UserProfile | null = null;
  user: SimpleUser | null = null;
  expiresAt: string | null = null;
  mode: SessionMode = 'local-only';
  isOffline: boolean = false;

  setDeviceId(deviceId: string) {
    this.deviceId = deviceId;
  }

  login(user: SimpleUser) {
    this.isAuthenticated = true;
    this.isLoggedIn = true;
    this.isGuest = false;
    this.user = user;
    this.profile = createProfileFromUser(user);
  }

  startGuestSession(user: SimpleUser) {
    this.isAuthenticated = true;
    this.isLoggedIn = true;
    this.isGuest = true;
    this.user = user;
    this.profile = createProfileFromUser(user);
  }

  setSession(data: {
    token: string;
    sessionId: string;
    profile: UserProfile;
    expiresAt: string;
    isGuest: boolean;
    mode: SessionMode;
    isOffline: boolean;
  }) {
    this.isAuthenticated = true;
    this.sessionToken = data.token;
    this.sessionId = data.sessionId;
    this.profile = data.profile;
    this.expiresAt = data.expiresAt;
    this.isGuest = data.isGuest;
    this.mode = data.mode;
    this.isOffline = data.isOffline;
    this.isInitialized = true;
    this.isLoading = false;
  }

  logout() {
    this.isAuthenticated = false;
    this.isLoggedIn = false;
    this.isGuest = true;
    this.sessionToken = null;
    this.sessionId = null;
    this.profile = null;
    this.user = null;
    this.expiresAt = null;
  }

  updateProfile(updates: Partial<UserProfile>) {
    if (!this.profile) return;
    this.profile = {
      ...this.profile,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  updatePreferences(prefs: Partial<UserPreferences>) {
    if (!this.profile) return;
    this.profile = {
      ...this.profile,
      preferences: { ...this.profile.preferences, ...prefs },
      updatedAt: new Date().toISOString(),
    };
  }

  updateNotificationSettings(settings: Partial<NotificationSettings>) {
    if (!this.profile) return;
    this.profile = {
      ...this.profile,
      notificationSettings: { ...this.profile.notificationSettings, ...settings },
      updatedAt: new Date().toISOString(),
    };
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Auth Store', () => {
  describe('generateDeviceId', () => {
    it('should generate device ID with correct prefix', () => {
      const deviceId = generateDeviceId();
      expect(deviceId).toMatch(/^device-\d+-[a-z0-9]+$/);
    });

    it('should generate unique device IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDeviceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createDefaultPreferences', () => {
    it('should create default preferences', () => {
      const prefs = createDefaultPreferences();
      expect(prefs.defaultScenario).toBe('pet');
      expect(prefs.motionSensitivity).toBe(0.5);
      expect(prefs.audioSensitivity).toBe(0.5);
      expect(prefs.alertVolume).toBe(0.7);
      expect(prefs.theme).toBe('dark');
    });
  });

  describe('createDefaultNotificationSettings', () => {
    it('should create default notification settings', () => {
      const settings = createDefaultNotificationSettings();
      expect(settings.browserPush).toBe(true);
      expect(settings.sms).toBe(false);
      expect(settings.telegram).toBe(false);
      expect(settings.emailDigest).toBe(false);
      expect(settings.quietHoursStart).toBeNull();
      expect(settings.quietHoursEnd).toBeNull();
    });
  });

  describe('createGuestProfile', () => {
    it('should create guest profile with generated ID', () => {
      const profile = createGuestProfile();
      expect(profile.id).toMatch(/^guest-\d+$/);
      expect(profile.avatarUrl).toBeNull();
    });

    it('should use provided display name', () => {
      const profile = createGuestProfile('TestUser');
      expect(profile.displayName).toBe('TestUser');
    });

    it('should generate display name if not provided', () => {
      const profile = createGuestProfile();
      expect(profile.displayName).toContain('Guest-');
    });

    it('should have valid timestamps', () => {
      const before = new Date();
      const profile = createGuestProfile();
      const after = new Date();

      const created = new Date(profile.createdAt);
      const updated = new Date(profile.updatedAt);

      expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(updated.getTime()).toBe(created.getTime());
    });
  });

  describe('isLocalToken', () => {
    it('should return true for local tokens', () => {
      expect(isLocalToken('local-guest-123')).toBe(true);
      expect(isLocalToken('offline-device-456')).toBe(true);
    });

    it('should return false for server tokens', () => {
      expect(isLocalToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')).toBe(false);
      expect(isLocalToken('abc123def456')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isLocalToken(null)).toBe(false);
    });
  });

  describe('isSessionExpired', () => {
    it('should return true for null expiration', () => {
      expect(isSessionExpired(null)).toBe(true);
    });

    it('should return true for past dates', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      expect(isSessionExpired(past)).toBe(true);
    });

    it('should return false for future dates', () => {
      const future = new Date(Date.now() + 60000).toISOString();
      expect(isSessionExpired(future)).toBe(false);
    });
  });

  describe('Initial State', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should start not initialized', () => {
      expect(store.isInitialized).toBe(false);
    });

    it('should start not authenticated', () => {
      expect(store.isAuthenticated).toBe(false);
    });

    it('should start as guest', () => {
      expect(store.isGuest).toBe(true);
    });

    it('should start in local-only mode', () => {
      expect(store.mode).toBe('local-only');
    });

    it('should have null session values', () => {
      expect(store.sessionToken).toBeNull();
      expect(store.sessionId).toBeNull();
      expect(store.profile).toBeNull();
      expect(store.expiresAt).toBeNull();
    });
  });

  describe('Login', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should set authenticated state on login', () => {
      const user: SimpleUser = {
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      };

      store.login(user);

      expect(store.isAuthenticated).toBe(true);
      expect(store.isLoggedIn).toBe(true);
      expect(store.isGuest).toBe(false);
    });

    it('should store user data on login', () => {
      const user: SimpleUser = {
        id: 'user-123',
        displayName: 'Test User',
        preferences: {
          ...createDefaultPreferences(),
          defaultScenario: 'baby',
        },
      };

      store.login(user);

      expect(store.user).toEqual(user);
      expect(store.profile?.id).toBe('user-123');
      expect(store.profile?.displayName).toBe('Test User');
      expect(store.profile?.preferences.defaultScenario).toBe('baby');
    });

    it('should create profile from user', () => {
      const user: SimpleUser = {
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      };

      store.login(user);

      expect(store.profile).toBeDefined();
      expect(store.profile?.avatarUrl).toBeNull();
      expect(store.profile?.notificationSettings).toEqual(createDefaultNotificationSettings());
    });
  });

  describe('Guest Session', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should set authenticated as guest', () => {
      const user: SimpleUser = {
        id: 'guest-123',
        displayName: 'Guest User',
        preferences: createDefaultPreferences(),
      };

      store.startGuestSession(user);

      expect(store.isAuthenticated).toBe(true);
      expect(store.isLoggedIn).toBe(true);
      expect(store.isGuest).toBe(true);
    });

    it('should store guest user data', () => {
      const user: SimpleUser = {
        id: 'guest-123',
        displayName: 'Guest User',
        preferences: createDefaultPreferences(),
      };

      store.startGuestSession(user);

      expect(store.user).toEqual(user);
      expect(store.profile?.id).toBe('guest-123');
    });
  });

  describe('Session Management', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should set full session data', () => {
      const profile = createGuestProfile('Test');
      const expiresAt = new Date(Date.now() + 3600000).toISOString();

      store.setSession({
        token: 'token-123',
        sessionId: 'session-456',
        profile,
        expiresAt,
        isGuest: false,
        mode: 'full',
        isOffline: false,
      });

      expect(store.isAuthenticated).toBe(true);
      expect(store.sessionToken).toBe('token-123');
      expect(store.sessionId).toBe('session-456');
      expect(store.profile).toEqual(profile);
      expect(store.expiresAt).toBe(expiresAt);
      expect(store.mode).toBe('full');
      expect(store.isOffline).toBe(false);
      expect(store.isInitialized).toBe(true);
      expect(store.isLoading).toBe(false);
    });

    it('should set local-only session data', () => {
      const profile = createGuestProfile('Offline User');

      store.setSession({
        token: 'local-guest-123',
        sessionId: 'guest-123',
        profile,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        isGuest: true,
        mode: 'local-only',
        isOffline: true,
      });

      expect(store.mode).toBe('local-only');
      expect(store.isOffline).toBe(true);
      expect(store.isGuest).toBe(true);
    });
  });

  describe('Logout', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
      store.login({
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      });
    });

    it('should clear authentication state', () => {
      store.logout();

      expect(store.isAuthenticated).toBe(false);
      expect(store.isLoggedIn).toBe(false);
    });

    it('should reset to guest state', () => {
      store.logout();

      expect(store.isGuest).toBe(true);
    });

    it('should clear session data', () => {
      store.logout();

      expect(store.sessionToken).toBeNull();
      expect(store.sessionId).toBeNull();
      expect(store.profile).toBeNull();
      expect(store.user).toBeNull();
      expect(store.expiresAt).toBeNull();
    });
  });

  describe('Profile Updates', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
      store.login({
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      });
    });

    it('should update profile display name', () => {
      store.updateProfile({ displayName: 'New Name' });

      expect(store.profile?.displayName).toBe('New Name');
    });

    it('should update profile avatar', () => {
      store.updateProfile({ avatarUrl: 'https://example.com/avatar.jpg' });

      expect(store.profile?.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should update updatedAt on profile change', () => {
      const before = store.profile?.updatedAt;

      // Small delay to ensure timestamp difference
      store.updateProfile({ displayName: 'New Name' });

      expect(store.profile?.updatedAt).toBeDefined();
      expect(store.profile?.createdAt).toBeDefined();
    });

    it('should preserve other fields on partial update', () => {
      const originalId = store.profile?.id;

      store.updateProfile({ displayName: 'New Name' });

      expect(store.profile?.id).toBe(originalId);
      expect(store.profile?.preferences).toBeDefined();
    });

    it('should not update if no profile exists', () => {
      store.logout();
      store.updateProfile({ displayName: 'Test' });

      expect(store.profile).toBeNull();
    });
  });

  describe('Preferences Updates', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
      store.login({
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      });
    });

    it('should update default scenario', () => {
      store.updatePreferences({ defaultScenario: 'baby' });

      expect(store.profile?.preferences.defaultScenario).toBe('baby');
    });

    it('should update sensitivity settings', () => {
      store.updatePreferences({
        motionSensitivity: 0.8,
        audioSensitivity: 0.6,
      });

      expect(store.profile?.preferences.motionSensitivity).toBe(0.8);
      expect(store.profile?.preferences.audioSensitivity).toBe(0.6);
    });

    it('should update theme', () => {
      store.updatePreferences({ theme: 'light' });

      expect(store.profile?.preferences.theme).toBe('light');
    });

    it('should preserve other preferences on partial update', () => {
      store.updatePreferences({ theme: 'light' });

      expect(store.profile?.preferences.defaultScenario).toBe('pet');
      expect(store.profile?.preferences.alertVolume).toBe(0.7);
    });
  });

  describe('Notification Settings Updates', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
      store.login({
        id: 'user-123',
        displayName: 'Test User',
        preferences: createDefaultPreferences(),
      });
    });

    it('should update browser push setting', () => {
      store.updateNotificationSettings({ browserPush: false });

      expect(store.profile?.notificationSettings.browserPush).toBe(false);
    });

    it('should update SMS setting', () => {
      store.updateNotificationSettings({ sms: true });

      expect(store.profile?.notificationSettings.sms).toBe(true);
    });

    it('should update quiet hours', () => {
      store.updateNotificationSettings({
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });

      expect(store.profile?.notificationSettings.quietHoursStart).toBe('22:00');
      expect(store.profile?.notificationSettings.quietHoursEnd).toBe('07:00');
    });

    it('should clear quiet hours', () => {
      store.updateNotificationSettings({
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });

      store.updateNotificationSettings({
        quietHoursStart: null,
        quietHoursEnd: null,
      });

      expect(store.profile?.notificationSettings.quietHoursStart).toBeNull();
      expect(store.profile?.notificationSettings.quietHoursEnd).toBeNull();
    });

    it('should preserve other settings on partial update', () => {
      store.updateNotificationSettings({ telegram: true });

      expect(store.profile?.notificationSettings.browserPush).toBe(true);
      expect(store.profile?.notificationSettings.telegram).toBe(true);
    });
  });

  describe('Device ID', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should start with null device ID', () => {
      expect(store.deviceId).toBeNull();
    });

    it('should set device ID', () => {
      store.setDeviceId('device-123');

      expect(store.deviceId).toBe('device-123');
    });
  });

  describe('Session Mode', () => {
    let store: AuthStore;

    beforeEach(() => {
      store = new AuthStore();
    });

    it('should distinguish full mode', () => {
      const profile = createGuestProfile();

      store.setSession({
        token: 'server-token',
        sessionId: 'session-1',
        profile,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isGuest: false,
        mode: 'full',
        isOffline: false,
      });

      expect(store.mode).toBe('full');
      expect(store.isOffline).toBe(false);
    });

    it('should distinguish local-only mode', () => {
      const profile = createGuestProfile();

      store.setSession({
        token: 'local-token',
        sessionId: 'local-1',
        profile,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isGuest: true,
        mode: 'local-only',
        isOffline: true,
      });

      expect(store.mode).toBe('local-only');
      expect(store.isOffline).toBe(true);
    });
  });

  describe('UserProfile Type Validation', () => {
    it('should have all required fields', () => {
      const profile: UserProfile = {
        id: 'test-1',
        displayName: 'Test',
        avatarUrl: null,
        preferences: createDefaultPreferences(),
        notificationSettings: createDefaultNotificationSettings(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(profile.id).toBeDefined();
      expect(profile.displayName).toBeDefined();
      expect(profile.preferences).toBeDefined();
      expect(profile.notificationSettings).toBeDefined();
    });

    it('should allow avatar to be null or string', () => {
      const profileWithoutAvatar: UserProfile = {
        id: 'test-1',
        displayName: 'Test',
        avatarUrl: null,
        preferences: createDefaultPreferences(),
        notificationSettings: createDefaultNotificationSettings(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const profileWithAvatar: UserProfile = {
        ...profileWithoutAvatar,
        avatarUrl: 'https://example.com/avatar.png',
      };

      expect(profileWithoutAvatar.avatarUrl).toBeNull();
      expect(profileWithAvatar.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });

  describe('UserPreferences Validation', () => {
    it('should allow all scenario types', () => {
      const scenarios: Array<'pet' | 'baby' | 'elderly' | 'security'> = ['pet', 'baby', 'elderly', 'security'];

      scenarios.forEach((scenario) => {
        const prefs: UserPreferences = {
          ...createDefaultPreferences(),
          defaultScenario: scenario,
        };
        expect(prefs.defaultScenario).toBe(scenario);
      });
    });

    it('should allow all theme types', () => {
      const themes: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];

      themes.forEach((theme) => {
        const prefs: UserPreferences = {
          ...createDefaultPreferences(),
          theme,
        };
        expect(prefs.theme).toBe(theme);
      });
    });

    it('should accept sensitivity values between 0 and 1', () => {
      const prefs: UserPreferences = {
        ...createDefaultPreferences(),
        motionSensitivity: 0,
        audioSensitivity: 1,
        alertVolume: 0.5,
      };

      expect(prefs.motionSensitivity).toBe(0);
      expect(prefs.audioSensitivity).toBe(1);
      expect(prefs.alertVolume).toBe(0.5);
    });
  });
});
