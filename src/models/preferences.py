"""Stakeholder preferences — multi-dimensional preference weights.

Preferences cover multiple dimensions:
  - Timeslot preferences: when do I want to teach/study?
  - Room preferences: which rooms do I prefer?
  - Teacher preferences (for students): which professor do I want?
  - Course preferences (for teachers): which courses do I prefer teaching?
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .timeslot import TimeSlot


@dataclass
class StakeholderPreferences:
    """Multi-dimensional preference weights for a stakeholder.

    Each dimension maps a key → float in [0, 1].
    0.0 = strongly avoid, 0.5 = neutral, 1.0 = strongly prefer.
    Missing keys default to 0.5.
    """

    entity_id: str  # teacher_id or group_id
    entity_type: str  # "teacher" or "student_group"

    # Timeslot preferences: TimeSlot → weight
    weights: dict[TimeSlot, float] = field(default_factory=dict)

    # Room preferences: room_id → weight
    room_weights: dict[str, float] = field(default_factory=dict)

    # Teacher preferences (for student groups): teacher_id → weight
    teacher_weights: dict[str, float] = field(default_factory=dict)

    # Course preferences (for teachers): course_id → weight
    course_weights: dict[str, float] = field(default_factory=dict)

    def get_weight(self, timeslot: TimeSlot) -> float:
        """Get timeslot preference weight."""
        return self.weights.get(timeslot, 0.5)

    def get_room_weight(self, room_id: str) -> float:
        """Get room preference weight."""
        return self.room_weights.get(room_id, 0.5)

    def get_teacher_weight(self, teacher_id: str) -> float:
        """Get teacher preference weight (for student groups)."""
        return self.teacher_weights.get(teacher_id, 0.5)

    def get_course_weight(self, course_id: str) -> float:
        """Get course preference weight (for teachers)."""
        return self.course_weights.get(course_id, 0.5)
