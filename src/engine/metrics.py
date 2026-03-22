"""Social welfare, fairness, and utilization metrics."""

from __future__ import annotations

from collections import defaultdict

from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timetable import Timetable
from src.models.timeslot import TimeSlot


def compute_metrics(
    timetable: Timetable,
    events: list[Event],
    rooms: list[Room],
    preferences: list[StakeholderPreferences],
) -> dict[str, float]:
    """Compute quality metrics for a timetable.

    Returns dict with:
        social_welfare: sum of all stakeholder preference satisfaction
        fairness_index: Jain's fairness index over individual satisfactions
        hard_conflicts: count of hard constraint violations
        soft_conflicts: count of soft constraint violations
        room_utilization: avg (students / capacity) across assigned rooms
        preference_satisfaction: avg preference weight achieved
    """
    event_map = {e.event_id: e for e in events}
    room_map = {r.room_id: r for r in rooms}
    pref_map = {p.entity_id: p for p in preferences}

    assignment_map: dict[str, TimeSlot] = {}
    room_assignment_map: dict[str, str | None] = {}
    for a in timetable.assignments:
        assignment_map[a.event_id] = a.timeslot
        room_assignment_map[a.event_id] = a.room_id

    # Preference satisfaction per stakeholder
    stakeholder_scores: dict[str, list[float]] = defaultdict(list)
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        if not ev:
            continue
        # Teacher satisfaction
        tp = pref_map.get(ev.teacher_id)
        if tp:
            stakeholder_scores[ev.teacher_id].append(tp.get_weight(a.timeslot))
        # Student group satisfaction
        for gid in ev.student_group_ids:
            gp = pref_map.get(gid)
            if gp:
                stakeholder_scores[gid].append(gp.get_weight(a.timeslot))

    # Average satisfaction per stakeholder
    avg_per_stakeholder = {
        sid: sum(scores) / len(scores)
        for sid, scores in stakeholder_scores.items()
        if scores
    }
    all_satisfactions = list(avg_per_stakeholder.values())

    # Social welfare = sum of all satisfactions
    social_welfare = sum(all_satisfactions) if all_satisfactions else 0.0

    # Jain's fairness index
    if all_satisfactions:
        n = len(all_satisfactions)
        s = sum(all_satisfactions)
        s2 = sum(x * x for x in all_satisfactions)
        fairness_index = (s * s) / (n * s2) if s2 > 0 else 1.0
    else:
        fairness_index = 1.0

    # Preference satisfaction (global average)
    all_weights = []
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        if not ev:
            continue
        tp = pref_map.get(ev.teacher_id)
        if tp:
            all_weights.append(tp.get_weight(a.timeslot))
        for gid in ev.student_group_ids:
            gp = pref_map.get(gid)
            if gp:
                all_weights.append(gp.get_weight(a.timeslot))
    preference_satisfaction = sum(all_weights) / len(all_weights) if all_weights else 0.5

    # Hard conflicts: same teacher or same student group in same slot
    slot_events: dict[TimeSlot, list[str]] = defaultdict(list)
    for a in timetable.assignments:
        slot_events[a.timeslot].append(a.event_id)

    hard_conflicts = 0
    soft_conflicts = 0
    for ts, eids in slot_events.items():
        teachers: dict[str, int] = defaultdict(int)
        groups: dict[str, int] = defaultdict(int)
        for eid in eids:
            ev = event_map.get(eid)
            if ev:
                teachers[ev.teacher_id] += 1
                for gid in ev.student_group_ids:
                    groups[gid] += 1
        hard_conflicts += sum(c - 1 for c in teachers.values() if c > 1)
        hard_conflicts += sum(c - 1 for c in groups.values() if c > 1)

    # Soft conflicts: same-section on same day
    section_days: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        if ev:
            section_days[ev.section_id][a.timeslot.day.value] += 1
    for sec, days in section_days.items():
        for day, count in days.items():
            if count > 1:
                soft_conflicts += count - 1

    # Room utilization
    utilizations = []
    for a in timetable.assignments:
        ev = event_map.get(a.event_id)
        room = room_map.get(a.room_id) if a.room_id else None
        if ev and room and room.capacity > 0:
            utilizations.append(ev.student_count / room.capacity)
    room_utilization = sum(utilizations) / len(utilizations) if utilizations else 0.0

    return {
        "social_welfare": round(social_welfare, 4),
        "fairness_index": round(fairness_index, 4),
        "hard_conflicts": hard_conflicts,
        "soft_conflicts": soft_conflicts,
        "room_utilization": round(room_utilization, 4),
        "preference_satisfaction": round(preference_satisfaction, 4),
    }
