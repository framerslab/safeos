/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWebSocket, WebSocketClient } from '../src/lib/websocket';
import { useAuthStore } from '../src/stores/auth-store';

jest.mock('../src/lib/env', () => ({ isStaticMode: () => false }));
jest.mock('../src/stores/auth-store', () => {
  const { create } = jest.requireActual('zustand');
  const store = create((set: (value: unknown) => void) => ({
    sessionToken: null,
    isInitialized: false,
    isLoading: false,
    initialize: jest.fn(async () => {
      set({ sessionToken: 'initial-session', isInitialized: true });
    }),
  }));
  return { useAuthStore: store };
});

// Real socket transport; the peer only acknowledges the session handshake.
const { WebSocket: NativeWebSocket, WebSocketServer } = jest.requireActual('ws');
const clients: any[] = [];
const classClients: WebSocketClient[] = [];
class ObservedWebSocket extends NativeWebSocket {
  constructor(url: string) {
    super(url);
    clients.push(this);
  }
}
let server: any;
let url: string;
let tokens: string[];
let received: string[];
const options = { reconnectDelay: 10, maxReconnectAttempts: 2 };
const originalWebSocket = global.WebSocket;

beforeEach(async () => {
  tokens = [];
  received = [];
  clients.length = 0;
  useAuthStore.setState({ sessionToken: null, isInitialized: false, isLoading: false });
  jest.mocked(useAuthStore.getState().initialize).mockClear();
  global.WebSocket = ObservedWebSocket as unknown as typeof WebSocket;
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>(resolve => server.once('listening', resolve));
  url = `ws://127.0.0.1:${server.address().port}`;
  server.on('connection', (ws: any) => {
    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      received.push(message.type);
      if (message.type === 'authenticate') {
        tokens.push(message.payload.token);
        if (message.payload.token === 'refused-session') ws.close(1008, 'Invalid or expired session');
        else ws.send(JSON.stringify({ type: 'connected', payload: { clientId: 'peer' } }));
      }
    });
  });
});

afterEach(async () => {
  cleanup();
  for (const client of classClients.splice(0)) client.disconnect();
  // Detach observers before terminating sockets even when a test fails.
  for (const client of clients) {
    client.onclose = null;
    client.onerror = () => {};
  }
  // Let any erroneous retries finish before closing this test's real listener.
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const client of clients) client.terminate();
  for (const client of server.clients) client.terminate();
  await new Promise<void>(resolve => server.close(resolve));
  global.WebSocket = originalWebSocket;
});

it('initializes the session when the socket hook is mounted on a fresh visit', async () => {
  const { result } = renderHook(() => useWebSocket(url, options));
  await waitFor(() => expect(useAuthStore.getState().initialize).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  expect(tokens).toEqual(['initial-session']);
});

it('does not reconnect with the previous token after logout', async () => {
  useAuthStore.setState({ sessionToken: 'old-session', isInitialized: true });
  const { result } = renderHook(() => useWebSocket(url, options));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  act(() => useAuthStore.setState({ sessionToken: null }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  expect(tokens).toEqual(['old-session']);
  expect(result.current.isConnected).toBe(false);
});

it('ignores a late close from the previous session after the new socket connects', async () => {
  useAuthStore.setState({ sessionToken: 'old-session', isInitialized: true });
  const { result } = renderHook(() => useWebSocket(url, options));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  const oldSocket = clients[0];
  const oldClose = oldSocket.onclose;
  act(() => useAuthStore.setState({ sessionToken: 'new-session' }));
  await waitFor(() => expect(tokens).toContain('new-session'));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  act(() => oldClose.call(oldSocket, new CloseEvent('close')));
  expect(result.current.isConnected).toBe(true);
});

it('answers the server heartbeat so the server keeps the socket open', async () => {
  useAuthStore.setState({ sessionToken: 'live-session', isInitialized: true });
  const { result } = renderHook(() => useWebSocket(url, options));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  for (const peer of server.clients) peer.send(JSON.stringify({ type: 'ping' }));
  await waitFor(() => expect(received).toContain('pong'));
});

it('does not retry a session the server refused', async () => {
  useAuthStore.setState({ sessionToken: 'refused-session', isInitialized: true });
  const { result } = renderHook(() => useWebSocket(url, options));
  await waitFor(() => expect(tokens).toContain('refused-session'));
  await waitFor(() => expect(clients[0].readyState).toBe(NativeWebSocket.CLOSED));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  expect(tokens).toEqual(['refused-session']);
  act(() => result.current.connect());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  expect(tokens).toEqual(['refused-session']);
  act(() => useAuthStore.setState({ sessionToken: 'replacement-session' }));
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  expect(tokens).toEqual(['refused-session', 'replacement-session']);
});

it.each(['local-guest-1', 'offline-guest-1'])('does not offer offline-only session %s to the server', async sessionToken => {
  useAuthStore.setState({ sessionToken, isInitialized: true });
  renderHook(() => useWebSocket(url, options));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  expect(clients).toHaveLength(0);
});


it('the client class answers the server heartbeat', async () => {
  useAuthStore.setState({ sessionToken: 'live-session', isInitialized: true });
  const client = new WebSocketClient(url, options);
  classClients.push(client);
  client.connect();
  await waitFor(() => expect(client.isConnected()).toBe(true));
  for (const peer of server.clients) peer.send(JSON.stringify({ type: 'ping' }));
  await waitFor(() => expect(received).toContain('pong'));
});

it.each(['local-guest-1', 'offline-guest-1'])('the client class skips offline-only session %s', async sessionToken => {
  useAuthStore.setState({ sessionToken, isInitialized: true });
  const client = new WebSocketClient(url, options);
  classClients.push(client);
  client.connect();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(clients).toHaveLength(0);
});

it('the client class waits for a changed session after a policy refusal', async () => {
  useAuthStore.setState({ sessionToken: 'refused-session', isInitialized: true });
  const client = new WebSocketClient(url, options);
  classClients.push(client);
  client.connect();
  await waitFor(() => expect(tokens).toContain('refused-session'));
  await waitFor(() => expect(clients[0].readyState).toBe(NativeWebSocket.CLOSED));
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(tokens).toEqual(['refused-session']);
  client.connect();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(tokens).toEqual(['refused-session']);
  useAuthStore.setState({ sessionToken: 'replacement-session' });
  client.connect();
  await waitFor(() => expect(client.isConnected()).toBe(true));
  expect(tokens).toEqual(['refused-session', 'replacement-session']);
});


it('keeps one signed-in socket across callback changes and calls the latest handler', async () => {
  useAuthStore.setState({ sessionToken: 'live-session', isInitialized: true });
  const first = jest.fn();
  const latest = jest.fn();
  const { result, rerender } = renderHook(({ onMessage }) => useWebSocket(url, { ...options, onMessage }), {
    initialProps: { onMessage: first },
  });
  await waitFor(() => expect(result.current.isConnected).toBe(true));
  rerender({ onMessage: latest });
  for (const peer of server.clients) peer.send(JSON.stringify({ type: 'metrics' }));
  await waitFor(() => expect(latest).toHaveBeenCalledWith({ type: 'metrics' }));
  expect(first).not.toHaveBeenCalledWith({ type: 'metrics' });
  expect(clients).toHaveLength(1);
  expect(tokens).toEqual(['live-session']);
});
