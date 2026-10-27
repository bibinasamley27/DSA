from random import Random
from .models import DIRECTIONS
from .scenarios import probabilities

class Arrivals:
    def __init__(self, seed, scenario, schedule=None):
        self.rng, self.scenario = Random(seed), scenario
        self.schedule = None if schedule is None else tuple(tuple(row) for row in schedule)
        if self.schedule is not None and any(d not in DIRECTIONS for row in self.schedule for d in row):
            raise ValueError('invalid schedule direction')

    def at(self, tick):
        if self.schedule is not None:
            return self.schedule[tick - 1] if 1 <= tick <= len(self.schedule) else ()
        return tuple(d for d, p in zip(DIRECTIONS, probabilities(self.scenario, tick)) if self.rng.random() < p)

def generate_schedule(seed, scenario, ticks):
    source = Arrivals(seed, scenario)
    return tuple(source.at(tick) for tick in range(1, ticks + 1))
