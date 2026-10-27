import type { Transport, SimStore } from './store';

export const DEFAULT_WS_URL = 'ws://localhost:8000/ws/v1/simulation';
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
export const MAX_RECONNECT_ATTEMPTS = BACKOFF_MS.length + 3;

/** One socket at a time, bounded exponential backoff, then 'failed' until the user retries. */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closed = false;

  constructor(private store: SimStore, private url: string = DEFAULT_WS_URL) {}

  connect() {
    this.closed = false;
    this.attempts = 0;
    this.open();
  }

  private open() {
    if (this.ws || this.closed) return; // never hold two sockets
    this.store.setConnection(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { return this.scheduleRetry(); }
    this.ws = ws;
    ws.onopen = () => { this.attempts = 0; this.store.setConnection('open'); };
    ws.onmessage = (e) => { if (this.ws === ws && typeof e.data === 'string') this.store.ingest(e.data); };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.scheduleRetry(); } };
    ws.onerror = () => { /* onclose always follows; retry is handled there */ };
  }

  private scheduleRetry() {
    if (this.closed) return;
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) return this.store.setConnection('failed');
    const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)] ?? 8000;
    this.attempts += 1;
    this.store.setConnection('reconnecting');
    this.timer = setTimeout(() => { this.timer = null; this.open(); }, delay);
  }

  send(text: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(text);
    return true;
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; ws.close(); }
    this.store.setConnection('closed');
  }
}
