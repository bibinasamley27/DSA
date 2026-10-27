from random import Random

import pytest

from app.engine import Engine
from app.models import DIRECTIONS, VehicleState
from app.structures import EmergencyHeap


def cmd(name, **extra):
    return {'protocol_version': '1.0', 'kind': 'command', 'request_id': 'r', 'command': name, **extra}


def run(engine, ticks, spawns=None, trace=None):
    """Advance tick by tick; `spawns` maps tick -> directions to call an ambulance on before that tick."""
    for _ in range(ticks):
        for d in (spawns or {}).get(engine.tick, ()):
            engine.command(cmd('spawn_emergency', direction=d))
        engine.advance()
        snap = engine.snapshot().model_copy(deep=True)  # validated; copied because crossing vehicles are live objects
        if trace is not None:
            trace.append(snap)


def test_heap_orders_by_arrival_then_direction_and_removes_anywhere():
    heap = EmergencyHeap()
    for i, (tick, d) in enumerate([(5, 'W'), (3, 'S'), (3, 'N'), (9, 'E'), (1, 'E')]):
        heap.push(VehicleState(id=i + 1, direction=d, arrival_tick=tick, kind='ambulance'))
    assert heap.remove(4).id == 4                       # remove from the middle keeps the heap valid
    order = []
    while heap.peek() is not None:
        order.append((heap.peek().arrival_tick, heap.peek().direction))
        heap.remove(heap.peek().id)
    assert order == [(1, 'E'), (3, 'N'), (3, 'S'), (5, 'W')]
    assert heap.remove(99) is None


def test_spawn_is_allowed_while_running_and_validated():
    e = Engine(scenario='zero_demand')
    e.command(cmd('start'))
    e.command(cmd('spawn_emergency', direction='E'))
    snap = e.snapshot()
    assert [v.kind for v in snap.vehicles] == ['ambulance']
    assert snap.preemption.direction == 'E' and snap.metrics.emergencies == 1
    assert any(d.type == 'EMERGENCY_DETECTED' for d in snap.decisions)
    with pytest.raises(ValueError):
        e.command(cmd('spawn_emergency', direction='E'))  # one waiting ambulance per approach
    with pytest.raises(ValueError):
        e.command(cmd('spawn_emergency', direction='X'))
    with pytest.raises(ValueError):
        e.command(cmd('spawn_emergency'))


def test_red_approach_is_cleared_through_yellow_and_all_red_within_bound():
    e = Engine(seed=7, scenario='east_surge')
    run(e, 30)
    target = next(d for d in DIRECTIONS if d != e.active_direction and e.phase == 'GREEN') if e.phase == 'GREEN' else 'S'
    ahead = len(e.traffic.get(target).vehicles)
    trace = []
    run(e, 60, {e.tick: [target]}, trace)
    served = [s for s in trace if any(v.kind == 'ambulance' and v.status == 'CROSSING' for v in s.vehicles)]
    assert served, 'ambulance never crossed'
    wait = served[0].tick - (trace[0].tick - 1)
    cfg = e.config
    assert wait <= 1 + cfg.yellow + cfg.all_red + ahead + 1
    # the lane ahead of the ambulance was flushed in order, under a pre-emption green
    starts = [d for s in trace for d in s.decisions if d.type == 'PREEMPT_START']
    assert starts and starts[0].direction == target


def test_already_green_lane_is_held_not_shortened():
    e = Engine(scenario='zero_demand')
    e.command(cmd('spawn_emergency', direction='N'))  # N is green at tick 0
    trace = []
    run(e, 3, trace=trace)
    assert any(v.kind == 'ambulance' and v.status == 'CROSSING' for v in trace[0].vehicles)
    assert all(s.active_direction == 'N' and s.phase == 'GREEN' for s in trace)  # normal green continues


def test_cut_short_approach_gets_its_green_back():
    e = Engine(scenario='balanced', seed=3)
    run(e, 2)
    assert e.phase == 'GREEN'
    interrupted = e.active_direction
    other = next(d for d in DIRECTIONS if d != interrupted)
    trace = []
    run(e, 40, {e.tick: [other]}, trace)
    greens = [(d.direction, d.data.get('reason')) for s in trace for d in s.decisions if d.type == 'PHASE_CHANGE' and d.data['phase'] == 'GREEN']
    assert greens[0] == (other, 'preempt')
    assert greens[1] == (interrupted, 'resume')


@pytest.mark.parametrize('mode', ['adaptive', 'fixed'])
@pytest.mark.parametrize('scenario', ['balanced', 'east_surge', 'fairness_trap', 'oscillation'])
def test_safety_holds_under_random_ambulances(mode, scenario):
    rng = Random(f'{mode}-{scenario}')
    spawns = {}
    for t in range(0, 900, 13):
        spawns.setdefault(t + rng.randrange(13), []).append(rng.choice(DIRECTIONS))
    e = Engine(seed=11, scenario=scenario, controller_mode=mode)
    trace = []
    for _ in range(1000):
        for d in spawns.get(e.tick, ()):
            if not any(v.kind == 'ambulance' for v in e.traffic.get(d).vehicles):
                e.command(cmd('spawn_emergency', direction=d))
        e.advance()
        trace.append(e.snapshot().model_copy(deep=True))
    prev = None
    for s in trace:
        if prev and s.phase == 'GREEN' and prev.phase == 'GREEN':
            assert s.active_direction == prev.active_direction    # a green only ever follows yellow + all-red
        if prev and s.phase == 'GREEN' and prev.phase != 'GREEN':
            assert prev.phase == 'ALL_RED'
        if prev and s.phase == 'ALL_RED' and prev.phase != 'ALL_RED':
            assert prev.phase == 'YELLOW'
        prev = s
    m = e.metrics
    assert m.emergencies > 50 and len(m.emergency_waits) >= m.emergencies - 4
    assert max(m.emergency_waits) <= 1 + e.config.yellow + e.config.all_red + e.config.capacity + 2 + 4 * 15
    queued = sum(len(n.vehicles) for n in e.traffic)
    assert m.generated - m.rejected - m.departed == queued + len(e.crossing)


def test_deterministic_with_the_same_spawns():
    def go():
        e = Engine(seed=5, scenario='fairness_trap')
        trace = []
        run(e, 200, {20: ['W'], 21: ['E'], 90: ['N', 'S']}, trace)
        return [s.model_dump(exclude={'run_id', 'sequence_number'}) for s in trace]
    assert go() == go()


def test_command_time_events_reach_the_next_tick_trace_once():
    e = Engine(scenario='zero_demand')
    e.command(cmd('spawn_emergency', direction='S'))
    e.advance()
    first = [d.type for d in e.decisions]
    e.advance()
    assert 'EMERGENCY_DETECTED' in first and 'EMERGENCY_DETECTED' not in [d.type for d in e.decisions]
