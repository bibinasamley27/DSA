import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import fixture from "../../../test-fixtures/state.json";
import fairnessFixture from "../../../test-fixtures/fairness.json";
import stabilityFixture from "../../../test-fixtures/oscillation.json";
const fixtures = {
  east_surge: fixture,
  fairness_trap: fairnessFixture,
  oscillation: stabilityFixture,
};
export type FixtureCase = keyof typeof fixtures;
import {
  type StateSnapshot,
  type DecisionEvent,
  type Command,
} from "../types/simulation";
import { SnapshotGate, isSnapshot, isDecision, mergeEvents } from "./protocol";
interface Store {
  fixtureCase: FixtureCase;
  setFixtureCase: (c: FixtureCase) => void;
  state: StateSnapshot | null;
  events: DecisionEvent[];
  source: "fixture" | "live";
  status: string;
  error: string;
  pending: number;
  setSource: (s: "fixture" | "live") => void;
  send: (c: Command, args?: Record<string, unknown>) => void;
}
const Context = createContext<Store | null>(null);
export function SimulationProvider({ children }: { children: ReactNode }) {
  const [fixtureCase, setFixtureCase] = useState<FixtureCase>("east_surge");
  const [source, setSource] = useState<"fixture" | "live">("fixture"),
    [state, setState] = useState<StateSnapshot | null>(
      fixture as StateSnapshot,
    ),
    [events, setEvents] = useState<DecisionEvent[]>(
      fixture.decisions as DecisionEvent[],
    ),
    [status, setStatus] = useState("Fixture preview"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0);
  const socket = useRef<WebSocket | null>(null),
    requests = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    setError("");
    setPending(0);
    requests.current.forEach(clearTimeout);
    requests.current.clear();
    if (source === "fixture") {
      setState(fixtures[fixtureCase] as StateSnapshot);
      setEvents(fixtures[fixtureCase].decisions as DecisionEvent[]);
      setStatus("Fixture preview");
      return;
    }
    setState(null);
    setEvents([]);
    let closed = false,
      retries = 0,
      timer: ReturnType<typeof setTimeout>;
    const gate = new SnapshotGate();
    function connect() {
      setStatus(retries ? "Reconnecting" : "Connecting");
      const ws = new WebSocket(
        import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/v1/simulation",
      );
      socket.current = ws;
      ws.onopen = () => {
        if (closed) return;
        retries = 0;
        gate.reconnect();
        setStatus("Connected · awaiting snapshot");
      };
      ws.onmessage = (e) => {
        if (closed) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.protocol_version !== "1.0")
            throw Error("Unsupported protocol version");
          if (msg.kind === "state") {
            if (!isSnapshot(msg)) throw Error("Invalid state snapshot");
            const oldRun = gate.current?.run_id;
            if (gate.accept(msg)) {
              setState(msg);
              setEvents((prev) =>
                mergeEvents(oldRun === msg.run_id ? prev : [], msg.decisions),
              );
              setStatus("Connected");
            }
          } else if (msg.kind === "decision_trace") {
            if (msg.run_id === gate.current?.run_id) {
              const incoming = Array.isArray(msg.payload?.events)
                ? msg.payload.events
                : [];
              if (!incoming.every(isDecision))
                throw Error("Invalid trace event");
              setEvents((prev) => mergeEvents(prev, incoming));
            }
          } else if (msg.kind === "error" || msg.kind === "ack") {
            const timeout = requests.current.get(msg.request_id);
            if (timeout) {
              clearTimeout(timeout);
              requests.current.delete(msg.request_id);
              setPending(requests.current.size);
            }
            if (msg.kind === "error")
              setError(
                typeof msg.message === "string"
                  ? msg.message
                  : JSON.stringify(
                      msg.payload || msg.error || "Command rejected",
                    ),
              );
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Invalid server message",
          );
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("Reconnecting");
        requests.current.forEach(clearTimeout);
        requests.current.clear();
        setPending(0);
        timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 10000));
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket.current?.close();
      requests.current.forEach(clearTimeout);
      requests.current.clear();
    };
  }, [source, fixtureCase]);
  function send(command: Command, args?: Record<string, unknown>) {
    if (
      source !== "live" ||
      socket.current?.readyState !== WebSocket.OPEN ||
      status !== "Connected"
    )
      return;
    const request_id = crypto.randomUUID();
    setError("");
    requests.current.set(
      request_id,
      setTimeout(() => {
        requests.current.delete(request_id);
        setPending(requests.current.size);
        setError(
          "Command acknowledgement timed out. Check backend connection.",
        );
      }, 5000),
    );
    setPending(requests.current.size);
    socket.current.send(
      JSON.stringify({
        protocol_version: "1.0",
        kind: "command",
        command,
        request_id,
        ...(args ? { args } : {}),
      }),
    );
  }
  return (
    <Context.Provider
      value={{
        fixtureCase,
        setFixtureCase,
        state,
        events,
        source,
        status,
        error,
        pending,
        setSource,
        send,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSimulation() {
  const value = useContext(Context);
  if (!value) throw Error("SimulationProvider required");
  return value;
}
