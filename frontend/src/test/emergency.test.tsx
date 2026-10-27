import { fireEvent, render, screen } from '@testing-library/react';
import { EmergencyControl } from '../components/Controls';
import { validateCommand } from '../net/commands';
import { parseServerMessage } from '../net/protocol';
import { initialState, type SimState } from '../net/store';
import { buildLog } from '../lib/decisionLog';
import { crossingAllowed } from '../lib/pedestrians';
import type { DecisionEvent, StateSnapshot } from '../types/simulation';
import emergency from '../fixtures/emergency.json';
import { frame, raw } from './helpers';

const frames = emergency as unknown as StateSnapshot[];
const withAmbulance = frames.find((f) => f.preemption !== null)!;

describe('protocol: emergency fields', () => {
  it('accepts recorded engine states with ambulances and pre-emption', () => {
    for (const f of frames) expect(parseServerMessage(raw(f)).ok).toBe(true);
    const r = parseServerMessage(raw(withAmbulance));
    expect(r.ok && r.message.kind === 'state' && r.message.preemption?.direction).toBe(withAmbulance.preemption!.direction);
  });
  it('treats pre-emption-era recordings as cars only, with no pre-emption', () => {
    const r = parseServerMessage(raw(frame(20)));
    expect(r.ok && r.message.kind === 'state' && r.message.preemption).toBeNull();
    expect(r.ok && r.message.kind === 'state' && r.message.vehicles.every((v) => v.kind === 'car')).toBe(true);
  });
  it('rejects a pre-emption that does not name a queued ambulance on that approach', () => {
    const wrong = { ...withAmbulance, preemption: { ...withAmbulance.preemption!, vehicle_id: 999_999 } };
    expect(parseServerMessage(raw(wrong)).ok).toBe(false);
    expect(parseServerMessage(raw({ ...withAmbulance, vehicles: [{ ...withAmbulance.vehicles[0]!, kind: 'tank' }] })).ok).toBe(false);
  });
});

describe('spawn_emergency command', () => {
  it('is allowed while running and blocked when that approach already has an ambulance waiting', () => {
    const d = withAmbulance.preemption!.direction;
    expect(validateCommand({ command: 'spawn_emergency', direction: d }, { ...withAmbulance, sim_status: 'running' })).toMatch(/already/);
    const other = (['N', 'E', 'S', 'W'] as const).find((x) => !withAmbulance.vehicles.some((v) => v.kind === 'ambulance' && v.direction === x))!;
    expect(validateCommand({ command: 'spawn_emergency', direction: other }, { ...withAmbulance, sim_status: 'running' })).toBeNull();
  });
  it('sends the command from the UI', () => {
    const on = vi.fn();
    const sim: SimState = { ...initialState('live'), connection: 'open', snapshot: { ...frame(5), sim_status: 'running' } };
    render(<EmergencyControl sim={sim} onCommand={on} />);
    fireEvent.change(screen.getByLabelText('Ambulance approach'), { target: { value: 'W' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send ambulance' }));
    expect(on).toHaveBeenCalledWith({ command: 'spawn_emergency', direction: 'W' });
  });
  it('is disabled in mock mode', () => {
    render(<EmergencyControl sim={{ ...initialState('mock'), connection: 'open', snapshot: frame(5) }} onCommand={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Send ambulance' })).toBeDisabled();
  });
});

describe('decision log and pedestrians with pre-emption', () => {
  const events = frames.flatMap((f) => f.decisions).filter((e: DecisionEvent) => e.type !== 'ARRIVAL');
  const log = buildLog(events);
  it('explains pre-emption greens without counting them as planned slots', () => {
    const pre = log.filter((x) => x.type === 'green' && x.cause === 'preempt');
    expect(pre.length).toBeGreaterThan(0);
    for (const g of log) if (g.type === 'green' && g.cause === 'plan' && g.slot !== null) expect(g.order![g.slot - 1]).toBe(g.direction);
    expect(log.filter((x) => x.type === 'emergency').map((x) => x.type === 'emergency' && x.stage)).toEqual(
      expect.arrayContaining(['detected', 'start', 'end']));
  });
  it('pedestrians do not start crossing while an ambulance is waiting', () => {
    const s = { ...withAmbulance, phase: 'GREEN' as const, phase_remaining: 8, sim_status: 'running' as const };
    const arm = s.active_direction === 'N' || s.active_direction === 'S' ? 'E' : 'N';
    expect(crossingAllowed(arm, s, s.tick)).toBe(false);
    expect(crossingAllowed(arm, { ...s, preemption: null }, s.tick)).toBe(true);
  });
});
