"""StudentGroup model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class StudentGroup:
    group_id: str
    name: str
    size: int
    max_events_per_day: int = 5
