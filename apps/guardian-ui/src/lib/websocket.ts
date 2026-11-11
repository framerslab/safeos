/**
 * WebSocket Client
 *
 * Real-time communication with SafeOS backend.
 *
 * @module lib/websocket
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { isStaticMode } from './env';
import { useAuthStore } from '../stores/auth-store';

// =============================================================================
// Types
// =============================================================================

export interface WSMessage {
  type: string;
  payload?: any;
  channel?: string;
  streamId?: string;
  timestamp?: number;
}

export interface UseWebSocketOptions {
  onMessage?: (message: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 30000;

// =============================================================================
// useWebSocket Hook
// =============================================================================

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnect = true,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
  } = options;

  const sessionToken = useAuthStore(state => state.sessionToken);
  const authenticatedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  // A direct monitor visit may not render the separate sign-in control.
  useEffect(() => {
    if (!url || isStaticMode()) return;
    const auth = useAuthStore.getState();
    if (!auth.isInitialized && !auth.isLoading) void auth.initialize();
  }, [url]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Skip WebSocket connection in static mode (GitHub Pages deployment)
    if (isStaticMode()) {
      console.log('[WebSocket] Skipping connection in static mode');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Don't attempt connection with empty URL
    if (!url || !sessionToken) return;

    // Only connect to localhost when actually running locally
    if (url.startsWith('ws://localhost') || url.startsWith('wss://localhost')) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          console.log('[WebSocket] Skipping localhost connection from remote host');
          return;
        }
      }
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        authenticatedRef.current = false;
        ws.send(JSON.stringify({ type: 'authenticate', payload: { token: sessionToken } }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          if (message.type === 'connected') {
            authenticatedRef.current = true;
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
            }, HEARTBEAT_INTERVAL);
            onConnect?.();
          }
          setLastMessage(message);
          onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        authenticatedRef.current = false;
        setIsConnected(false);
        onDisconnect?.();

        // Clear heartbeat
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }

        // Attempt reconnect
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current - 1);
          reconnectTimeoutRef.current = setTimeout(connect, Math.min(delay, 30000));
        }
      };

      ws.onerror = (error) => {
        onError?.(error);
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  }, [url, sessionToken, onConnect, onDisconnect, onMessage, onError, reconnect, reconnectDelay, maxReconnectAttempts]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Send message
  const sendMessage = useCallback((message: WSMessage) => {
    if (authenticatedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          ...message,
          timestamp: Date.now(),
        })
      );
    }
  }, []);

  // Subscribe to a channel
  const subscribe = useCallback(
    (channel: string) => {
      sendMessage({ type: 'subscribe', channel });
    },
    [sendMessage]
  );

  // Unsubscribe from a channel
  const unsubscribe = useCallback(
    (channel: string) => {
      sendMessage({ type: 'unsubscribe', channel });
    },
    [sendMessage]
  );

  // Send frame data
  const sendFrame = useCallback(
    (
      streamId: string,
      imageData: string,
      motionScore: number,
      audioLevel: number
    ) => {
      sendMessage({
        type: 'frame',
        streamId,
        payload: {
          imageData,
          motionScore,
          audioLevel,
        },
      });
    },
    [sendMessage]
  );

  // Initialize connection
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
    unsubscribe,
    sendFrame,
    connect,
    disconnect,
  };
}

// =============================================================================
// WebSocketClient Class (non-hook version)
// =============================================================================

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  private onMessageCallback?: (message: WSMessage) => void;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  private onErrorCallback?: (error: Event) => void;

  constructor(url: string, options: UseWebSocketOptions = {}) {
    this.url = url;
    this.maxReconnectAttempts = options.maxReconnectAttempts || MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = options.reconnectDelay || DEFAULT_RECONNECT_DELAY;
    this.onMessageCallback = options.onMessage;
    this.onConnectCallback = options.onConnect;
    this.onDisconnectCallback = options.onDisconnect;
    this.onErrorCallback = options.onError;
  }

  connect(): void {
    // Skip WebSocket connection in static mode (GitHub Pages deployment)
    if (isStaticMode()) {
      console.log('[WebSocket] Skipping connection in static mode');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) return;

    // Don't attempt connection with empty URL
    const token = useAuthStore.getState().sessionToken;
    if (!this.url || !token) return;

    // Only connect to localhost when actually running locally
    if (this.url.startsWith('ws://localhost') || this.url.startsWith('wss://localhost')) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          console.log('[WebSocket] Skipping localhost connection from remote host');
          return;
        }
      }
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.authenticated = false;
      this.ws?.send(JSON.stringify({ type: 'authenticate', payload: { token } }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        if (message.type === 'connected') {
          this.authenticated = true;
          this.reconnectAttempts = 0;
          if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = setInterval(() => this.send({ type: 'ping' }), HEARTBEAT_INTERVAL);
          this.onConnectCallback?.();
        }
        this.onMessageCallback?.(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.onDisconnectCallback?.();

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        this.reconnectTimeout = setTimeout(() => this.connect(), Math.min(delay, 30000));
      }
    };

    this.ws.onerror = (error) => {
      this.onErrorCallback?.(error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WSMessage): void {
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          ...message,
          timestamp: Date.now(),
        })
      );
    }
  }

  subscribe(channel: string): void {
    this.send({ type: 'subscribe', channel });
  }

  unsubscribe(channel: string): void {
    this.send({ type: 'unsubscribe', channel });
  }

  isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }
}

export default {
  useWebSocket,
  WebSocketClient,
};
