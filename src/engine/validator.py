"""Hard/soft constraint violation checker."""

from __future__ import annotations

from collections import defaultdict

from src.models.event import Event
from src.models.room import Room
from src.models.timetable import Assignment, Timetable
from src.models.timeslot import TimeSlot


def validate_timetable(
    timetable: Timetable,
    events: list[Event],
    rooms: list[Room],
) -> dict:
    """Check a timetable for constraint violations.

    Returns:
        Dict with 'hard_violations' and 'soft_violations' lists,
        plus 'valid' bool (True if no hard violations).
    """
    event_map = {e.event_id: e for e in events}
    room_map = {r.room_id: r for r in rooms}

    hard: list[str] = []
    soft: list[str] = []

    assignment_map: dict[str, Assignment] = {}
    for a in timetable.assignments:
        assignment_map[a.event_id] = a

    # Index: timeslot -> list of event_ids assigned there
    slot_events: dict[TimeSlot, list[str]] = defaultdict(list)
    for a in timetable.assignments:
        slot_events[a.timeslot].append(a.event_id)

    # Check teacher conflicts (same teacher, same timeslot)
    for ts, eids in slot_events.items():
        teacher_at_slot: dict[str, list[str]] = defaultdict(list)
        for eid in eids:
            ev = event_map.get(eid)
            if ev:
                teacher_at_slot[ev.teacher_id].append(eid)
        for tid, conflicting in teacher_at_slot.items():
            if len(conflicting) > 1:
                hard.append(
                    f"Teacher {tid} assigned to multiple events at {ts}: {conflicting}"
                )

    # Check student group conflicts (same group, same timeslot)
    for ts, eids in slot_events.items():
        group_at_slot: dict[str, list[str]] = defaultdict(list)
        for eid in eids:
            ev = event_map.get(eid)
            if ev:
                for gid in ev.student_group_ids:
                    group_at_slot[gid].append(eid)
        for gid, conflicting in group_at_slot.items():
            if len(conflicting) > 1:
                hard.append(
                    f"Student group {gid} has overlapping events at {ts}: {conflicting}"
                )

    # Check room conflicts (same room, same timeslot)
    for ts, eids in slot_events.items():
        room_at_slot: dict[str, list[str]] = defaultdict(list)
        for eid in eids:
            a = assignment_map[eid]
            if a.room_id:
                room_at_slot[a.room_id].append(eid)
        for rid, conflicting in room_at_slot.items():
            if len(conflicting) > 1:
                hard.append(
                    f"Room {rid} double-booked at {ts}: {conflicting}"
                )

    # Check room capacity
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        room = room_map.get(a.room_id) if a.room_id else None
        if ev and room and ev.student_count > room.capacity:
            hard.append(
                f"Event {a.event_id} has {ev.student_count} students "
                f"but room {a.room_id} capacity is {room.capacity}"
            )

    # Soft: same-section lectures on same day
    section_days: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        if ev:
            section_days[ev.section_id][a.timeslot.day.value].append(a.event_id)
    for sec_id, days in section_days.items():
        for day, eids in days.items():
            if len(eids) > 1:
                soft.append(
                    f"Section {sec_id} has {len(eids)} lectures on {day}: {eids}"
                )

    return {
        "valid": len(hard) == 0,
        "hard_violations": hard,
        "soft_violations": soft,
    }
