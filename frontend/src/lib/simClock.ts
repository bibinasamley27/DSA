// Presentation clock in simulation ticks. Follows the authoritative `tick`, advances smoothly between snapshots
// while the server says "running", freezes when paused/stale, and never runs more than one snapshot step ahead.
import type { StateSnapshot } from '../types/simulation';

export class SimClock {
  private tick = 0;
  private seenAt = 0;
  private step = 1;       // ticks between consecutive snapshot ticks (2 at 4× speed with 2 Hz broadcasts)
  private speed = 1;
  private running = false;
  private held = 0;
  private epoch = -1;

  update(s: StateSnapshot | null, epoch: number, receivedAt: number, stale: boolean) {
    if (!s) { this.epoch = -1; this.running = false; this.held = 0; this.tick = 0; return; }
    if (epoch !== this.epoch) {
      this.epoch = epoch;
      this.tick = s.tick; this.held = s.tick; this.seenAt = receivedAt; this.step = 1;
    } else if (s.tick !== this.tick) {
      this.step = Math.max(1, s.tick - this.tick);
      this.tick = s.tick; this.seenAt = receivedAt;
    }
    this.speed = s.speed;
    this.running = s.sim_status === 'running' && !stale;
  }

  /** Monotonic within a run; bounded to `tick + step` (just under), so no uncontrolled extrapolation. */
  value(now: number): number {
    const frac = this.running ? Math.min(this.step - 0.05, Math.max(0, ((now - this.seenAt) * this.speed) / 1000)) : 0;
    this.held = Math.max(this.held, this.tick + frac);
    return this.held;
  }
}
