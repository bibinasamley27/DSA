from dataclasses import dataclass, field
from .models import DIRECTIONS, VehicleState

@dataclass
class DirectionNode:
    direction: str
    vehicles: list[VehicleState] = field(default_factory=list)
    next: 'DirectionNode | None' = None

class TrafficList:
    def __init__(self):
        self.head = DirectionNode(DIRECTIONS[0])
        tail = self.head
        for direction in DIRECTIONS[1:]:
            tail.next = DirectionNode(direction)
            tail = tail.next

    def __iter__(self):
        node = self.head
        while node:
            yield node
            node = node.next

    def get(self, direction):
        for node in self:
            if node.direction == direction:
                return node
        raise KeyError(direction)

@dataclass
class SignalNode:
    direction: str
    next: 'SignalNode | None' = None

class SignalQueue:
    def __init__(self, order=DIRECTIONS):
        self.reorder(order)

    def reorder(self, order):
        if len(order) != 4 or set(order) != set(DIRECTIONS):
            raise ValueError('signal order must be a permutation')
        self.head = SignalNode(order[0])
        self.tail = self.head
        for direction in order[1:]:
            self.tail.next = SignalNode(direction)
            self.tail = self.tail.next
        self.tail.next = self.head
        self.current = self.head

    def advance(self):
        direction = self.current.direction
        self.current = self.current.next
        return direction

    def order(self):
        node, result = self.head, []
        for _ in DIRECTIONS:
            result.append(node.direction)
            node = node.next
        return result

def bubble_sort(order, scores):
    result, events = list(order), []
    for end in range(len(result) - 1, 0, -1):
        for i in range(end):
            left, right = result[i:i + 2]
            events.append(('SORT_COMPARE', {'left': left, 'right': right, 'left_score': scores[left], 'right_score': scores[right]}))
            if scores[left] < scores[right]:
                result[i], result[i + 1] = right, left
                events.append(('SORT_SWAP', {'left': left, 'right': right, 'order': list(result)}))
    return result, events

class EmergencyHeap:
    """Hand-written binary min-heap of waiting ambulances, keyed by (arrival_tick, base direction order, id)."""

    def __init__(self):
        self.items = []

    @staticmethod
    def key(vehicle):
        return (vehicle.arrival_tick, DIRECTIONS.index(vehicle.direction), vehicle.id)

    def __len__(self):
        return len(self.items)

    def peek(self):
        return self.items[0] if self.items else None

    def push(self, vehicle):
        self.items.append(vehicle)
        self._up(len(self.items) - 1)

    def remove(self, vehicle_id):
        """Remove by id (normally the top; any position if a lane was served out of order). Returns the vehicle or None."""
        for i, vehicle in enumerate(self.items):
            if vehicle.id == vehicle_id:
                last = self.items.pop()
                if i < len(self.items):
                    self.items[i] = last
                    self._down(i)
                    self._up(i)
                return vehicle
        return None

    def _up(self, i):
        while i > 0:
            parent = (i - 1) // 2
            if self.key(self.items[i]) >= self.key(self.items[parent]):
                return
            self.items[i], self.items[parent] = self.items[parent], self.items[i]
            i = parent

    def _down(self, i):
        n = len(self.items)
        while True:
            smallest, left, right = i, 2 * i + 1, 2 * i + 2
            if left < n and self.key(self.items[left]) < self.key(self.items[smallest]):
                smallest = left
            if right < n and self.key(self.items[right]) < self.key(self.items[smallest]):
                smallest = right
            if smallest == i:
                return
            self.items[i], self.items[smallest] = self.items[smallest], self.items[i]
            i = smallest
