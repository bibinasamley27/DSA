# Development fixtures

## Illustrative visualization examples

- `state.json`: complete East Surge snapshot, comparison/swap trace from an illustrative partial sort pass and hysteresis rejection.
- `fairness.json`: complete fairness rescue snapshot and decision descriptions.
- `oscillation.json`: complete snapshot with a stability rejection and intentionally no sort trace, exercising the empty state.
- `decision_trace.json`: separate trace message with repeated IDs, demonstrating deduplication.

All snapshots have four directions, four unique queue positions, matching queued vehicle counts, integer IDs and valid v1.0 fields. They are authored UI fixtures, not saved outputs from Person A's engine. Do not use their metrics in benchmark reports.
## Measured benchmark integration fixture

`benchmark.json` is an actual 80-tick East Surge / seed 42 fixed-adaptive pair
measured with `team_benchmark_adapter` and the default backend configuration.
It includes the recorded schedule and its SHA-256 hash. Python tests rerun both
rows against the real engine; frontend tests import and export this same report
without dropping the configuration or schedule evidence. This file is measured
output, unlike the authored visualization examples above.
