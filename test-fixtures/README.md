# Development fixtures — illustrative, not measured runs

- `state.json`: complete East Surge snapshot, comparison/swap trace from an illustrative partial sort pass and hysteresis rejection.
- `fairness.json`: complete fairness rescue snapshot and decision descriptions.
- `oscillation.json`: complete snapshot with a stability rejection and intentionally no sort trace, exercising the empty state.
- `decision_trace.json`: separate trace message with repeated IDs, demonstrating deduplication.

All snapshots have four directions, four unique queue positions, matching queued vehicle counts, integer IDs and valid v1.0 fields. They are authored UI fixtures, not saved outputs from Person A's engine. Do not use their metrics in benchmark reports.
