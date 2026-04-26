"""Pre-solve feasibility checks.

Before running the solver, detect cases where no valid timetable can exist.
Reports specific reasons so the user can fix their input.
"""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from src.models.event import Event
from src.models.room import Room
from src.models.timeslot import TimeSlot


def check_feasibility(
    events: list[Event],
    timeslots: list[TimeSlot],
    rooms: list[Room],
    graph: nx.Graph,
) -> dict:
    """Run all feasibility checks.

    Returns:
        {
            "feasible": bool,
            "warnings": [...],  # things that may cause issues
            "errors": [...],    # things that definitely prevent a valid timetable
        }
    """
    errors = []
    warnings = []

    num_events = len(events)
    num_slots = len(timeslots)
    num_rooms = len(rooms)

    # ── Basic capacity checks ──

    if num_events == 0:
        errors.append("No events to schedule.")
        return {"feasible": False, "errors": errors, "warnings": warnings}

    if num_slots == 0:
        errors.append("No timeslots available.")
        return {"feasible": False, "errors": errors, "warnings": warnings}

    # ── Timeslot capacity ──
    # At most num_rooms events can run in each timeslot (room-limited)
    # So total capacity = num_slots * num_rooms
    if num_rooms > 0:
        total_capacity = num_slots * num_rooms
        if num_events > total_capacity:
            errors.append(
                f"Not enough room-slots: {num_events} events need scheduling "
                f"but only {num_slots} timeslots x {num_rooms} rooms = "
                f"{total_capacity} room-slots available."
            )

    # ── Chromatic number lower bound ──
    # The conflict graph's clique number ω(G) is a lower bound on
    # the chromatic number χ(G). If ω(G) > num_timeslots, no proper
    # coloring exists → infeasible.
    # Finding max clique is NP-hard in general, but for our graph structure
    # we can check per-teacher and per-group cliques cheaply.

    # Per-teacher check: teacher's events form a clique (all pairwise conflicts).
    # If a teacher has more events than timeslots → infeasible.
    teacher_events: dict[str, int] = defaultdict(int)
    for e in events:
        teacher_events[e.teacher_id] += 1

    for tid, count in teacher_events.items():
        if count > num_slots:
            errors.append(
                f"Teacher {tid} has {count} events but only {num_slots} timeslots — "
                f"impossible to schedule without conflicts."
            )
        elif count > num_slots * 0.8:
            warnings.append(
                f"Teacher {tid} has {count} events for {num_slots} timeslots — "
                f"very tight, may have conflicts."
            )

    # Per-group check: group's events form a clique too.
    group_events: dict[str, int] = defaultdict(int)
    for e in events:
        for gid in e.student_group_ids:
            group_events[gid] += 1

    for gid, count in group_events.items():
        if count > num_slots:
            errors.append(
                f"Student group {gid} has {count} events but only {num_slots} timeslots — "
                f"impossible to schedule without conflicts."
            )
        elif count > num_slots * 0.8:
            warnings.append(
                f"Student group {gid} has {count} events for {num_slots} timeslots — "
                f"very tight, may have conflicts."
            )

    # ── Graph density check ──
    # If the conflict graph is very dense, the problem is likely hard.
    if graph.number_of_nodes() > 0:
        max_edges = graph.number_of_nodes() * (graph.number_of_nodes() - 1) / 2
        density = graph.number_of_edges() / max_edges if max_edges > 0 else 0
        if density > 0.7:
            warnings.append(
                f"Conflict graph is very dense ({density:.0%}) — "
                f"most events conflict with each other. Consider adding more timeslots."
            )

    # ── Max clique from graph (approximation) ──
    # Only for small-medium graphs — max_clique is expensive on large dense graphs
    if 0 < graph.number_of_nodes() <= 500:
        try:
            clique = nx.approximation.max_clique(graph)
            clique_size = len(clique)
            if clique_size > num_slots:
                errors.append(
                    f"Found a group of {clique_size} mutually conflicting events "
                    f"but only {num_slots} timeslots — at least {clique_size} slots needed."
                )
            elif clique_size > num_slots * 0.9:
                warnings.append(
                    f"Found {clique_size} mutually conflicting events for {num_slots} timeslots — "
                    f"very tight."
                )
        except Exception:
            pass  # approximation may fail on edge cases

    # ── Room type mismatch ──
    lab_events = [e for e in events if e.event_type == "lab"]
    lab_rooms = [r for r in rooms if r.room_type == "lab"]
    if lab_events and not lab_rooms:
        errors.append(
            f"{len(lab_events)} lab events need scheduling but no lab rooms available."
        )

    feasible = len(errors) == 0
    return {"feasible": feasible, "errors": errors, "warnings": warnings}
