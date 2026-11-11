/**
 * Capacitor Native Integration
 *
 * Wrapper functions for Capacitor native APIs.
 *
 * @module lib/capacitor
 */

// =============================================================================
// Types
// =============================================================================

import { showBrowserNotification } from './browser-notification';

export interface PlatformInfo {
  platform: 'ios' | 'android' | 'web';
  isNative: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isWeb: boolean;
}

export interface DeviceInfo {
  model: string;
  platform: string;
  operatingSystem: string;
  osVersion: string;
  manufacturer: string;
  isVirtual: boolean;
  webViewVersion: string;
}

// =============================================================================
// Platform Detection
// =============================================================================

/**
 * Check if running in a Capacitor native context
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/**
 * Get current platform info
 */
export function getPlatformInfo(): PlatformInfo {
  if (typeof window === 'undefined') {
    return {
      platform: 'web',
      isNative: false,
      isIOS: false,
      isAndroid: false,
      isWeb: true,
    };
  }

  const Capacitor = (window as any).Capacitor;
  if (!Capacitor) {
    return {
      platform: 'web',
      isNative: false,
      isIOS: false,
      isAndroid: false,
      isWeb: true,
    };
  }

  const platform = Capacitor.getPlatform?.() || 'web';

  return {
    platform: platform as 'ios' | 'android' | 'web',
    isNative: Capacitor.isNativePlatform?.() || false,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    isWeb: platform === 'web',
  };
}

// =============================================================================
// Device Info
// =============================================================================

/**
 * Get device information (native only)
 */
export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  if (!isNativeApp()) return null;

  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return {
      model: info.model,
      platform: info.platform,
      operatingSystem: info.operatingSystem,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
      webViewVersion: info.webViewVersion,
    };
  } catch (error) {
    console.warn('[Capacitor] Device plugin not available:', error);
    return null;
  }
}

// =============================================================================
// Haptics
// =============================================================================

export type HapticsStyle = 'light' | 'medium' | 'heavy';

/**
 * Trigger haptic feedback (native only)
 */
export async function hapticFeedback(style: HapticsStyle = 'light'): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');

    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };

    await Haptics.impact({ style: styleMap[style] });
  } catch (error) {
    console.warn('[Capacitor] Haptics plugin not available:', error);
  }
}

/**
 * Trigger success haptic
 */
export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch (error) {
    console.warn('[Capacitor] Haptics plugin not available:', error);
  }
}

/**
 * Trigger error haptic
 */
export async function hapticError(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  } catch (error) {
    console.warn('[Capacitor] Haptics plugin not available:', error);
  }
}

// =============================================================================
// Push Notifications
// =============================================================================

export interface PushToken {
  value: string;
}

/**
 * Request push notification permissions and get token
 */
export async function requestPushNotifications(): Promise<PushToken | null> {
  if (!isNativeApp()) {
    console.log('[Capacitor] Push notifications only available in native apps');
    return null;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.warn('[Capacitor] Push notification permission denied');
      return null;
    }

    // Register to get token
    await PushNotifications.register();

    // Return promise that resolves with token
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token) => {
        resolve({ value: token.value });
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[Capacitor] Push registration error:', error);
        resolve(null);
      });
    });
  } catch (error) {
    console.warn('[Capacitor] PushNotifications plugin not available:', error);
    return null;
  }
}

// =============================================================================
// Local Notifications
// =============================================================================

export interface LocalNotification {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date };
  sound?: string;
  extra?: Record<string, unknown>;
}

/**
 * Show a local notification
 */
export async function showLocalNotification(notification: LocalNotification): Promise<void> {
  if (!isNativeApp()) {
    // Fallback to web notification
    if ('Notification' in window && Notification.permission === 'granted') {
      void showBrowserNotification(notification.title, { body: notification.body });
    }
    return;
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          schedule: notification.schedule,
          sound: notification.sound,
          extra: notification.extra,
        },
      ],
    });
  } catch (error) {
    console.warn('[Capacitor] LocalNotifications plugin not available:', error);
  }
}

// =============================================================================
// Camera
// =============================================================================

export interface CameraPhoto {
  dataUrl?: string;
  base64?: string;
  webPath?: string;
}

/**
 * Take a photo using the device camera
 */
export async function takePhoto(): Promise<CameraPhoto | null> {
  if (!isNativeApp()) {
    console.log('[Capacitor] Native camera only available in native apps');
    return null;
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

    const photo = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });

    return {
      dataUrl: photo.dataUrl,
      base64: photo.base64String,
      webPath: photo.webPath,
    };
  } catch (error) {
    console.warn('[Capacitor] Camera plugin not available or user cancelled:', error);
    return null;
  }
}

// =============================================================================
// Network Status
// =============================================================================

export interface NetworkStatus {
  connected: boolean;
  connectionType: string;
}

/**
 * Get current network status
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  try {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType,
    };
  } catch (error) {
    // Fallback to navigator.onLine for web
    return {
      connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connectionType: 'unknown',
    };
  }
}

/**
 * Listen for network status changes
 */
export async function onNetworkChange(
  callback: (status: NetworkStatus) => void
): Promise<() => void> {
  try {
    const { Network } = await import('@capacitor/network');
    const handler = Network.addListener('networkStatusChange', (status) => {
      callback({
        connected: status.connected,
        connectionType: status.connectionType,
      });
    });

    return () => handler.remove();
  } catch {
    // Fallback for web
    const handler = () => {
      callback({
        connected: navigator.onLine,
        connectionType: 'unknown',
      });
    };

    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);

    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }
}

// =============================================================================
// App Lifecycle
// =============================================================================

/**
 * Listen for app state changes (foreground/background)
 */
export async function onAppStateChange(
  callback: (state: { isActive: boolean }) => void
): Promise<() => void> {
  if (!isNativeApp()) {
    // Web fallback using visibility API
    const handler = () => {
      callback({ isActive: document.visibilityState === 'visible' });
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }

  try {
    const { App } = await import('@capacitor/app');
    const handler = App.addListener('appStateChange', (state) => {
      callback({ isActive: state.isActive });
    });

    return () => handler.remove();
  } catch (error) {
    console.warn('[Capacitor] App plugin not available:', error);
    return () => {};
  }
}

// =============================================================================
// Status Bar
// =============================================================================

/**
 * Set status bar style (native only)
 */
export async function setStatusBarStyle(style: 'dark' | 'light'): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({
      style: style === 'dark' ? Style.Dark : Style.Light,
    });
  } catch (error) {
    console.warn('[Capacitor] StatusBar plugin not available:', error);
  }
}

/**
 * Hide the status bar (native only)
 */
export async function hideStatusBar(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.hide();
  } catch (error) {
    console.warn('[Capacitor] StatusBar plugin not available:', error);
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  isNativeApp,
  getPlatformInfo,
  getDeviceInfo,
  hapticFeedback,
  hapticSuccess,
  hapticError,
  requestPushNotifications,
  showLocalNotification,
  takePhoto,
  getNetworkStatus,
  onNetworkChange,
  onAppStateChange,
  setStatusBarStyle,
  hideStatusBar,
};





























