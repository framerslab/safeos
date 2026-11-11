/**
 * Browser Notification Manager
 * 
 * Handles browser notifications for alerts.
 * Includes permission management and notification helpers.
 *
 * Note: true background push notifications (when the browser/app is closed) require
 * Web Push subscriptions + a server-side sender and are not enabled by default.
 */

import { showBrowserNotification } from './browser-notification';
import type { Alert } from '../components/AlertPanel';

// =============================================================================
// Types
// =============================================================================

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export interface NotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  actions?: NotificationAction[];
  data?: Record<string, unknown>;
  vibrate?: number[];
  image?: string;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface NotificationCallbacks {
  onClick?: (notification: Notification, action?: string) => void;
  onClose?: (notification: Notification) => void;
  onError?: (error: Error) => void;
}

// =============================================================================
// Notification Manager Class
// =============================================================================

class NotificationManager {
  private permission: NotificationPermissionState = 'default';
  private activeNotifications: Map<string, Notification> = new Map();
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private isSupported: boolean = false;
  private defaultIcon: string = '/logo.svg';
  private defaultBadge: string = '/favicon.svg';

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.isSupported = true;
      this.permission = Notification.permission as NotificationPermissionState;
    }
  }

  /**
   * Check if notifications are supported
   */
  getIsSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Get current permission state
   */
  getPermission(): NotificationPermissionState {
    return this.permission;
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported) {
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result as NotificationPermissionState;
      return this.permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Register service worker for persistent notifications
   */
  async registerServiceWorker(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
      return true;
    } catch (error) {
      console.error('Failed to get service worker registration:', error);
      return false;
    }
  }

  /**
   * Show a notification
   */
  async show(
    title: string,
    options: NotificationOptions = {},
    callbacks: NotificationCallbacks = {}
  ): Promise<Notification | null> {
    if (!this.isSupported || Notification.permission !== 'granted') {
      console.warn('Notifications not permitted');
      return null;
    }

    const notificationOptions: globalThis.NotificationOptions = {
      body: options.body,
      icon: options.icon || this.defaultIcon,
      badge: options.badge || this.defaultBadge,
      tag: options.tag,
      requireInteraction: options.requireInteraction ?? false,
      silent: options.silent ?? false,
      data: options.data,
    };

    // Add vibration if supported and provided
    if (options.vibrate && 'vibrate' in navigator) {
      (notificationOptions as Record<string, unknown>).vibrate = options.vibrate;
    }

    // Add image if provided
    if (options.image) {
      (notificationOptions as Record<string, unknown>).image = options.image;
    }

    try {
      const notification = await showBrowserNotification(title, notificationOptions);
      if (!notification) return null;

      // Store active notification
      if (options.tag) {
        this.activeNotifications.set(options.tag, notification);
      }

      // Set up event handlers
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();
        
        if (callbacks.onClick) {
          callbacks.onClick(notification);
        }
      };

      notification.onclose = () => {
        if (options.tag) {
          this.activeNotifications.delete(options.tag);
        }
        if (callbacks.onClose) {
          callbacks.onClose(notification);
        }
      };

      notification.onerror = (event) => {
        console.error('Notification error:', event);
        if (callbacks.onError) {
          callbacks.onError(new Error('Notification failed'));
        }
      };

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }
      return null;
    }
  }

  /**
   * Show an alert notification
   */
  async showAlert(
    alert: Alert,
    callbacks: NotificationCallbacks = {}
  ): Promise<Notification | null> {
    // Severity prefixes for plain text notification titles (no emoji for accessibility)
    const severityPrefixes: Record<string, string> = {
      info: 'INFO',
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
      critical: 'CRITICAL',
    };

    const title = `SafeOS Alert [${severityPrefixes[alert.severity] || alert.severity.toUpperCase()}]`;
    
    return this.show(
      title,
      {
        body: alert.message,
        icon: this.defaultIcon,
        tag: `alert-${alert.id}`,
        requireInteraction: alert.severity === 'critical' || alert.severity === 'high',
        image: alert.thumbnailUrl,
        data: { alertId: alert.id, severity: alert.severity },
        vibrate: alert.severity === 'critical' ? [200, 100, 200, 100, 200] : undefined,
      },
      {
        onClick: (notification) => {
          // Navigate to the alert or monitoring page
          if (window.location.pathname !== '/monitor') {
            window.location.href = '/monitor';
          }
          if (callbacks.onClick) {
            callbacks.onClick(notification);
          }
        },
        onClose: callbacks.onClose,
        onError: callbacks.onError,
      }
    );
  }

  /**
   * Show emergency notification (persistent)
   */
  async showEmergency(
    alert: Alert,
    callbacks: NotificationCallbacks = {}
  ): Promise<Notification | null> {
    return this.show(
      '[EMERGENCY] SafeOS Guardian Alert',
      {
        body: `CRITICAL: ${alert.message}. Immediate attention required!`,
        icon: this.defaultIcon,
        tag: `emergency-${alert.id}`,
        requireInteraction: true,
        image: alert.thumbnailUrl,
        data: { alertId: alert.id, severity: 'emergency' },
        vibrate: [500, 200, 500, 200, 500, 200, 500],
      },
      {
        onClick: (notification) => {
          window.focus();
          if (window.location.pathname !== '/monitor') {
            window.location.href = '/monitor';
          }
          if (callbacks.onClick) {
            callbacks.onClick(notification);
          }
        },
        onClose: callbacks.onClose,
        onError: callbacks.onError,
      }
    );
  }

  /**
   * Show a simple notification
   */
  async notify(
    title: string,
    body: string,
    options: Partial<NotificationOptions> = {}
  ): Promise<Notification | null> {
    return this.show(title, { body, ...options });
  }

  /**
   * Close a notification by tag
   */
  close(tag: string): void {
    const notification = this.activeNotifications.get(tag);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(tag);
    }
  }

  /**
   * Close all notifications
   */
  closeAll(): void {
    this.activeNotifications.forEach((notification) => {
      notification.close();
    });
    this.activeNotifications.clear();
  }

  /**
   * Get count of active notifications
   */
  getActiveCount(): number {
    return this.activeNotifications.size;
  }

  /**
   * Check if a notification with tag is active
   */
  isActive(tag: string): boolean {
    return this.activeNotifications.has(tag);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!instance) {
    instance = new NotificationManager();
  }
  return instance;
}

// =============================================================================
// React Hook
// =============================================================================

import { useEffect, useState, useCallback } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isSupported, setIsSupported] = useState(false);
  
  const manager = getNotificationManager();

  useEffect(() => {
    setIsSupported(manager.getIsSupported());
    setPermission(manager.getPermission());
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await manager.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const showAlert = useCallback(
    (alert: Alert, callbacks?: NotificationCallbacks) => {
      return manager.showAlert(alert, callbacks);
    },
    []
  );

  const showEmergency = useCallback(
    (alert: Alert, callbacks?: NotificationCallbacks) => {
      return manager.showEmergency(alert, callbacks);
    },
    []
  );

  const notify = useCallback(
    (title: string, body: string, options?: Partial<NotificationOptions>) => {
      return manager.notify(title, body, options);
    },
    []
  );

  const close = useCallback((tag: string) => {
    manager.close(tag);
  }, []);

  const closeAll = useCallback(() => {
    manager.closeAll();
  }, []);

  return {
    permission,
    isSupported,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    requestPermission,
    showAlert,
    showEmergency,
    notify,
    close,
    closeAll,
    getActiveCount: () => manager.getActiveCount(),
    isActive: (tag: string) => manager.isActive(tag),
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if notifications are supported and granted
 */
export function canShowNotifications(): boolean {
  const manager = getNotificationManager();
  return manager.getIsSupported() && manager.getPermission() === 'granted';
}

/**
 * Request notification permission with user-friendly prompts
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const manager = getNotificationManager();
  
  if (!manager.getIsSupported()) {
    console.warn('Browser notifications are not supported');
    return false;
  }
  
  if (manager.getPermission() === 'granted') {
    return true;
  }
  
  if (manager.getPermission() === 'denied') {
    console.warn('Notification permission was denied');
    return false;
  }
  
  const result = await manager.requestPermission();
  return result === 'granted';
}
