"""Harness tests only. Fake measurements below are never exported as project results."""
import copy
import unittest
from scripts.benchmark import run_matrix, digest, validate_schedule, validate_metrics, DEFAULT_CONFIG

class FakeAdapter:
    __name__ = 'test_only_fake'
    calls = []
    @staticmethod
    def generate_schedule(**kwargs):
        return [dict(N=1, E=0, S=0, W=0) for _ in range(kwargs['duration_ticks'])]
    @classmethod
    def run(cls, **kwargs):
        cls.calls.append(copy.deepcopy(kwargs))
        return dict(arrived=len(kwargs['arrivals']), departed=0, mean_wait_ticks=0, p95_wait_ticks=0, max_wait_ticks=0, switches=0, rejected_arrivals=0, fairness_overrides=0)

class BenchmarkTests(unittest.TestCase):
    def test_paired_schedules_and_all_40_runs(self):
        FakeAdapter.calls = []
        report = run_matrix(FakeAdapter, 3, [1, 2, 3, 4, 5], DEFAULT_CONFIG)
        self.assertEqual(len(report['rows']), 40)
        for a, b in zip(FakeAdapter.calls[::2], FakeAdapter.calls[1::2]):
            self.assertEqual(a['arrivals'], b['arrivals'])
            self.assertEqual(a['config'], b['config'])
            self.assertEqual((a['controller'], b['controller']), ('fixed', 'adaptive'))
        replay = run_matrix(FakeAdapter, 3, [1, 2, 3, 4, 5], DEFAULT_CONFIG, report['schedules'], True)
        self.assertEqual(report['rows'], replay['rows'])
    def test_detects_tampered_schedule(self):
        report = run_matrix(FakeAdapter, 1, [1, 2, 3, 4, 5], DEFAULT_CONFIG)
        report['schedules']['balanced:1']['arrivals'][0]['N'] = 9
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            run_matrix(FakeAdapter, 1, [1, 2, 3, 4, 5], DEFAULT_CONFIG, report['schedules'])
    def test_rejects_partial_metrics_and_bad_schedule(self):
        with self.assertRaises(ValueError): validate_metrics({'departed': 0})
        with self.assertRaises(ValueError): validate_schedule([{'N': -1}], 1)
        with self.assertRaises(ValueError): run_matrix(FakeAdapter, 3, [1], DEFAULT_CONFIG)
        with self.assertRaises(ValueError): run_matrix(FakeAdapter, 3, [1, 2, 3, 4, 5, 5], DEFAULT_CONFIG)
    def test_hash_is_order_independent(self):
        self.assertEqual(digest({'N': 1, 'E': 0}), digest({'E': 0, 'N': 1}))

if __name__ == '__main__': unittest.main()
