import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { SimulationProvider, useSimulation } from "./SimulationStore";
import ControllerPage from "../pages/ControllerPage";
import { BubbleSortPlayback } from "../components/Diagrams";
import fixture from "../../../test-fixtures/state.json";
class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    MockSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  send(s: string) {
    this.sent.push(s);
  }
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
function Probe() {
  const s = useSimulation();
  return (
    <>
      <button onClick={() => s.setSource("live")}>Connect test</button>
      <button onClick={() => s.send("step")}>Step test</button>
      <output data-testid="status">{s.status}</output>
      <output data-testid="tick">{s.state?.tick ?? "none"}</output>
      <output data-testid="events">{s.events.length}</output>
      <output data-testid="pending">{s.pending}</output>
      <output data-testid="error">{s.error}</output>
    </>
  );
}
function connect() {
  fireEvent.click(screen.getByText("Connect test"));
  const ws = MockSocket.instances.at(-1)!;
  act(() => ws.open());
  return ws;
}
beforeEach(() => {
  vi.useFakeTimers();
  MockSocket.instances = [];
  vi.stubGlobal("WebSocket", MockSocket);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("shared provider integration", () => {
  it("changes authored preview cases without opening a socket", () => {
    render(
      <SimulationProvider>
        <ControllerPage />
      </SimulationProvider>,
    );
    fireEvent.change(screen.getByLabelText("Fixture case"), {
      target: { value: "fairness_trap" },
    });
    expect(screen.getByText("fixture-fairness-rescue")).toBeTruthy();
    expect(screen.getAllByText(/South is nonempty/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Fixture case"), {
      target: { value: "oscillation" },
    });
    expect(screen.getByText(/No sort events received/)).toBeTruthy();
    expect(MockSocket.instances).toHaveLength(0);
  });
  it("wires visible live controls to commands and disables setup while running", () => {
    render(
      <SimulationProvider>
        <ControllerPage />
      </SimulationProvider>,
    );
    fireEvent.change(screen.getByLabelText("Data source"), {
      target: { value: "live" },
    });
    const ws = MockSocket.instances.at(-1)!;
    act(() => ws.open());
    act(() => ws.message(fixture));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const cmd = JSON.parse(ws.sent[0]);
    expect(cmd.command).toBe("start");
    act(() => {
      ws.message({
        protocol_version: "1.0",
        kind: "ack",
        request_id: cmd.request_id,
      });
      ws.message({ ...fixture, sequence_number: 50, sim_status: "running" });
    });
    expect(
      (screen.getByLabelText("Scenario") as HTMLSelectElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(JSON.parse(ws.sent[1]).command).toBe("pause");
  });

  it("waits for a full state, ignores stale messages, handles missing traces and commands", () => {
    render(
      <SimulationProvider>
        <Probe />
      </SimulationProvider>,
    );
    const ws = connect();
    expect(screen.getByTestId("tick").textContent).toBe("none");
    act(() => ws.message(fixture));
    expect(screen.getByTestId("tick").textContent).toBe("24");
    act(() => ws.message({ ...fixture, tick: 1, sequence_number: 1 }));
    expect(screen.getByTestId("tick").textContent).toBe("24");
    act(() =>
      ws.message({
        protocol_version: "1.0",
        kind: "decision_trace",
        run_id: fixture.run_id,
        payload: {},
      }),
    );
    expect(screen.getByTestId("events").textContent).toBe("8");
    fireEvent.click(screen.getByText("Step test"));
    const command = JSON.parse(ws.sent[0]);
    expect(command).toMatchObject({
      protocol_version: "1.0",
      kind: "command",
      command: "step",
    });
    expect(command.request_id).toBeTruthy();
    act(() =>
      ws.message({
        protocol_version: "1.0",
        kind: "ack",
        request_id: command.request_id,
      }),
    );
    expect(screen.getByTestId("pending").textContent).toBe("0");
  });
  it("freezes on disconnect then waits for a fresh reconnect snapshot", () => {
    render(
      <SimulationProvider>
        <Probe />
      </SimulationProvider>,
    );
    const ws = connect();
    act(() => ws.message(fixture));
    act(() => ws.close());
    expect(screen.getByTestId("status").textContent).toBe("Reconnecting");
    expect(screen.getByTestId("tick").textContent).toBe("24");
    fireEvent.click(screen.getByText("Step test"));
    expect(ws.sent).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1000));
    const fresh = MockSocket.instances.at(-1)!;
    expect(fresh).not.toBe(ws);
    act(() => fresh.open());
    expect(screen.getByTestId("status").textContent).toBe(
      "Connected · awaiting snapshot",
    );
    act(() =>
      fresh.message({
        ...fixture,
        run_id: "new",
        sequence_number: 1,
        tick: 30,
      }),
    );
    expect(screen.getByTestId("tick").textContent).toBe("30");
  });
  it("surfaces invalid state, server errors and acknowledgement timeout", () => {
    render(
      <SimulationProvider>
        <Probe />
      </SimulationProvider>,
    );
    const ws = connect();
    act(() => ws.message({ ...fixture, direction_states: [] }));
    expect(screen.getByTestId("error").textContent).toBe(
      "Invalid state snapshot",
    );
    act(() => ws.message(fixture));
    fireEvent.click(screen.getByText("Step test"));
    const cmd = JSON.parse(ws.sent[0]);
    act(() =>
      ws.message({
        protocol_version: "1.0",
        kind: "error",
        request_id: cmd.request_id,
        message: "Step requires paused status",
      }),
    );
    expect(screen.getByTestId("error").textContent).toContain("paused");
    fireEvent.click(screen.getByText("Step test"));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("error").textContent).toContain("timed out");
  });
  it("does not reconnect or lose state on page navigation, and fixture controls are disabled", () => {
    render(
      <SimulationProvider>
        <ControllerPage />
      </SimulationProvider>,
    );
    expect(
      (screen.getByRole("button", { name: "Start" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Benchmarks" }));
    expect(screen.getByText("Controller Comparison")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "DSA Controller" }));
    expect(screen.getByText("fixture-east-surge")).toBeTruthy();
    expect(MockSocket.instances).toHaveLength(0);
  });
  it("displays missing sort trace without inventing operations", () => {
    render(<BubbleSortPlayback events={[]} runId="empty" />);
    expect(screen.getByText(/No sort events received/)).toBeTruthy();
    expect(
      (screen.getByTitle("Play trace") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
