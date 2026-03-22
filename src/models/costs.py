"""Transition and disruption cost models.

These costs make the system applicable beyond timetables to any scheduling domain:
- Assembly lines (machine changeover time/cost)
- Railways (platform switching, track reallocation)
- Airports (gate reassignment, passenger walking distance)
- Shipping (berth changes, crane repositioning)
- Hospitals (room turnover, staff relocation)

The key insight: scheduling isn't just about finding a valid assignment.
It must also minimize the *cost of transitions* between consecutive assignments
and the *cost of changes* when rescheduling.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TransitionCost:
    """Cost of moving between two resources (rooms, gates, platforms, etc.)

    Models physical distance, setup time, energy expenditure, or any
    domain-specific transition penalty.
    """

    from_id: str  # source resource (room, gate, platform)
    to_id: str    # destination resource
    cost: float   # abstract cost units (higher = worse)
    time_minutes: float = 0.0  # transition time needed
    metadata: dict = field(default_factory=dict)  # domain-specific (e.g. distance_meters, energy_kwh)


@dataclass
class TransitionMatrix:
    """Lookup table for pairwise transition costs between resources.

    For a university: cost[R1][R2] = walking distance between rooms.
    For a railway: cost[P1][P2] = track switching time between platforms.
    For an airport: cost[G1][G2] = passenger walking time between gates.
    """

    costs: dict[tuple[str, str], TransitionCost] = field(default_factory=dict)
    default_cost: float = 0.0

    def get_cost(self, from_id: str, to_id: str) -> float:
        if from_id == to_id:
            return 0.0
        tc = self.costs.get((from_id, to_id))
        if tc:
            return tc.cost
        # Try reverse (symmetric by default)
        tc = self.costs.get((to_id, from_id))
        if tc:
            return tc.cost
        return self.default_cost

    def get_transition_time(self, from_id: str, to_id: str) -> float:
        if from_id == to_id:
            return 0.0
        tc = self.costs.get((from_id, to_id)) or self.costs.get((to_id, from_id))
        return tc.time_minutes if tc else 0.0

    def add(self, from_id: str, to_id: str, cost: float, time_minutes: float = 0.0, **metadata):
        self.costs[(from_id, to_id)] = TransitionCost(
            from_id=from_id, to_id=to_id, cost=cost,
            time_minutes=time_minutes, metadata=metadata,
        )


@dataclass
class DisruptionCost:
    """Cost of changing an existing assignment during rescheduling.

    Models stakeholder disruption:
    - Students: confusion, printed schedule invalidation, routine disruption
    - Teachers: lab setup already done in a specific room, slides prepared for a time
    - Rooms: equipment configured for a specific course
    - General: notification overhead, cascading changes

    Higher disruption_weight = harder to move this assignment.
    """

    event_id: str
    disruption_weight: float = 1.0  # multiplier: how costly it is to move this event
    reasons: list[str] = field(default_factory=list)  # human-readable reasons

    # Domain-specific examples:
    # - University: "lab equipment configured", "students printed schedule"
    # - Railway: "tickets sold for this platform", "crew assigned"
    # - Airport: "passengers already at gate", "fuel truck dispatched"
    # - Assembly: "tooling installed on machine", "workers briefed"
