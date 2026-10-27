"""Regenerate integration fixtures and measured traces; run from backend/."""
import json
from pathlib import Path
from pydantic import TypeAdapter
from app.engine import Engine, COMMAND
from app.models import Reply, StateSnapshot


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def export():
    root = Path(__file__).parent / 'fixtures'
    write(root / 'simulation.schema.json', TypeAdapter(StateSnapshot | Reply).json_schema())
    write(root / 'commands.schema.json', COMMAND.json_schema())
    engine = Engine()
    write(root / 'mock_state.json', engine.snapshot().model_dump(mode='json'))
    for scenario in ('east_surge', 'fairness_trap', 'oscillation'):
        engine = Engine(scenario=scenario)
        snapshots, events = [engine.snapshot().model_dump(mode='json')], []
        for _ in range(200):
            engine.advance()
            events.extend(event.model_dump(mode='json') for event in engine.decisions)
            if engine.tick % 40 == 0:
                snapshots.append(engine.snapshot().model_dump(mode='json'))
        write(root / f'{scenario}.trace.json', dict(seed=42, scenario=scenario, ticks=200,
              config=engine.config.model_dump(), snapshots=snapshots, decisions=events,
              report=engine.metrics.report()))

if __name__ == '__main__':
    export()
