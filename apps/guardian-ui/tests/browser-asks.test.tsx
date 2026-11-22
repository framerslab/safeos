/** @jest-environment jsdom */
/**
 * What the browser has answered for the camera and for notifications
 *
 * The dashboard says when the camera or notifications are blocked for this
 * site and offers the fix that is owed. It reads the browser's own answer and
 * follows a change of it. A browser that will not say reads as unknown, and
 * nothing throws.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useCameraAsk, useNotificationAsk } from '@/lib/browser-asks';

function CameraAnswer() {
  return <p data-testid="camera">{useCameraAsk()}</p>;
}

function NotificationAnswer() {
  const { ask, request } = useNotificationAsk();
  return (
    <>
      <p data-testid="notifications">{ask}</p>
      <button type="button" onClick={() => void request()}>
        Ask
      </button>
    </>
  );
}

const settle = () => act(async () => {});
const reads = (id: string) => screen.getByTestId(id).textContent;

interface StatusStandIn {
  state: PermissionState;
  onchange: (() => void) | null;
}

function permissionsAnswer(query: () => Promise<StatusStandIn>) {
  const stand = { query: jest.fn(query) };
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: stand });
  return stand;
}

function notifications(permission: NotificationPermission, answer: NotificationPermission) {
  const stand = {
    permission,
    requestPermission: jest.fn(async () => {
      stand.permission = answer;
      return answer;
    }),
  };
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: stand });
  return stand;
}

afterEach(() => {
  cleanup();
  delete (navigator as unknown as { permissions?: unknown }).permissions;
  delete (window as unknown as { Notification?: unknown }).Notification;
});

it("reads the camera's answer and follows a change", async () => {
  const status: StatusStandIn = { state: 'denied', onchange: null };
  const stand = permissionsAnswer(async () => status);
  render(<CameraAnswer />);
  await settle();

  expect(stand.query).toHaveBeenCalledWith({ name: 'camera' });
  expect(reads('camera')).toBe('blocked');

  act(() => {
    status.state = 'granted';
    status.onchange?.();
  });
  expect(reads('camera')).toBe('granted');

  cleanup();
  permissionsAnswer(async () => ({ state: 'prompt', onchange: null }));
  render(<CameraAnswer />);
  await settle();
  expect(reads('camera')).toBe('not-asked');
});

it('answers unknown where the browser will not say', async () => {
  const stand = permissionsAnswer(() => Promise.reject(new TypeError("'camera' is not a valid value for enumeration PermissionName.")));
  render(<CameraAnswer />);
  await settle();
  expect(stand.query).toHaveBeenCalled();
  expect(reads('camera')).toBe('unknown');

  cleanup();
  delete (navigator as unknown as { permissions?: unknown }).permissions;
  render(<CameraAnswer />);
  await settle();
  expect(reads('camera')).toBe('unknown');
});

it('reads notifications and asks the browser once', async () => {
  const granting = notifications('default', 'granted');
  render(<NotificationAnswer />);
  await settle();
  expect(reads('notifications')).toBe('not-asked');

  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await settle();
  expect(granting.requestPermission).toHaveBeenCalledTimes(1);
  expect(reads('notifications')).toBe('granted');

  cleanup();
  const refusing = notifications('default', 'denied');
  render(<NotificationAnswer />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await settle();
  expect(refusing.requestPermission).toHaveBeenCalledTimes(1);
  expect(reads('notifications')).toBe('blocked');
});

it('answers unknown in a browser without notifications', async () => {
  delete (window as unknown as { Notification?: unknown }).Notification;
  const { result } = renderHook(() => useNotificationAsk());
  await settle();
  expect(result.current.ask).toBe('unknown');
  // A request that throws or rejects fails the case here.
  await act(async () => {
    await result.current.request();
  });
  expect(result.current.ask).toBe('unknown');
});
