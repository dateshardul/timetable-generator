"""Teacher model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Teacher:
    teacher_id: str
    name: str
    max_hours_per_week: int = 20
