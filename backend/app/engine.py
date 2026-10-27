from uuid import uuid4
from pydantic import TypeAdapter
from .models import Command, Config, DecisionEvent, DirectionState, Preemption, StateSnapshot, VehicleState
from .structures import EmergencyHeap, TrafficList, SignalQueue
from .arrivals import Arrivals
from .controller import Controller
from .metrics import Metrics

COMMAND = TypeAdapter(Command)

class Engine:
    def __init__(self, seed=42, scenario='balanced', controller_mode='adaptive', config=None, schedule=None):
        self.config = config or Config()
        self.seed, self.scenario, self.controller_mode = seed, scenario, controller_mode
        self.schedule, self.speed, self.sequence_number = schedule, 1, 0
        self.reset()

    def reset(self):
        self.run_id = str(uuid4())
        self.tick, self.next_id, self.event_id = 0, 1, 0
        self.traced_upto = 0  # last event id included in a tick's trace
        self.sim_status, self.phase, self.active_direction = 'paused', 'GREEN', 'N'
        self.phase_remaining = self.config.green
        self.traffic, self.signals = TrafficList(), SignalQueue()
        self.signals.advance()
        self.remaining = 3
        self.controller, self.metrics = Controller(), Metrics()
        self.arrivals = Arrivals(self.seed, self.scenario, self.schedule)
        self.crossing, self.decisions = [], []
        # Emergency pre-emption: waiting ambulances (min-heap), whether the current green was granted for one,
        # and the approach whose green was cut short (it gets its slot back afterwards).
        self.emergencies, self.preempt_green, self.resume, self.announced = EmergencyHeap(), False, None, set()

    def emit(self, kind, direction=None, data=None):
        self.event_id += 1
        self.decisions.append(DecisionEvent(event_id=self.event_id, tick=self.tick, type=kind,
                                           direction=direction, description=kind.lower().replace('_', ' '), data=data or {}))
        if kind == 'FAIRNESS_OVERRIDE':
            self.metrics.fairness_overrides += 1

    def direction_states(self):
        states = []
        for node in self.traffic:
            count = len(node.vehicles)
            wait = self.tick - node.vehicles[0].arrival_tick if count else 0
            states.append(DirectionState(direction=node.direction, queue_count=count, max_wait_ticks=wait,
                                         priority_score=2 * count + .5 * wait,
                                         congestion_flag=count >= self.config.congestion_threshold))
        return states

    def advance(self):
        self.tick += 1
        # keep events emitted by commands since the last tick (e.g. EMERGENCY_DETECTED) in this tick's trace
        self.decisions = [d for d in self.decisions if d.event_id > self.traced_upto]
        for vehicle in self.crossing:
            vehicle.status, vehicle.path_progress = 'EXITED', 1
            self.metrics.departed += 1
        self.crossing = []
        for direction in self.arrivals.at(self.tick):
            self.metrics.generated += 1
            node = self.traffic.get(direction)
            accepted = len(node.vehicles) < self.config.capacity
            vehicle_id = self.next_id
            self.next_id += 1
            if accepted:
                node.vehicles.append(VehicleState(id=vehicle_id, direction=direction, arrival_tick=self.tick))
            else:
                self.metrics.rejected += 1
            self.emit('ARRIVAL', direction, {'vehicle_id': vehicle_id, 'accepted': accepted})
        if self.phase == 'GREEN':
            node = self.traffic.get(self.active_direction)
            if node.vehicles:
                vehicle = node.vehicles.pop(0)
                vehicle.status, vehicle.path_progress, vehicle.queue_position = 'CROSSING', .5, 0
                self.crossing.append(vehicle)
                self.metrics.waits.append(self.tick - vehicle.arrival_tick)
                if vehicle.kind == 'ambulance' and self.emergencies.remove(vehicle.id):
                    self.metrics.emergency_waits.append(self.tick - vehicle.arrival_tick)
                    self.emit('PREEMPT_END', vehicle.direction, {'vehicle_id': vehicle.id, 'wait': self.tick - vehicle.arrival_tick})
        self.preempt()
        self.phase_remaining -= 1
        if self.phase_remaining == 0:
            if self.phase == 'GREEN':
                self.phase, self.phase_remaining = 'YELLOW', self.config.yellow
            elif self.phase == 'YELLOW':
                self.phase, self.phase_remaining, self.active_direction = 'ALL_RED', self.config.all_red, None
            else:
                target, reason = self.emergencies.peek(), None
                if target is not None:
                    # Pre-emption green: the circular queue and round counter are not advanced.
                    self.active_direction, self.preempt_green, reason = target.direction, True, 'preempt'
                    if self.resume == target.direction:
                        self.resume = None                         # this green also serves the cut-short approach
                    self.announced.add(target.id)
                    self.emit('PREEMPT_START', target.direction, {'vehicle_id': target.id, 'interrupted': self.resume})
                elif self.resume is not None:
                    # Give the approach whose green was cut short its slot back.
                    self.active_direction, self.resume, self.preempt_green, reason = self.resume, None, False, 'resume'
                else:
                    self.preempt_green = False
                    if self.remaining == 0:
                        old = self.signals.order()
                        order = self.controller.plan(old, self.direction_states(), self.emit, self.controller_mode)
                        self.signals.reorder(order)
                        self.remaining = 4
                        self.emit('ORDER_COMMITTED', None, {'order': order})
                    self.active_direction = self.signals.advance()
                    self.remaining -= 1
                self.phase, self.phase_remaining = 'GREEN', self.config.green
                self.metrics.switches += 1
            data = {'phase': self.phase, 'remaining': self.phase_remaining}
            if self.phase == 'GREEN' and reason:
                data['reason'] = reason
            self.emit('PHASE_CHANGE', self.active_direction, data)
        self.traced_upto = self.event_id

    def preempt(self):
        """Adjust the current GREEN for a waiting ambulance. Never skips YELLOW or ALL_RED."""
        if self.phase != 'GREEN':
            return
        target = self.emergencies.peek()
        if target is not None and target.direction == self.active_direction:
            if target.id not in self.announced:                    # already green: just hold it, never shorten it
                self.announced.add(target.id)
                self.emit('PREEMPT_START', target.direction, {'vehicle_id': target.id, 'interrupted': None})
            self.phase_remaining = max(self.phase_remaining, 2)   # hold green until the ambulance has crossed
        elif target is not None:
            if self.resume is None and not self.preempt_green:
                self.resume = self.active_direction                # cut short now; resumed after the emergency
            self.phase_remaining = 1                               # end this green; yellow and all-red follow
        elif self.preempt_green:
            self.phase_remaining = min(self.phase_remaining, 1)    # ambulance crossed: end the pre-emption green

    def spawn_emergency(self, direction):
        node = self.traffic.get(direction)
        if any(v.kind == 'ambulance' for v in node.vehicles):
            raise ValueError('an ambulance is already waiting on that approach')
        vehicle = VehicleState(id=self.next_id, direction=direction, arrival_tick=self.tick, kind='ambulance')
        self.next_id += 1
        node.vehicles.append(vehicle)   # emergency vehicles are never rejected for capacity
        self.metrics.generated += 1
        self.metrics.emergencies += 1
        self.emergencies.push(vehicle)
        self.emit('EMERGENCY_DETECTED', direction, {'vehicle_id': vehicle.id, 'queue_position': len(node.vehicles) - 1})

    def command(self, raw):
        command = COMMAND.validate_python(raw)
        name = command.command
        if name not in ('start', 'pause', 'spawn_emergency') and self.sim_status == 'running':
            raise ValueError('pause before stepping or changing setup')
        if name == 'step' and self.sim_status != 'paused':
            raise ValueError('step requires paused simulation')
        if name == 'start':
            self.sim_status = 'running'
        elif name == 'pause':
            self.sim_status = 'paused'
        elif name == 'step':
            self.advance()
        elif name == 'reset':
            self.reset()
        elif name == 'set_speed':
            self.speed = command.speed
        elif name == 'spawn_emergency':
            self.spawn_emergency(command.direction)
        else:
            field = {'set_seed': 'seed', 'set_scenario': 'scenario', 'set_controller': 'controller_mode'}[name]
            setattr(self, field, getattr(command, field))
            self.reset()
        return command.request_id

    def envelope(self, kind):
        self.sequence_number += 1
        return dict(protocol_version='1.0', kind=kind, run_id=self.run_id,
                    sequence_number=self.sequence_number, tick=self.tick)

    def snapshot(self):
        vehicles = []
        for node in self.traffic:
            for position, vehicle in enumerate(node.vehicles):
                vehicles.append(vehicle.model_copy(update={'queue_position': position}))
        return StateSnapshot(**self.envelope('state'), sim_status=self.sim_status, scenario=self.scenario,
                             seed=self.seed, controller_mode=self.controller_mode, speed=self.speed,
                             phase=self.phase, phase_remaining=self.phase_remaining, active_direction=self.active_direction,
                             queue_order=self.signals.order(), direction_states=self.direction_states(),
                             vehicles=vehicles + self.crossing, metrics=self.metrics.state(), decisions=self.decisions,
                             preemption=self.preemption())

    def preemption(self):
        target = self.emergencies.peek()
        if target is None:
            return None
        return Preemption(direction=target.direction, vehicle_id=target.id, since_tick=target.arrival_tick)
