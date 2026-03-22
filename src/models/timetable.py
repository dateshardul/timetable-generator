"""Assignment and Timetable — the solver output."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .timeslot import TimeSlot


@dataclass
class Assignment:
    """A single event's scheduled timeslot and room."""

    event_id: str
    timeslot: TimeSlot
    room_id: Optional[str] = None


@dataclass
class Timetable:
    """Complete timetable output with assignments and metadata."""

    assignments: list[Assignment] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    converged: bool = False
    iterations: int = 0
    solver: str = "classical"

    def get_assignment(self, event_id: str) -> Optional[Assignment]:
        for a in self.assignments:
            if a.event_id == event_id:
                return a
        return None

    def to_dict(self) -> dict:
        return {
            "assignments": [
                {
                    "event_id": a.event_id,
                    "timeslot": str(a.timeslot),
                    "room_id": a.room_id,
                }
                for a in self.assignments
            ],
            "metrics": self.metrics,
            "converged": self.converged,
            "iterations": self.iterations,
            "solver": self.solver,
        }
