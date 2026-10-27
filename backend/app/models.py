from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Direction = Literal['N', 'E', 'S', 'W']
DIRECTIONS = ('N', 'E', 'S', 'W')

class DTO(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Config(DTO):
    green: int = Field(default=8, ge=1)
    yellow: int = Field(default=2, ge=1)
    all_red: int = Field(default=1, ge=1)
    capacity: int = Field(default=15, ge=1)
    congestion_threshold: int = Field(default=5, ge=1)

class VehicleState(DTO):
    id: int
    direction: Direction
    status: Literal['QUEUED', 'CROSSING', 'EXITED'] = 'QUEUED'
    arrival_tick: int = Field(ge=0)
    path_progress: float = Field(default=0, ge=0, le=1)
    queue_position: int = Field(default=0, ge=0)

class DirectionState(DTO):
    direction: Direction
    queue_count: int = Field(ge=0)
    max_wait_ticks: int = Field(ge=0)
    priority_score: float
    congestion_flag: bool
    downstream_free_slots: int | None = None

class DecisionEvent(DTO):
    event_id: int
    tick: int
    type: Literal['ARRIVAL', 'PHASE_CHANGE', 'THRESHOLD', 'SORT_COMPARE', 'SORT_SWAP', 'HYSTERESIS_REJECT', 'FAIRNESS_OVERRIDE', 'ORDER_COMMITTED', 'SPILLBACK_BLOCK']
    direction: Direction | None = None
    description: str
    data: dict = Field(default_factory=dict)

class MetricsState(DTO):
    arrived: int
    departed: int
    mean_wait_ticks: float
    max_wait_ticks: int
    switches: int
    fairness_overrides: int

class Envelope(DTO):
    protocol_version: Literal['1.0'] = '1.0'
    kind: str
    run_id: str
    sequence_number: int = Field(ge=1)
    tick: int = Field(ge=0)

class StateSnapshot(Envelope):
    kind: Literal['state'] = 'state'
    sim_status: Literal['paused', 'running', 'stopped']
    scenario: str
    seed: int
    controller_mode: Literal['fixed', 'adaptive']
    speed: Literal[0.5, 1, 2, 4]
    phase: Literal['GREEN', 'YELLOW', 'ALL_RED']
    phase_remaining: int = Field(ge=1)
    active_direction: Direction | None
    direction_states: list[DirectionState] = Field(min_length=4, max_length=4)
    queue_order: list[Direction] = Field(min_length=4, max_length=4)
    vehicles: list[VehicleState]
    metrics: MetricsState
    decisions: list[DecisionEvent]

    @model_validator(mode='after')
    def complete(self):
        if set(self.queue_order) != set(DIRECTIONS) or {d.direction for d in self.direction_states} != set(DIRECTIONS):
            raise ValueError('all four unique directions required')
        if (self.phase == 'ALL_RED') != (self.active_direction is None):
            raise ValueError('active_direction must be null exactly during ALL_RED')
        for d in self.direction_states:
            if d.queue_count != sum(v.direction == d.direction and v.status == 'QUEUED' for v in self.vehicles):
                raise ValueError('queue count mismatch')
        if any(v.arrival_tick > self.tick or v.status == 'EXITED' for v in self.vehicles):
            raise ValueError('invalid active vehicle')
        return self

class Reply(Envelope):
    kind: Literal['welcome', 'ack', 'error', 'decision_trace']
    payload: dict

class SimpleCommand(DTO):
    protocol_version: Literal['1.0']
    kind: Literal['command']
    request_id: str = Field(min_length=1, max_length=128)
    command: Literal['start', 'pause', 'step', 'reset']

class ScenarioCommand(SimpleCommand):
    command: Literal['set_scenario']
    scenario: Literal['zero_demand', 'balanced', 'east_surge', 'fairness_trap', 'oscillation']

class SeedCommand(SimpleCommand):
    command: Literal['set_seed']
    seed: int = Field(strict=True)

class SpeedCommand(SimpleCommand):
    command: Literal['set_speed']
    speed: Literal[0.5, 1, 2, 4]

    @model_validator(mode='before')
    @classmethod
    def numeric(cls, value):
        if isinstance(value, dict) and type(value.get('speed')) not in (int, float):
            raise ValueError('speed must be numeric')
        return value

class ControllerCommand(SimpleCommand):
    command: Literal['set_controller']
    controller_mode: Literal['fixed', 'adaptive']

Command = Annotated[SimpleCommand | ScenarioCommand | SeedCommand | SpeedCommand | ControllerCommand, Field(discriminator='command')]
