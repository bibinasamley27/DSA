import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controls, Playback } from '../components/Controls';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { HUD } from '../scene/HUD';
import { initialState, type SimState } from '../net/store';
import { frame } from './helpers';

const live = (over: Partial<SimState> = {}): SimState => ({ ...initialState('live'), connection: 'open', snapshot: frame(5, { sim_status: 'paused' }), ...over });

describe('Controls', () => {
  it('disables everything without a snapshot/connection', () => {
    render(<Playback sim={initialState()} onCommand={vi.fn()} />);
    for (const name of ['Start', 'Pause', 'Step', 'Reset simulation']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });
  it('submits start and step when paused', async () => {
    const on = vi.fn();
    render(<Playback sim={live()} onCommand={on} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(on).toHaveBeenNthCalledWith(1, { command: 'start' });
    expect(on).toHaveBeenNthCalledWith(2, { command: 'step' });
  });
  it('blocks step/reset/setup while running but allows pause', () => {
    const sim = live({ snapshot: frame(5, { sim_status: 'running' }) });
    const { unmount } = render(<Playback sim={sim} onCommand={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset simulation' })).toBeDisabled();
    unmount();
    render(<Controls sim={sim} onCommand={vi.fn()} />);
    expect(screen.getByLabelText('Speed')).toBeDisabled();
  });
  it('sends scenario and speed selections', async () => {
    const on = vi.fn();
    render(<Controls sim={live()} onCommand={on} />);
    await userEvent.selectOptions(screen.getByLabelText('Scenario'), 'fairness_trap');
    await userEvent.selectOptions(screen.getByLabelText('Speed'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Signal mode'), 'fixed');
    expect(on).toHaveBeenCalledWith({ command: 'set_scenario', scenario: 'fairness_trap' });
    expect(on).toHaveBeenCalledWith({ command: 'set_speed', speed: 2 });
    expect(on).toHaveBeenCalledWith({ command: 'set_controller', controller_mode: 'fixed' });
  });
  it('validates the seed before sending', async () => {
    const on = vi.fn();
    render(<Controls sim={live()} onCommand={on} />);
    const input = screen.getByLabelText('Seed');
    await userEvent.clear(input);
    expect(screen.getByRole('button', { name: 'Apply seed' })).toBeDisabled();
    await userEvent.type(input, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Apply seed' }));
    expect(on).toHaveBeenCalledWith({ command: 'set_seed', seed: 7 });
  });
  it('reports server acknowledgement vs rejection', () => {
    const { rerender } = render(<Controls sim={live({ commands: [{ requestId: 'a', label: 'start', status: 'accepted' }] })} onCommand={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('accepted by server, awaiting new state');
    rerender(<Controls sim={live({ commands: [{ requestId: 'a', label: 'start', status: 'rejected', message: 'nope' }] })} onCommand={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('rejected by server');
  });
});

describe('HUD', () => {
  it('shows unavailable markers rather than zeros without data', () => {
    render(<HUD sim={initialState()} />);
    expect(screen.getByTestId('active-direction')).toHaveTextContent('—');
  });
  it('mirrors the snapshot and shows None during all-red', () => {
    const s = frame(5, { phase: 'ALL_RED', active_direction: null });
    render(<HUD sim={live({ snapshot: s })} />);
    expect(screen.getByTestId('active-direction')).toHaveTextContent('None');
    expect(screen.getByText('All red (clearance)')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(5);
  });
  it('warns when showing a stale snapshot', () => {
    render(<HUD sim={live({ stale: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Disconnected/);
  });
});

describe('ConnectionBadge', () => {
  it('labels mock mode and offers retry on failure', async () => {
    const retry = vi.fn();
    render(<ConnectionBadge sim={live({ mode: 'mock', connection: 'failed', error: 'boom' })} onRetry={retry} />);
    expect(screen.getByText('MOCK DATA')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});
