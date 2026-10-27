"""Identical scheduled demand and timing for both controllers; JSON to stdout."""
import json
from app.arrivals import generate_schedule
from app.engine import Engine
from app.scenarios import PRESETS


def benchmark(ticks=1000, seeds=range(5)):
    results = []
    for scenario in PRESETS:
        for seed in seeds:
            schedule = generate_schedule(seed, scenario, ticks)
            for mode in ('fixed', 'adaptive'):
                engine = Engine(seed=seed, scenario=scenario, controller_mode=mode, schedule=schedule)
                for _ in range(ticks):
                    engine.advance()
                results.append(dict(scenario=scenario, seed=seed, controller_mode=mode, ticks=ticks,
                                    config=engine.config.model_dump(), **engine.metrics.report()))
    return results

if __name__ == '__main__':
    print(json.dumps(benchmark(), indent=2))
