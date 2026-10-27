import asyncio
import copy
import pytest
from fastapi.testclient import TestClient
from app.api import app, Simulation
from app.arrivals import Arrivals, generate_schedule
from app.controller import Controller
from app.engine import Engine
from app.models import Config, DIRECTIONS, DirectionState, StateSnapshot
from app.scenarios import PRESETS
from app.structures import SignalQueue, TrafficList, bubble_sort


def command(name, **kwargs):
    return dict(protocol_version='1.0', kind='command', request_id='test', command=name) | kwargs


def normalized(engine):
    state = engine.snapshot().model_dump()
    state.pop('run_id')
    state.pop('sequence_number')
    return state


def invariants(engine):
    snapshot = engine.snapshot()
    StateSnapshot.model_validate_json(snapshot.model_dump_json())
    assert engine.metrics.generated - engine.metrics.rejected - engine.metrics.departed == len(snapshot.vehicles)
    assert len({v.id for v in snapshot.vehicles}) == len(snapshot.vehicles)
    assert len(engine.crossing) <= 1
    assert all(s.queue_count <= engine.config.capacity for s in snapshot.direction_states)
    assert engine.signals.tail.next is engine.signals.head


def test_structures():
    traffic = TrafficList()
    assert [node.direction for node in traffic] == list(DIRECTIONS)
    assert traffic.get('W').next is None
    with pytest.raises(KeyError):
        traffic.get('X')
    queue = SignalQueue()
    assert [queue.advance() for _ in range(12)] == list(DIRECTIONS) * 3
    assert queue.current is queue.head and queue.tail.next is queue.head
    queue.reorder(['E', 'S', 'W', 'N'])
    assert queue.advance() == 'E'
    with pytest.raises(ValueError):
        queue.reorder(['N'] * 4)
    order, events = bubble_sort(DIRECTIONS, dict(N=1, E=3, S=3, W=2))
    assert order == ['E', 'S', 'W', 'N']
    assert sum(kind == 'SORT_COMPARE' for kind, _ in events) == 6
    assert sum(kind == 'SORT_SWAP' for kind, _ in events) == 3
    assert events[0][1]['left'] == 'N'


def test_arrivals():
    schedule = generate_schedule(42, 'east_surge', 100)
    assert schedule == generate_schedule(42, 'east_surge', 100)
    assert schedule != generate_schedule(43, 'east_surge', 100)
    source = Arrivals(99, 'balanced', schedule)
    assert tuple(source.at(t) for t in range(1, 101)) == schedule
    assert source.at(101) == ()
    with pytest.raises(ValueError):
        Arrivals(1, 'balanced', [('X',)])


@pytest.mark.parametrize('scenario', PRESETS)
@pytest.mark.parametrize('mode', ['fixed', 'adaptive'])
def test_thousand_ticks_and_repeatability(scenario, mode):
    schedule = generate_schedule(42, scenario, 1000)
    a, b = Engine(scenario=scenario, controller_mode=mode), Engine(scenario=scenario, controller_mode=mode, schedule=schedule)
    transitions = {'GREEN': 'YELLOW', 'YELLOW': 'ALL_RED', 'ALL_RED': 'GREEN'}
    for _ in range(1000):
        old_phase, old_direction = a.phase, a.active_direction
        a.advance()
        b.advance()
        if old_phase != a.phase:
            assert a.phase == transitions[old_phase]
        if old_phase == a.phase == 'GREEN':
            assert old_direction == a.active_direction
        invariants(a)
        assert normalized(a) == normalized(b)


def test_capacity_reset_and_scores():
    engine = Engine(config=Config(capacity=2), schedule=[('E',) * 4])
    initial = normalized(engine)
    engine.advance()
    assert engine.metrics.generated == 4 and engine.metrics.rejected == 2
    east = engine.direction_states()[1]
    assert east.priority_score == 4
    engine.advance()
    assert engine.direction_states()[1].priority_score == 4.5
    old_run, seq = engine.run_id, engine.sequence_number
    engine.command(command('reset'))
    assert engine.run_id != old_run
    assert normalized(engine) == initial
    assert engine.sequence_number > seq
    engine.advance()
    assert engine.metrics.rejected == 2


def states(counts, waits=None):
    waits = waits or [0] * 4
    return [DirectionState(direction=d, queue_count=q, max_wait_ticks=w,
                           priority_score=2*q+.5*w, congestion_flag=q >= 5)
            for d, q, w in zip(DIRECTIONS, counts, waits)]


def test_fairness_and_hysteresis():
    controller, events = Controller(), []
    emit = lambda kind, direction, data: events.append((kind, direction, data))
    order = list(DIRECTIONS)
    candidate = states([1, 9, 2, 3])
    assert controller.plan(order, candidate, emit, 'adaptive') == order
    assert any(e[0] == 'HYSTERESIS_REJECT' for e in events)
    assert controller.plan(order, candidate, emit, 'adaptive') == ['E', 'W', 'S', 'N']
    overdue = states([0, 1, 1, 1], [100, 30, 40, 40])
    assert controller.plan(order, overdue, emit, 'adaptive')[0] == 'S'
    assert controller.plan(order, overdue, emit, 'fixed') == order
    insignificant = states([5, 6, 0, 0])
    for _ in range(5):
        assert controller.plan(order, insignificant, emit, 'adaptive') == order
    assert controller.streak == 0


def test_round_finishes_before_replanning():
    engine = Engine(config=Config(green=2, yellow=1, all_red=1), schedule=[('W',)] * 100)
    greens = ['N']
    events = []
    for _ in range(100):
        old = engine.phase
        engine.advance()
        events.extend(engine.decisions)
        if old == 'ALL_RED':
            greens.append(engine.active_direction)
    assert greens[:4] == list(DIRECTIONS)
    assert any(e.type == 'FAIRNESS_OVERRIDE' for e in events)
    for event in events:
        if event.type == 'ORDER_COMMITTED':
            assert event.tick % 16 == 0


@pytest.mark.parametrize('raw', [command('unknown'), command('set_seed', seed=True), command('set_seed', seed='4'),
    command('set_speed', speed=True), command('set_speed', speed=3), command('set_scenario', scenario='missing'),
    command('set_controller', controller_mode='ml'), command('step', extra=1), {}, None, [], command('reset', protocol_version='2.0')])
def test_invalid_commands_have_no_side_effects(raw):
    engine = Engine()
    before = copy.deepcopy(engine.__dict__)
    state = normalized(engine)
    with pytest.raises((ValueError, TypeError)):
        engine.command(raw)
    assert normalized(engine) == state
    assert engine.run_id == before['run_id']
    assert engine.arrivals.rng.getstate() == before['arrivals'].rng.getstate()


def test_lifecycle():
    engine = Engine()
    engine.command(command('start'))
    for raw in [command('step'), command('reset'), command('set_seed', seed=3), command('set_speed', speed=2)]:
        with pytest.raises(ValueError):
            engine.command(raw)
    assert engine.tick == 0 and engine.seed == 42
    engine.command(command('pause'))
    engine.command(command('step'))
    assert engine.tick == 1
    for name, args in [('set_seed', {'seed': 3}), ('set_scenario', {'scenario': 'east_surge'}),
                       ('set_controller', {'controller_mode': 'fixed'}), ('set_speed', {'speed': 4})]:
        engine.command(command(name, **args))
    assert (engine.seed, engine.scenario, engine.controller_mode, engine.speed) == (3, 'east_surge', 'fixed', 4)
    assert engine.tick == 0


def test_websocket():
    with TestClient(app) as client:
        assert client.get('/health').json()['status'] == 'ok'
        with client.websocket_connect('/ws/v1/simulation') as a, client.websocket_connect('/ws/v1/simulation') as b:
            welcome, state = a.receive_json(), a.receive_json()
            assert welcome['kind'] == 'welcome'
            StateSnapshot.model_validate(state)
            b.receive_json()
            b.receive_json()
            a.send_json(command('step'))
            ack, stepped = a.receive_json(), a.receive_json()
            assert ack['kind'] == 'ack' and stepped['tick'] == 1
            assert b.receive_json() == stepped
            assert ack['sequence_number'] < stepped['sequence_number']
            a.send_text('invalid json')
            error, unchanged = a.receive_json(), a.receive_json()
            assert error['kind'] == 'error' and unchanged['tick'] == 1
            a.send_json(command('reset'))
            a.receive_json()
            reset = a.receive_json()
            assert reset['run_id'] != stepped['run_id'] and reset['tick'] == 0
            assert reset['sequence_number'] > unchanged['sequence_number']
        with pytest.raises(Exception):
            with client.websocket_connect('/ws/v1/simulation', headers={'origin': 'https://other.example'}):
                pass


def test_owner_loop_pause_and_speed():
    async def check():
        simulation = Simulation()
        task = asyncio.create_task(simulation.run())
        outbox = asyncio.Queue()
        simulation.clients.add(outbox)
        async def send(raw):
            await simulation.commands.put((raw, outbox))
            ack = await outbox.get()
            while ack['kind'] == 'decision_trace':
                ack = await outbox.get()
            snapshot = await outbox.get()
            assert ack['kind'] == 'ack'
            return snapshot
        try:
            await send(command('set_speed', speed=4))
            await send(command('start'))
            await asyncio.sleep(.6)
            assert simulation.engine.tick >= 2
            while not outbox.empty():
                outbox.get_nowait()
            await send(command('pause'))
            tick = simulation.engine.tick
            await asyncio.sleep(.3)
            assert simulation.engine.tick == tick
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(check())


def test_fixed_baseline_comparison():
    from benchmark import benchmark
    rows = benchmark(ticks=100, seeds=[42])
    for i in range(0, len(rows), 2):
        fixed, adaptive = rows[i:i+2]
        assert fixed['generated'] == adaptive['generated']
        assert fixed['config'] == adaptive['config']
        assert fixed['switches'] == adaptive['switches']
        assert fixed['fairness_overrides'] == 0
        assert fixed['controller_mode'] == 'fixed'
        assert adaptive['controller_mode'] == 'adaptive'


def test_demo_acceptance_traces():
    for scenario, expected in [('east_surge', 'SORT_SWAP'), ('fairness_trap', 'FAIRNESS_OVERRIDE'),
                               ('oscillation', 'HYSTERESIS_REJECT')]:
        engine = Engine(scenario=scenario)
        events = []
        for _ in range(200):
            engine.advance()
            events.extend(engine.decisions)
        assert any(event.type == expected for event in events)
        if scenario == 'east_surge':
            assert any(event.type == 'ORDER_COMMITTED' and event.data['order'] != list(DIRECTIONS) for event in events)


def test_slow_client_cannot_block_owner():
    simulation = Simulation()
    outbox = asyncio.Queue(maxsize=1)
    simulation.clients.add(outbox)
    outbox.put_nowait({'kind': 'state'})
    simulation.enqueue(outbox, {'kind': 'decision_trace'})
    assert outbox.get_nowait() is None
    assert outbox not in simulation.clients


def test_published_contract_and_traces():
    import json
    from pathlib import Path
    from pydantic import TypeAdapter
    from app.models import Reply
    from app.engine import COMMAND
    root = Path(__file__).parents[1]
    assert json.loads((root/'fixtures/simulation.schema.json').read_text()) == TypeAdapter(StateSnapshot | Reply).json_schema()
    assert json.loads((root/'fixtures/commands.schema.json').read_text()) == COMMAND.json_schema()
    StateSnapshot.model_validate_json((root/'fixtures/mock_state.json').read_text())
    StateSnapshot.model_validate_json((root.parent/'docs/sample_protocol_state.json').read_text())
    for file in (root/'fixtures').glob('*.trace.json'):
        trace = json.loads(file.read_text())
        for snapshot in trace['snapshots']:
            StateSnapshot.model_validate(snapshot)
        ids = [event['event_id'] for event in trace['decisions']]
        assert ids == list(range(1, len(ids)+1))
        for event in trace['decisions']:
            assert 1 <= event['tick'] <= trace['ticks']
