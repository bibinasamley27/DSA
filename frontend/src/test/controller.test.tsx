import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Shell } from "../components/Shell";
import ControllerPage from "../pages/ControllerPage";
import SimulationPage from "../pages/SimulationPage";
import { store } from "../net/connection";
import { frame, raw, ack, errorMsg } from "./helpers";
import fairnessTrap from "../../../backend/fixtures/fairness_trap.trace.json";
import oscillation from "../../../backend/fixtures/oscillation.trace.json";
import type { DecisionEvent } from "../types/simulation";

// jsdom cannot create WebGL; keep the real page, controls, HUD and shared store.
vi.mock("../scene/Scene", () => ({ Scene: () => <div data-testid="scene" /> }));

const send = vi.fn((_text: string) => true);
const connect = vi.fn(() => store.setConnection("open"));
const close = vi.fn();
function renderPages() {
  return render(
    <MemoryRouter initialEntries={["/controller"]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="controller" element={<ControllerPage />} />
          <Route index element={<SimulationPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
function receive(over: Parameters<typeof frame>[1] = {}) {
  store.ingest(raw(frame(5, { sim_status: "paused", ...over })));
}
beforeEach(() => {
  vi.clearAllMocks();
  store.reset("live");
  store.attach({ connect, send, close });
  receive();
});
afterEach(() => {
  cleanup();
  store.reset("live");
});

describe("controller on the shared connection", () => {
  it("renders every dashboard module rather than the placeholder", () => {
    renderPages();
    for (const name of [
      "Visualizing SIGNAL_CONTROLLER",
      "Traffic linked list",
      "Circular signal queue",
      "Bubble sort playback",
      "Priority breakdown",
      "Fairness, stability & spillback",
      "Decision log",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Benchmarks" }));
    expect(
      screen.getByRole("heading", { name: "Controller Comparison" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Demo guide" }));
    expect(
      screen.getByRole("heading", { name: "Project Demonstration" }),
    ).toBeInTheDocument();
  });
  it("preserves the same snapshot and transport across both real pages", () => {
    const snapshot = store.getState().snapshot;
    renderPages();
    fireEvent.click(screen.getByRole("link", { name: "Simulation" }));
    expect(screen.getByTestId("scene")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Controller" }));
    expect(
      screen.getByRole("heading", { name: "Visualizing SIGNAL_CONTROLLER" }),
    ).toBeInTheDocument();
    expect(store.getState().snapshot).toBe(snapshot);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
  it("uses the existing top-level command fields and displays rejection replies", () => {
    renderPages();
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario" }), {
      target: { value: "fairness_trap" },
    });
    const command = JSON.parse(send.mock.calls[0]![0] as unknown as string);
    expect(command).toMatchObject({
      protocol_version: "1.0",
      kind: "command",
      command: "set_scenario",
      scenario: "fairness_trap",
    });
    expect(command).not.toHaveProperty("args");
    act(() =>
      store.ingest(
        errorMsg(command.request_id, 100, store.getState().snapshot!.run_id),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid command or lifecycle state",
    );
  });
  it("settles acknowledgements through the shared store", () => {
    renderPages();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    const record = store.getState().commands[0]!;
    act(() =>
      store.ingest(
        ack(record.requestId, 100, store.getState().snapshot!.run_id),
      ),
    );
    expect(store.getState().commands[0]?.status).toBe("accepted");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });
  it("blocks setup and step while running, and blocks stale and mock controls", () => {
    receive({ sequence_number: 100, sim_status: "running" });
    renderPages();
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    expect(screen.getByTitle("Advance one tick")).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Playback speed" }),
    ).toBeDisabled();
    act(() => store.setConnection("reconnecting"));
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(
      screen.getByText("Disconnected · stale snapshot"),
    ).toBeInTheDocument();
    act(() => {
      store.reset("mock", "east_surge");
      store.setConnection("open");
      receive();
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });
  it("shows a waiting state without an authoritative snapshot", () => {
    store.reset("live");
    renderPages();
    expect(
      screen.getByRole("heading", { name: "Waiting for a complete snapshot" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Traffic linked list" }),
    ).not.toBeInTheDocument();
  });
  it("explains real engine decisions: sort playback, fairness override and green slots", () => {
    const run = store.getState().snapshot!.run_id;
    const feed = (trace: unknown, seq: number) => {
      const decisions = (trace as { decisions: DecisionEvent[] }).decisions.filter((e) => e.tick <= 120);
      act(() => store.ingest(raw({ protocol_version: "1.0", kind: "decision_trace", run_id: run, sequence_number: seq, tick: 120, payload: { decisions } })));
    };
    feed(fairnessTrap, 50);
    renderPages();
    expect(screen.getByText(/SORT_TRACE · t=/)).toBeInTheDocument();
    expect(screen.getAllByText(/fairness override: \w waited \d+s/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/slot \d of 4 in the order committed at t=/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Next sort step" }));
    expect(screen.getByText(/step 2\//)).toBeInTheDocument();
    cleanup();
    store.reset("live");
    store.attach({ connect, send, close });
    receive();
    feed(oscillation, 60);
    renderPages();
    expect(screen.getAllByText(/hysteresis rejected/).length).toBeGreaterThan(0);
  });
});
