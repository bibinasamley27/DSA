import { useRef, useState } from "react";
import { Upload, Download, FlaskConical } from "lucide-react";
import css from "../pages/ControllerPage.module.css";
interface Row {
  scenario: string;
  seed: number;
  controller: "fixed" | "adaptive";
  arrived: number;
  departed: number;
  mean_wait_ticks: number;
  p95_wait_ticks: number;
  max_wait_ticks: number;
  switches: number;
  rejected_arrivals: number;
  fairness_overrides: number;
  arrival_schedule_sha256: string;
}
export interface Report {
  report_version: "1.0";
  duration_ticks: number;
  rows: Row[];
}
export function validateReport(v: unknown): v is Report {
  if (!v || typeof v !== "object") return false;
  const r = v as Report;
  return (
    r.report_version === "1.0" &&
    Number.isInteger(r.duration_ticks) &&
    r.duration_ticks > 0 &&
    Array.isArray(r.rows) &&
    r.rows.length > 0 &&
    r.rows.every(
      (x) =>
        typeof x.scenario === "string" &&
        Number.isInteger(x.seed) &&
        ["fixed", "adaptive"].includes(x.controller) &&
        typeof x.arrival_schedule_sha256 === "string" &&
        [
          "arrived",
          "departed",
          "mean_wait_ticks",
          "p95_wait_ticks",
          "max_wait_ticks",
          "switches",
          "rejected_arrivals",
          "fairness_overrides",
        ].every(
          (k) =>
            typeof x[k as keyof Row] === "number" &&
            Number(x[k as keyof Row]) >= 0,
        ),
    ) &&
    r.rows.every((x) =>
      r.rows.some(
        (y) =>
          y.scenario === x.scenario &&
          y.seed === x.seed &&
          y.controller !== x.controller &&
          y.arrival_schedule_sha256 === x.arrival_schedule_sha256,
      ),
    )
  );
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BenchmarkPanel() {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  return (
    <section className={css.panel}>
      <div className={css.panelHeader}>
        <div>
          <span className={css.eyebrow}>BENCHMARK RESULTS</span>
          <h2>Fixed vs. adaptive</h2>
        </div>
        <FlaskConical size={21} />
      </div>
      <div className={css.benchmarkActions}>
        <button onClick={() => file.current?.click()}>
          <Upload size={15} /> Load report
        </button>
        <button
          disabled={!report}
          onClick={() => downloadJson(report, "benchmark-report.json")}
        >
          <Download size={15} /> Export JSON
        </button>
        <input
          hidden
          ref={file}
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              const v = JSON.parse(await f.text());
              if (!validateReport(v))
                throw Error(
                  "Invalid report: each fixed/adaptive pair must share the same schedule hash and contain all metrics.",
                );
              setReport(v);
              setError("");
            } catch (err) {
              setError(String(err));
            }
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {report ? (
        <div className={css.tableWrap}>
          <p>
            {report.rows.length} measured runs · {report.duration_ticks} ticks
            per run
          </p>
          <table>
            <thead>
              <tr>
                {[
                  "Scenario / seed",
                  "Mode",
                  "Departed",
                  "Mean",
                  "p95",
                  "Max",
                  "Switches",
                  "Rejected",
                  "Rescues",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.scenario} / {r.seed}
                  </td>
                  <td>{r.controller}</td>
                  <td>{r.departed}</td>
                  <td>{r.mean_wait_ticks.toFixed(2)}s</td>
                  <td>{r.p95_wait_ticks}s</td>
                  <td>{r.max_wait_ticks}s</td>
                  <td>{r.switches}</td>
                  <td>{r.rejected_arrivals}</td>
                  <td>{r.fairness_overrides}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={css.benchmarkEmpty}>
          <FlaskConical size={30} />
          <h3>No benchmark report loaded</h3>
          <p>
            Import a report from the Python benchmark runner to compare both
            controllers on identical arrival schedules.
          </p>
          <code>python3 scripts/benchmark.py --adapter your_adapter</code>
          <p>Test matrix: 4 scenarios × 5 seeds × 2 controllers</p>
        </div>
      )}
    </section>
  );
}
