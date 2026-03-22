"""Abstract solver backend interface."""

from __future__ import annotations

import abc

import networkx as nx

from src.models.costs import DisruptionCost, TransitionMatrix
from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timeslot import TimeSlot
from src.models.timetable import Timetable


class SolverBackend(abc.ABC):
    """Interface all solver backends must implement."""

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Human-readable solver name."""

    @abc.abstractmethod
    def solve(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        rooms: list[Room],
        preferences: list[StakeholderPreferences],
        frozen_events: set[str] | None = None,
    ) -> Timetable:
        """Solve the timetable scheduling problem.

        Args:
            graph: Conflict graph (nodes=events, edges=conflicts).
            events: All events to schedule.
            timeslots: Available timeslot options (the "colors").
            rooms: Available rooms.
            preferences: Stakeholder preference weights.
            frozen_events: Event IDs whose assignments should not change
                           (for partial re-scheduling).

        Returns:
            A Timetable with assignments, metrics, and convergence info.
        """
