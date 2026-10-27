import { describe, it, expect } from "vitest";
import fixture from "../../../test-fixtures/state.json";
import fairness from "../../../test-fixtures/fairness.json";
import stability from "../../../test-fixtures/oscillation.json";
import { isSnapshot, SnapshotGate, mergeEvents } from "./protocol";
import type { StateSnapshot, DecisionEvent } from "../types/simulation";
const snapshot = () => structuredClone(fixture) as StateSnapshot;
describe("v1.0 consumer contract", () => {
  it("validates fairness and stability preview cases", () => {
    expect(isSnapshot(fairness)).toBe(true);
    expect(isSnapshot(stability)).toBe(true);
  });
  it("accepts the complete fixture and checks visual queue conservation", () => {
    expect(isSnapshot(snapshot())).toBe(true);
    const s = snapshot();
    s.direction_states[0].queue_count++;
    expect(isSnapshot(s)).toBe(false);
  });
  it("rejects malformed phases and queue permutations", () => {
    const s = snapshot();
    s.queue_order = ["N", "N", "S", "W"];
    expect(isSnapshot(s)).toBe(false);
    s.queue_order = ["N", "E", "S", "W"];
    s.phase = "ALL_RED";
    expect(isSnapshot(s)).toBe(false);
    s.active_direction = null;
    expect(isSnapshot(s)).toBe(true);
  });
  it("rejects old sequences and delayed previous-run snapshots", () => {
    const gate = new SnapshotGate(),
      a = snapshot();
    expect(gate.accept(a)).toBe(true);
    expect(gate.accept(a)).toBe(false);
    expect(gate.accept({ ...a, sequence_number: 1 })).toBe(false);
    expect(gate.accept({ ...a, run_id: "new-run", sequence_number: 1 })).toBe(
      true,
    );
    expect(gate.accept({ ...a, sequence_number: 999 })).toBe(false);
  });
  it("starts a fresh stream epoch on reconnect", () => {
    const gate = new SnapshotGate();
    gate.accept(snapshot());
    gate.reconnect();
    expect(gate.current).toBe(null);
    expect(gate.accept({ ...snapshot(), sequence_number: 1 })).toBe(true);
  });
  it("deduplicates chronological events and tolerates missing events", () => {
    const e = snapshot().decisions;
    expect(mergeEvents(e, e)).toHaveLength(e.length);
    expect(mergeEvents([], [])).toEqual([]);
    expect(mergeEvents([], e.slice().reverse()).map((x) => x.event_id)).toEqual(
      e.map((x) => x.event_id),
    );
    expect(
      mergeEvents(
        [],
        Array.from({ length: 600 }, (_, i) => ({
          ...e[0],
          event_id: i,
        })) as DecisionEvent[],
      ),
    ).toHaveLength(500);
  });
});
