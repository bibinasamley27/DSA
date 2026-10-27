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
      "Traffic Signal Controller",
      "Traffic linked list",
      "Circular signal queue",
      "Priority breakdown",
      "Bubble sort playback",
      "Decision timeline",
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
      screen.getByRole("heading", { name: "Traffic Signal Controller" }),
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
});
