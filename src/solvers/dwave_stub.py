"""D-Wave QUBO formulation stub (Phase 2).

Binary variables x_{event,timeslot} = 1 if event assigned to timeslot.

    minimize H = A * sum_e (1 - sum_t x_{e,t})^2         # one-hot constraint
               + B * sum_{(i,j) in edges} sum_t w_ij * x_{i,t} * x_{j,t}  # conflict
               - C * sum_{e,t} pref(e,t) * x_{e,t}       # preference reward

Where A >> B >> C to enforce hard constraints first.

To use: pip install dwave-ocean-sdk
"""

from __future__ import annotations

import networkx as nx

from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timeslot import TimeSlot
from src.models.timetable import Timetable

from .base import SolverBackend


class DWaveSolver(SolverBackend):
    """D-Wave quantum annealing solver (stub)."""

    @property
    def name(self) -> str:
        return "dwave"

    def solve(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        rooms: list[Room],
        preferences: list[StakeholderPreferences],
        frozen_events: set[str] | None = None,
    ) -> Timetable:
        raise NotImplementedError(
            "D-Wave solver not yet implemented. "
            "Install dwave-ocean-sdk and implement build_qubo() to enable."
        )

    def build_qubo(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        preferences: list[StakeholderPreferences],
        A: float = 10000,
        B: float = 1000,
        C: float = 1,
    ) -> dict[tuple[str, str], float]:
        """Build QUBO dictionary for D-Wave sampler.

        Returns:
            Dict mapping (var_i, var_j) -> coefficient.
            Variables are named "x_{event_id}_{timeslot_index}".
        """
        raise NotImplementedError("QUBO construction not yet implemented.")
