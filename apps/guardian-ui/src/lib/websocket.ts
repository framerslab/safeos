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

function rejectsSession(event: CloseEvent): boolean {
  return event?.code === 1008 &&
    (event.reason === 'Invalid session' || event.reason === 'Invalid or expired session');
}

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

  const callbacksRef = useRef({ onMessage, onConnect, onDisconnect, onError });
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect, onError };
  }, [onMessage, onConnect, onDisconnect, onError]);

  const sessionToken = useAuthStore(state => state.sessionToken);
  const authenticatedRef = useRef(false);
  const refusedTokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  // A rejected credential stays blocked until the session changes.
  useEffect(() => {
    refusedTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
  }, [sessionToken]);

  // A direct monitor visit may not render the separate sign-in control.
  useEffect(() => {
    if (!url || isStaticMode()) return;
    const auth = useAuthStore.getState();
    if (!auth.isInitialized && !auth.isLoading) void auth.initialize();
  }, [url]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (isStaticMode()) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // A retry must read the current session, never a captured credential.
    const token = useAuthStore.getState().sessionToken;
    if (!url || !token || /^(local-|offline-)/.test(token) || refusedTokenRef.current === token) return;
    if (url.startsWith('ws://localhost') || url.startsWith('wss://localhost')) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
      }
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      authenticatedRef.current = false;
      const isCurrent = () => wsRef.current === ws && useAuthStore.getState().sessionToken === token;

      ws.onopen = () => {
        if (!isCurrent()) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'authenticate', payload: { token } }));
      };

      ws.onmessage = (event) => {
        if (!isCurrent()) return;
        try {
          const message: WSMessage = JSON.parse(event.data);
          if (message.type === 'ping' && authenticatedRef.current && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          if (message.type === 'connected') {
            authenticatedRef.current = true;
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            heartbeatRef.current = setInterval(() => {
              if (isCurrent() && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
            }, HEARTBEAT_INTERVAL);
            callbacksRef.current.onConnect?.();
          }
          setLastMessage(message);
          callbacksRef.current.onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        if (rejectsSession(event)) refusedTokenRef.current = token;
        wsRef.current = null;
        authenticatedRef.current = false;
        setIsConnected(false);
        callbacksRef.current.onDisconnect?.();
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        if (refusedTokenRef.current !== token && useAuthStore.getState().sessionToken === token && reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current - 1);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (useAuthStore.getState().sessionToken === token && !wsRef.current) connect();
          }, Math.min(delay, 30000));
        }
      };
      ws.onerror = (error) => { if (isCurrent()) callbacksRef.current.onError?.(error); };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  }, [url, reconnect, reconnectDelay, maxReconnectAttempts]);

  // Detach before closing: a late event must not affect a newer connection.
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    authenticatedRef.current = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = () => {};
      ws.close();
    }
    setIsConnected(false);
    callbacksRef.current.onDisconnect?.();
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
  }, [connect, disconnect, sessionToken]);

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
  private refusedToken: string | null = null;
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

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    // Don't attempt connection with empty URL
    const token = useAuthStore.getState().sessionToken;
    if (!this.url || !token || /^(local-|offline-)/.test(token) || this.refusedToken === token) return;
    this.refusedToken = null;

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

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.authenticated = false;
    const isCurrent = () => this.ws === ws && useAuthStore.getState().sessionToken === token;

    ws.onopen = () => {
      if (!isCurrent()) { ws.close(); return; }
      ws.send(JSON.stringify({ type: 'authenticate', payload: { token } }));
    };

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      try {
        const message: WSMessage = JSON.parse(event.data);
        if (message.type === 'ping') this.send({ type: 'pong' });
        if (message.type === 'connected') {
          this.authenticated = true;
          this.reconnectAttempts = 0;
          if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = setInterval(() => {
            if (isCurrent()) this.send({ type: 'ping' });
          }, HEARTBEAT_INTERVAL);
          this.onConnectCallback?.();
        }
        this.onMessageCallback?.(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      if (rejectsSession(event)) this.refusedToken = token;
      this.ws = null;
      this.authenticated = false;
      this.onDisconnectCallback?.();

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.refusedToken !== token && useAuthStore.getState().sessionToken === token
          && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (useAuthStore.getState().sessionToken === token && !this.ws) this.connect();
        }, Math.min(delay, 30000));
      }
    };

    ws.onerror = (error) => {
      if (isCurrent()) this.onErrorCallback?.(error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const ws = this.ws;
    this.ws = null;
    this.authenticated = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = () => {};
      ws.close();
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
