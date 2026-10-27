import { it, expect } from "vitest";
import { validateReport } from "./BenchmarkPanel";
it("rejects unpaired or unmeasured reports and accepts matching schedules", () => {
  const row = {
    scenario: "balanced",
    seed: 42,
    controller: "fixed",
    arrived: 3,
    departed: 1,
    mean_wait_ticks: 2,
    p95_wait_ticks: 2,
    max_wait_ticks: 2,
    switches: 1,
    rejected_arrivals: 0,
    fairness_overrides: 0,
    arrival_schedule_sha256: "a".repeat(64),
  };
  const r = { report_version: "1.0", duration_ticks: 1000, rows: [row] };
  expect(validateReport(r)).toBe(false);
  r.rows.push({ ...row, controller: "adaptive" });
  expect(validateReport(r)).toBe(true);
  r.rows[1]!.arrival_schedule_sha256 = "different";
  expect(validateReport(r)).toBe(false);
});
