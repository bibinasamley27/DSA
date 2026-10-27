"""Real-engine integration tests; no synthetic benchmark measurements."""
import copy
import json
from pathlib import Path

import pytest

import team_benchmark_adapter as adapter
from backend.app.arrivals import generate_schedule
from backend.app.engine import Engine
from backend.app.models import Config, DIRECTIONS
from scripts.benchmark import DEFAULT_CONFIG, run_matrix


def test_schedule_matches_backend_seeded_arrivals():
    rows = adapter.generate_schedule(scenario='east_surge', seed=42, duration_ticks=100)
    expected = generate_schedule(42, 'east_surge', 100)
    assert rows == [{d: row.count(d) for d in DIRECTIONS} for row in expected]
    assert rows == adapter.generate_schedule(scenario='east_surge', seed=42, duration_ticks=100)


@pytest.mark.parametrize('mode', ['fixed', 'adaptive'])
def test_adapter_matches_direct_engine_and_preserves_inputs(mode):
    arrivals = [dict(N=0, E=3, S=1, W=0) for _ in range(80)]
    config = Config(green=2, yellow=1, all_red=1, capacity=3, congestion_threshold=2).model_dump()
    before = copy.deepcopy((arrivals, config))
    measured = adapter.run(controller=mode, scenario='east_surge', seed=42,
                           duration_ticks=80, arrivals=arrivals, config=config)
    schedule = [tuple(d for d in DIRECTIONS for _ in range(row[d])) for row in arrivals]
    engine = Engine(seed=42, scenario='east_surge', controller_mode=mode,
                    config=Config(**config), schedule=schedule)
    for _ in range(80):
        engine.advance()
    expected = engine.metrics.report()
    expected['rejected_arrivals'] = expected.pop('rejected')
    assert measured == expected
    assert measured['rejected_arrivals'] > 0 and measured['departed'] > 0
    assert measured['generated'] == 320
    assert measured['arrived'] - measured['departed'] == len(engine.snapshot().vehicles)
    assert (arrivals, config) == before


@pytest.mark.parametrize('change', [
    {'controller': 'ml'}, {'scenario': 'missing'}, {'seed': True}, {'duration_ticks': 0},
    {'config': {'green_ticks': 8}}, {'config': {'green': '8'}},
    {'arrivals': [dict(N=-1, E=0, S=0, W=0)]},
    {'arrivals': [dict(N=True, E=0, S=0, W=0)]}, {'arrivals': []},
])
def test_adapter_rejects_invalid_inputs(change):
    args = dict(controller='fixed', scenario='balanced', seed=42, duration_ticks=1,
                arrivals=[dict(N=1, E=0, S=0, W=0)], config=DEFAULT_CONFIG)
    with pytest.raises(ValueError):
        adapter.run(**(args | change))


def test_real_matrix_replays_recorded_schedules():
    seeds = [11, 23, 42, 67, 101]
    config = Config(green=2, capacity=4).model_dump()
    report = run_matrix(adapter, 80, seeds, config, verify_repeat=True)
    replayed = run_matrix(adapter, 80, seeds, config, replay=report['schedules'], verify_repeat=True)
    assert report == replayed
    assert len(report['rows']) == 40
    assert report['config'] == config
    for fixed, adaptive in zip(report['rows'][::2], report['rows'][1::2]):
        assert fixed['arrival_schedule_sha256'] == adaptive['arrival_schedule_sha256']
        assert fixed['fairness_overrides'] == 0


def test_frontend_fixture_contains_real_reproducible_measurements():
    path = Path(__file__).parents[1] / 'test-fixtures' / 'benchmark.json'
    report = json.loads(path.read_text())
    for row in report['rows']:
        schedule = report['schedules'][f"{row['scenario']}:{row['seed']}"]['arrivals']
        measured = adapter.run(controller=row['controller'], scenario=row['scenario'], seed=row['seed'],
                               duration_ticks=report['duration_ticks'], arrivals=schedule, config=report['config'])
        for field, value in measured.items():
            if field in row:
                assert row[field] == value
