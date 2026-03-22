"""Event — a single lecture that needs scheduling (a node/player in the game)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Event:
    """One lecture instance that must be assigned a timeslot.

    A 3-credit course with 3 lectures/week produces 3 Event objects.
    Each Event is a *player* in the game; its strategy is the chosen TimeSlot.
    """

    event_id: str
    section_id: str
    course_id: str
    teacher_id: str
    student_group_ids: list[str] = field(default_factory=list)
    student_count: int = 0
    event_type: str = "lecture"  # "lecture" or "lab"
    equipment: list[str] = field(default_factory=list)
    lecture_index: int = 0  # which lecture of the week (0, 1, 2, ...)
