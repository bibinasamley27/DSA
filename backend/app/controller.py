from .models import DIRECTIONS
from .structures import bubble_sort

class Controller:
    def __init__(self):
        self.pending = None
        self.streak = 0

    def plan(self, order, states, emit, mode):
        if mode == 'fixed':
            return list(DIRECTIONS)
        scores = {d.direction: d.priority_score for d in states}
        congested = any(d.congestion_flag for d in states)
        emit('THRESHOLD', None, {'triggered': congested})
        candidate = order
        if congested:
            candidate, trace = bubble_sort(order, scores)
            for kind, data in trace:
                emit(kind, None, data)
        overdue = [d for d in states if d.queue_count and d.max_wait_ticks >= 30]
        if overdue:
            winner = overdue[0]
            for d in overdue[1:]:
                if d.max_wait_ticks > winner.max_wait_ticks:
                    winner = d
            self.pending, self.streak = None, 0
            emit('FAIRNESS_OVERRIDE', winner.direction, {'wait': winner.max_wait_ticks})
            return [winner.direction] + [d for d in order if d != winner.direction]
        if not congested:
            self.pending, self.streak = None, 0
            return order
        improvement = scores[candidate[0]] - scores[order[0]]
        if candidate != order and improvement >= 3:
            self.streak = self.streak + 1 if candidate == self.pending else 1
            self.pending = candidate
            if self.streak >= 2:
                self.pending, self.streak = None, 0
                return candidate
        else:
            self.pending, self.streak = None, 0
        if candidate != order:
            emit('HYSTERESIS_REJECT', None, {'candidate': candidate, 'improvement': improvement, 'streak': self.streak})
        return order
