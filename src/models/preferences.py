"""Stakeholder preferences — payoff weights for timeslots."""

from __future__ import annotations

from dataclasses import dataclass, field

from .timeslot import TimeSlot


@dataclass
class StakeholderPreferences:
    """Preference weights for an entity (teacher or student group).

    weights maps TimeSlot → float in [0, 1].
    Missing timeslots default to 0.5 (neutral).
    """

    entity_id: str  # teacher_id or group_id
    entity_type: str  # "teacher" or "student_group"
    weights: dict[TimeSlot, float] = field(default_factory=dict)

    def get_weight(self, timeslot: TimeSlot) -> float:
        return self.weights.get(timeslot, 0.5)
