# Person C release and viva checklist

## Automated local checks

- `npm test` and `npm run build` in frontend.
- `python3 -m unittest discover -s tests -v` at root.
- Verify complete fixture counts, four unique queue positions and consistent run/tick display.
- Ensure fixture data cannot send live commands; exports identify their source.

## Team acceptance — requires real Person A and Person B code

- [ ] Agree on authoritative JSON Schema, command argument shapes, trace payload and Oscillation preset.
- [ ] Mount both pages under one provider; navigation preserves run ID, tick and active signal.
- [ ] Connect: welcome then full state; validate all vehicle/count invariants.
- [ ] Start, pause, step exactly one tick, reset; configure seed/scenario while paused.
- [ ] Disconnect: show reconnecting, freeze current view, disable commands; reconnect with fresh complete state.
- [ ] East Surge / seed 42 yields real congestion and sort events, accepted order after clearance.
- [ ] Fairness Trap emits fairness override for a nonempty overdue approach.
- [ ] Oscillation emits hysteresis rejection; no fabricated trace or frontend scheduling.
- [ ] GREEN → YELLOW → ALL_RED transitions; no simultaneous incoming greens.
- [ ] Baseline/adaptive matrix: four scenarios × five seeds, identical recorded arrivals and capacities/timings.
- [ ] Import and export measured report; discuss regressions and finite-horizon queue backlog.
- [ ] 1,000-tick per-preset engine tests supplied by Person A pass.
- [ ] Person B's scene meets rendering targets and matches controller snapshot.
- [ ] Check narrow/mobile layout, keyboard controls and reduced motion on target laptop.
- [ ] Offline demo: installed dependencies, local backend, system-font fallback.

## Viva script

Use the **Demo guide** tab for the six-part walkthrough. Begin by explaining backend authority and ownership. Identify the linked list's null end and circular queue's tail-to-head edge. Explain `2Q + 0.5W`, stable Bubble Sort comparisons, fairness ≥30 ticks and hysteresis ≥3 points for two planning boundaries. Replay actual Python events while explaining that replay never advances the engine. End with measured comparisons and tradeoffs. Spillback is optional and must be labelled as an approximation if implemented by the backend.
