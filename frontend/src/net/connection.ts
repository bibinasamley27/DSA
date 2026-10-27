// Process-wide singleton: one store, one transport, independent of which page is mounted.
import { useSyncExternalStore } from 'react';
import { getMockScript } from '../fixtures';
import { MockTransport } from './mockTransport';
import { SimStore, type SimState } from './store';
import { DEFAULT_WS_URL, WebSocketTransport } from './transports';

export const store = new SimStore('live');
const wsUrl = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;
let started = false;

export function connectLive() {
  store.reset('live');
  store.attach(new WebSocketTransport(store, wsUrl));
  started = true;
}

export function connectMock(scriptId: string) {
  store.reset('mock', scriptId);
  store.attach(new MockTransport(store, getMockScript(scriptId)));
  started = true;
}

export function disconnect() {
  store.detach();
  started = false;
}

/** Idempotent app start. Mock mode only when explicitly requested with ?mock=<fixture id>. */
export function startConnection(search: string = location.search) {
  if (started) return;
  const mock = new URLSearchParams(search).get('mock');
  if (mock) connectMock(mock); else connectLive();
}

export const useSimState = (): SimState => useSyncExternalStore(store.subscribe, store.getState);
