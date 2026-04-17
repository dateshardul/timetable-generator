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
class SolverStep:
    """One step of the solver — an event being placed or moved."""

    event_id: str
    timeslot: str          # string representation of assigned timeslot
    phase: str             # "greedy" or "best_response"
    old_timeslot: Optional[str] = None  # None for initial placement
    conflicts_before: int = 0
    conflicts_after: int = 0
    reason: str = ""


@dataclass
class Timetable:
    """Complete timetable output with assignments and metadata."""

    assignments: list[Assignment] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    converged: bool = False
    iterations: int = 0
    solver: str = "classical"
    steps: list[SolverStep] = field(default_factory=list)

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
            "steps": [
                {
                    "event_id": s.event_id,
                    "timeslot": s.timeslot,
                    "phase": s.phase,
                    "old_timeslot": s.old_timeslot,
                    "conflicts_before": s.conflicts_before,
                    "conflicts_after": s.conflicts_after,
                    "reason": s.reason,
                }
                for s in self.steps
            ],
        }
