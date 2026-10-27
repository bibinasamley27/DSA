"""Connect the comparison harness to the existing Python engine, without rescheduling."""
from backend.app.arrivals import generate_schedule as engine_schedule
from backend.app.engine import Engine
from backend.app.models import Config, DIRECTIONS
from backend.app.scenarios import PRESETS
from scripts.benchmark import validate_schedule


def _validate_run(scenario, seed, duration_ticks):
    if scenario not in PRESETS or type(seed) is not int:
        raise ValueError('Use a known scenario and an integer seed.')
    if type(duration_ticks) is not int or duration_ticks < 1:
        raise ValueError('Duration must be a positive integer.')


def generate_schedule(*, scenario, seed, duration_ticks):
    _validate_run(scenario, seed, duration_ticks)
    return [{direction: row.count(direction) for direction in DIRECTIONS}
            for row in engine_schedule(seed, scenario, duration_ticks)]


def run(*, controller, scenario, seed, duration_ticks, arrivals, config):
    _validate_run(scenario, seed, duration_ticks)
    if controller not in ('fixed', 'adaptive'):
        raise ValueError('Controller must be fixed or adaptive.')
    validate_schedule(arrivals, duration_ticks)
    parameters = Config.model_validate(config, strict=True)
    schedule = tuple(tuple(direction for direction in DIRECTIONS for _ in range(row[direction]))
                     for row in arrivals)
    engine = Engine(seed=seed, scenario=scenario, controller_mode=controller,
                    config=parameters, schedule=schedule)
    for _ in range(duration_ticks):
        engine.advance()
    metrics = engine.metrics.report()
    metrics['rejected_arrivals'] = metrics.pop('rejected')
    return metrics
