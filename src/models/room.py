"""Room model."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Room:
    room_id: str
    name: str
    capacity: int
    room_type: str = "lecture"  # "lecture" or "lab"
    equipment: list[str] = field(default_factory=list)
