"""Course and Section models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Course:
    course_id: str
    name: str
    credits: int = 3
    requires_lab: bool = False
    prerequisites: list[str] = field(default_factory=list)  # course_ids
    equipment: list[str] = field(default_factory=list)  # specialized equipment needed


@dataclass
class Section:
    section_id: str
    course_id: str
    lectures_per_week: int = 3
    max_students: int = 60
    section_type: str = "lecture"  # "lecture" or "lab"
    teacher_id: Optional[str] = None
    student_group_ids: list[str] = field(default_factory=list)
