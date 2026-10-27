from dataclasses import dataclass, field
from .models import MetricsState

@dataclass
class Metrics:
    generated: int = 0
    rejected: int = 0
    departed: int = 0
    switches: int = 0
    fairness_overrides: int = 0
    emergencies: int = 0
    emergency_waits: list[int] = field(default_factory=list)
    waits: list[int] = field(default_factory=list)

    def state(self):
        return MetricsState(arrived=self.generated - self.rejected, departed=self.departed,
                            mean_wait_ticks=sum(self.waits) / len(self.waits) if self.waits else 0,
                            max_wait_ticks=max(self.waits, default=0), switches=self.switches,
                            fairness_overrides=self.fairness_overrides, emergencies=self.emergencies,
                            mean_emergency_wait_ticks=sum(self.emergency_waits) / len(self.emergency_waits) if self.emergency_waits else 0)

    def report(self):
        # Manual insertion for reporting percentiles; scheduling always uses Bubble Sort.
        ordered = []
        for wait in self.waits:
            i = len(ordered)
            while i and ordered[i - 1] > wait:
                i -= 1
            ordered.insert(i, wait)
        return {**self.state().model_dump(), 'generated': self.generated, 'rejected': self.rejected,
                'p95_wait_ticks': ordered[max(0, (95 * len(ordered) + 99) // 100 - 1)] if ordered else 0}
