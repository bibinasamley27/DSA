// Single shared snapshot store. Owns protocol ordering rules; pages only subscribe.
import type { DecisionEvent, StateSnapshot } from '../types/simulation';
import { buildCommand, validateCommand, type CommandInput } from './commands';
import { parseServerMessage, traceDecisions } from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed';
export type CommandStatus = 'sent' | 'accepted' | 'applied' | 'rejected' | 'timeout' | 'not_sent';

export interface CommandRecord {
  requestId: string;
  label: string;
  status: CommandStatus;
  message?: string;
  ackSequence?: number;
}

export interface SimState {
  mode: 'live' | 'mock';
  /** Fixture id when mode is 'mock'. */
  mockId: string | null;
  connection: ConnectionStatus;
  /** Latest accepted authoritative snapshot (kept, but flagged stale, while disconnected). */
  snapshot: StateSnapshot | null;
  /** Incremented whenever a snapshot starts a new run; consumers must not interpolate across it. */
  runEpoch: number;
  /** Wall-clock ms at which `snapshot` was accepted (presentation timing only). */
  receivedAt: number;
  /** True when `snapshot` predates a disconnect and no newer state has arrived. */
  stale: boolean;
  decisions: DecisionEvent[];
  /** Same events minus ARRIVAL, kept longer: planning traces survive heavy arrival traffic (up to ~140 arrivals per round). */
  plan: DecisionEvent[];
  commands: CommandRecord[];
  /** Latest protocol/server problem for the UI; cleared when a valid state arrives. */
  error: string | null;
  rejected: { malformed: number; staleSequence: number; staleRun: number };
}

export interface Transport {
  connect(): void;
  send(text: string): boolean;
  close(): void;
}

const MAX_DECISIONS = 200;
const MAX_PLAN = 300;
const MAX_COMMANDS = 8;
const ACK_TIMEOUT_MS = 5000;

export const initialState = (mode: SimState['mode'] = 'live', mockId: string | null = null): SimState => ({
  mode, mockId, connection: 'idle', snapshot: null, runEpoch: 0, receivedAt: 0, stale: false,
  decisions: [], plan: [], commands: [], error: null, rejected: { malformed: 0, staleSequence: 0, staleRun: 0 },
});

export class SimStore {
  private state: SimState;
  private listeners = new Set<() => void>();
  private lastSequence = 0;
  private retiredRuns = new Set<string>();
  private seenEvents = new Set<string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private counter = 0;
  private transport: Transport | null = null;

  constructor(mode: SimState['mode'] = 'live', private now: () => number = () => performance.now()) {
    this.state = initialState(mode);
  }

  // --- subscription interface (useSyncExternalStore-compatible) ---
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getState = (): SimState => this.state;

  private set(patch: Partial<SimState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // --- transport lifecycle ---
  attach(transport: Transport) {
    this.detach();
    this.transport = transport;
    transport.connect();
  }

  /** Close the transport and drop pending command timers. Keeps the last snapshot (flagged stale). */
  detach() {
    this.transport?.close();
    this.transport = null;
    this.clearTimers();
  }

  dispose() {
    this.detach();
    this.listeners.clear();
  }

  /** Forget everything (used when switching live/mock so runs never mix). */
  reset(mode: SimState['mode'], mockId: string | null = null) {
    this.detach();
    this.lastSequence = 0;
    this.retiredRuns.clear();
    this.seenEvents.clear();
    this.set(initialState(mode, mockId));
  }

  setConnection(connection: ConnectionStatus) {
    if (connection === 'open') {
      // A fresh socket gets welcome + full snapshot; the server's sequence may have restarted.
      this.lastSequence = 0;
      return this.set({ connection, error: null });
    }
    if (connection === 'connecting') return this.set({ connection });
    this.failPending('Connection lost before the server replied');
    this.set({ connection, stale: this.state.snapshot !== null });
  }

  // --- inbound ---
  ingest(raw: string) {
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) {
      const rejected = { ...this.state.rejected, malformed: this.state.rejected.malformed + 1 };
      this.set({ rejected, error: `Malformed server message: ${parsed.error}` });
      return;
    }
    const m = parsed.message;
    switch (m.kind) {
      case 'state': return this.acceptState(m);
      case 'decision_trace': return this.acceptTrace(m.run_id, m.sequence_number, traceDecisions(m));
      case 'welcome': return;
      case 'ack': return this.settle(String(m.payload.request_id), 'accepted', undefined, m.sequence_number);
      case 'error': {
        const message = typeof m.payload.message === 'string' ? m.payload.message : 'Server rejected the command';
        const id = m.payload.request_id;
        if (typeof id === 'string' && this.state.commands.some((c) => c.requestId === id)) this.settle(id, 'rejected', message);
        else this.set({ error: message });
      }
    }
  }

  private reject(kind: 'staleSequence' | 'staleRun') {
    this.set({ rejected: { ...this.state.rejected, [kind]: this.state.rejected[kind] + 1 } });
  }

  private acceptState(s: StateSnapshot) {
    const cur = this.state.snapshot;
    if (this.retiredRuns.has(s.run_id)) return this.reject('staleRun');
    if (s.sequence_number <= this.lastSequence) return this.reject('staleSequence');
    this.lastSequence = s.sequence_number;
    const newRun = cur !== null && cur.run_id !== s.run_id;
    if (newRun) {
      this.retiredRuns.add(cur.run_id);
      this.seenEvents.clear();
    }
    const logs = this.mergeDecisions(newRun ? { decisions: [], plan: [] } : this.state, s.run_id, s.decisions);
    const commands = this.state.commands.map((c) =>
      c.status === 'accepted' && (c.ackSequence ?? 0) < s.sequence_number ? { ...c, status: 'applied' as const } : c);
    this.set({
      snapshot: s, receivedAt: this.now(), stale: false, error: null, ...logs, commands,
      runEpoch: this.state.runEpoch + (cur === null || newRun ? 1 : 0),
    });
  }

  private acceptTrace(runId: string, sequence: number, events: DecisionEvent[]) {
    if (runId !== this.state.snapshot?.run_id) return this.reject('staleRun');
    if (sequence <= this.lastSequence) return this.reject('staleSequence');
    this.lastSequence = sequence; // traces share the server's sequence with states
    this.set(this.mergeDecisions(this.state, runId, events));
  }

  private mergeDecisions(base: Pick<SimState, 'decisions' | 'plan'>, runId: string, incoming: DecisionEvent[]): Pick<SimState, 'decisions' | 'plan'> {
    const fresh = incoming.filter((e) => {
      const key = `${runId}/${e.event_id}`;
      if (this.seenEvents.has(key)) return false;
      this.seenEvents.add(key);
      return true;
    });
    if (fresh.length === 0) return { decisions: base.decisions, plan: base.plan };
    const planning = fresh.filter((e) => e.type !== 'ARRIVAL');
    return {
      decisions: [...base.decisions, ...fresh].slice(-MAX_DECISIONS),
      plan: planning.length ? [...base.plan, ...planning].slice(-MAX_PLAN) : base.plan,
    };
  }

  // --- outbound ---
  /** Validates, then sends. The record reflects only what the server later says. */
  sendCommand(input: CommandInput): CommandRecord {
    const requestId = `fe-${Date.now().toString(36)}-${++this.counter}`;
    const record: CommandRecord = { requestId, label: input.command, status: 'sent' };
    const problem = validateCommand(input, this.state.snapshot)
      ?? (this.state.connection !== 'open' ? 'Not connected' : null);
    if (problem) return this.track({ ...record, status: 'not_sent', message: problem });
    if (!this.transport?.send(JSON.stringify(buildCommand(input, requestId)))) {
      return this.track({ ...record, status: 'not_sent', message: 'Not connected' });
    }
    this.timers.set(requestId, setTimeout(() => this.settle(requestId, 'timeout', 'No reply from server'), ACK_TIMEOUT_MS));
    return this.track(record);
  }

  private track(record: CommandRecord): CommandRecord {
    this.set({ commands: [record, ...this.state.commands].slice(0, MAX_COMMANDS) });
    return record;
  }

  private settle(requestId: string, status: CommandStatus, message?: string, ackSequence?: number) {
    const pending = this.state.commands.find((c) => c.requestId === requestId);
    if (!pending || pending.status !== 'sent') return; // foreign ack (other client) or already settled
    clearTimeout(this.timers.get(requestId));
    this.timers.delete(requestId);
    this.set({ commands: this.state.commands.map((c) => (c.requestId === requestId ? { ...c, status, message, ackSequence } : c)) });
  }

  private failPending(message: string) {
    this.state.commands.filter((c) => c.status === 'sent').forEach((c) => this.settle(c.requestId, 'timeout', message));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
