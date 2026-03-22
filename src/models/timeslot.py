"""TimeSlot — the 'colors' in our graph coloring game."""

from __future__ import annotations

import enum
from dataclasses import dataclass


class Day(enum.Enum):
    MON = "Monday"
    TUE = "Tuesday"
    WED = "Wednesday"
    THU = "Thursday"
    FRI = "Friday"
    SAT = "Saturday"


@dataclass(frozen=True)
class TimeSlot:
    """A specific day + period combination. Frozen so it's hashable (usable as a color)."""

    day: Day
    period: int  # 1-based period index within the day
    start_hour: int  # 24h format, e.g. 9
    start_minute: int  # e.g. 0
    duration_minutes: int  # e.g. 60

    @property
    def end_hour(self) -> int:
        total = self.start_hour * 60 + self.start_minute + self.duration_minutes
        return total // 60

    @property
    def end_minute(self) -> int:
        total = self.start_hour * 60 + self.start_minute + self.duration_minutes
        return total % 60

    @property
    def label(self) -> str:
        return f"{self.day.value} P{self.period} ({self.start_hour:02d}:{self.start_minute:02d})"

    def overlaps(self, other: TimeSlot) -> bool:
        if self.day != other.day:
            return False
        s1 = self.start_hour * 60 + self.start_minute
        e1 = s1 + self.duration_minutes
        s2 = other.start_hour * 60 + other.start_minute
        e2 = s2 + other.duration_minutes
        return s1 < e2 and s2 < e1

    def __str__(self) -> str:
        return self.label
