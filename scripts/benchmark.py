#!/usr/bin/env python3
"""Person C benchmark harness. The adapter calls Person A's engine; no scheduler here."""
from __future__ import annotations
import argparse
import copy
import hashlib
import importlib
import json
import math
from pathlib import Path
from typing import Any

SCENARIOS = ('balanced', 'east_surge', 'fairness_trap', 'oscillation')
METRICS = ('arrived', 'departed', 'mean_wait_ticks', 'p95_wait_ticks', 'max_wait_ticks', 'switches', 'rejected_arrivals', 'fairness_overrides')
DEFAULT_CONFIG = {'green_ticks': 8, 'yellow_ticks': 2, 'all_red_ticks': 1, 'service_capacity_per_tick': 1, 'queue_capacity': 60}

def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)

def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def validate_schedule(schedule: Any, duration: int) -> None:
    if not isinstance(schedule, list) or len(schedule) != duration:
        raise ValueError('Adapter must return one arrival-count dictionary per tick.')
    for tick in schedule:
        if not isinstance(tick, dict) or set(tick) != {'N', 'E', 'S', 'W'}:
            raise ValueError('Each schedule tick must contain N/E/S/W.')
        if any(type(n) is not int or n < 0 for n in tick.values()):
            raise ValueError('Arrival counts must be nonnegative integers.')

def validate_metrics(metrics: Any) -> dict:
    if not isinstance(metrics, dict) or set(METRICS) - metrics.keys():
        raise ValueError(f'Engine adapter must supply every metric: {METRICS}')
    for name in METRICS:
        n = metrics[name]
        if type(n) not in (int, float) or not math.isfinite(n) or n < 0:
            raise ValueError(f'Invalid measured metric: {name}')
    return {name: metrics[name] for name in METRICS}

def run_matrix(adapter: Any, duration: int, seeds: list[int], config: dict, replay: dict | None = None, verify_repeat: bool = False) -> dict:
    if duration < 1 or len(set(seeds)) < 5:
        raise ValueError('Use a positive duration and at least five unique seeds.')
    report = {'report_version': '1.0', 'duration_ticks': duration, 'config': copy.deepcopy(config), 'adapter': adapter.__name__, 'schedules': {}, 'rows': []}
    for scenario in SCENARIOS:
        for seed in seeds:
            key = f'{scenario}:{seed}'
            schedule = copy.deepcopy(replay[key]['arrivals'] if replay else adapter.generate_schedule(scenario=scenario, seed=seed, duration_ticks=duration))
            validate_schedule(schedule, duration)
            schedule_hash = digest(schedule)
            if replay and replay[key]['sha256'] != schedule_hash:
                raise ValueError(f'Saved arrival schedule hash mismatch: {key}')
            report['schedules'][key] = {'sha256': schedule_hash, 'arrivals': schedule}
            for controller in ('fixed', 'adaptive'):
                kwargs = {'controller': controller, 'scenario': scenario, 'seed': seed, 'duration_ticks': duration, 'arrivals': copy.deepcopy(schedule), 'config': copy.deepcopy(config)}
                metrics = validate_metrics(adapter.run(**kwargs))
                if digest(kwargs['arrivals']) != schedule_hash or kwargs['config'] != config:
                    raise ValueError('Engine adapter mutated the input schedule or timing configuration.')
                if verify_repeat:
                    repeated = validate_metrics(adapter.run(**copy.deepcopy(kwargs)))
                    if canonical(metrics) != canonical(repeated):
                        raise ValueError(f'Nonrepeatable result: {key}/{controller}')
                report['rows'].append({'scenario': scenario, 'seed': seed, 'controller': controller, 'arrival_schedule_sha256': schedule_hash, **metrics})
    return report

def results_table(report: dict) -> str:
    lines = ['| Scenario | Seed | Mode | Arrived | Departed | Mean wait | p95 | Max | Switches | Rejected | Rescues |', '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in report['rows']:
        lines.append(f"| {r['scenario']} | {r['seed']} | {r['controller']} | {r['arrived']} | {r['departed']} | {r['mean_wait_ticks']:.2f} | {r['p95_wait_ticks']} | {r['max_wait_ticks']} | {r['switches']} | {r['rejected_arrivals']} | {r['fairness_overrides']} |")
    lines.append('\nWaits are simulation ticks. Results reflect completed crossing-start waits; include unfinished queues when discussing end-of-run censoring. No performance improvement is assumed.')
    return '\n'.join(lines) + '\n'

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adapter', required=True, help='Importable module exposing generate_schedule() and run(); see docs/INTEGRATION.md')
    parser.add_argument('--ticks', type=int, default=1000)
    parser.add_argument('--seeds', type=int, nargs='+', default=[11, 23, 42, 67, 101])
    parser.add_argument('--output', type=Path, default=Path('reports/benchmark.json'))
    parser.add_argument('--replay', type=Path, help='Prior benchmark JSON: reuse recorded arrival schedules')
    parser.add_argument('--config', type=Path, help='JSON with engine-supported timing/capacity configuration')
    parser.add_argument('--verify-repeat', action='store_true')
    args = parser.parse_args()
    try:
        adapter = importlib.import_module(args.adapter)
        prior = json.loads(args.replay.read_text()) if args.replay else None
        config = json.loads(args.config.read_text()) if args.config else DEFAULT_CONFIG
        if prior and (prior['duration_ticks'] != args.ticks or prior['config'] != config):
            raise ValueError('Replay must use the recorded duration and configuration.')
        report = run_matrix(adapter, args.ticks, args.seeds, config, prior['schedules'] if prior else None, args.verify_repeat)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
        args.output.with_suffix('.md').write_text(results_table(report))
        print(f"Saved {len(report['rows'])} measured runs to {args.output} and {args.output.with_suffix('.md')}")
    except (ImportError, AttributeError, ValueError, KeyError) as exc:
        parser.exit(2, f'Benchmark not run: {exc}\nSee docs/INTEGRATION.md for the Person A adapter contract.\n')

if __name__ == '__main__':
    main()
