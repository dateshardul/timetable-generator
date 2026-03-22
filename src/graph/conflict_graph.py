"""Build an undirected conflict graph from events.

Nodes = Events (players in the game)
Edges = Conflicts with weights:
  - Hard (1000): same teacher, overlapping student group, same equipment
  - Prerequisite (500): course B requires course A in earlier slot
  - Soft (10): same section different lecture (spread-across-days preference)
  - Max-load (5): per excess event when student group exceeds max_events_per_day

Uses inverted indexes for efficient O(N * max_conflicts) construction.
"""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from src.models.course import Course
from src.models.event import Event
from src.models.student import StudentGroup

HARD_WEIGHT = 1000
PREREQUISITE_WEIGHT = 500
SOFT_WEIGHT = 10
MAX_LOAD_WEIGHT = 5


def build_conflict_graph(
    events: list[Event],
    courses: dict[str, Course] | None = None,
    student_groups: dict[str, StudentGroup] | None = None,
) -> nx.Graph:
    """Build conflict graph from a list of events.

    Args:
        events: All events to schedule.
        courses: Course lookup (needed for prerequisite edges).
        student_groups: StudentGroup lookup (needed for max-load metadata on nodes).

    Returns:
        NetworkX Graph with events as nodes and weighted conflict edges.
    """
    courses = courses or {}
    student_groups = student_groups or {}

    G = nx.Graph()

    # Add nodes
    for e in events:
        G.add_node(e.event_id, event=e)

    # Build inverted indexes
    teacher_index: dict[str, list[str]] = defaultdict(list)
    group_index: dict[str, list[str]] = defaultdict(list)
    section_index: dict[str, list[str]] = defaultdict(list)
    equipment_index: dict[str, list[str]] = defaultdict(list)

    for e in events:
        teacher_index[e.teacher_id].append(e.event_id)
        for gid in e.student_group_ids:
            group_index[gid].append(e.event_id)
        section_index[e.section_id].append(e.event_id)
        for eq in e.equipment:
            equipment_index[eq].append(e.event_id)

    # Helper to add/merge edge weights
    def add_edge(u: str, v: str, weight: float, conflict_type: str) -> None:
        if u == v:
            return
        key = tuple(sorted((u, v)))
        if G.has_edge(*key):
            data = G.edges[key]
            data["weight"] += weight
            data["types"].add(conflict_type)
        else:
            G.add_edge(*key, weight=weight, types={conflict_type})

    # Hard conflicts: same teacher
    for teacher_id, eids in teacher_index.items():
        for i in range(len(eids)):
            for j in range(i + 1, len(eids)):
                add_edge(eids[i], eids[j], HARD_WEIGHT, "same_teacher")

    # Hard conflicts: overlapping student groups
    for gid, eids in group_index.items():
        for i in range(len(eids)):
            for j in range(i + 1, len(eids)):
                add_edge(eids[i], eids[j], HARD_WEIGHT, "same_student_group")

    # Hard conflicts: same specialized equipment
    for eq, eids in equipment_index.items():
        for i in range(len(eids)):
            for j in range(i + 1, len(eids)):
                add_edge(eids[i], eids[j], HARD_WEIGHT, "same_equipment")

    # Soft conflicts: same section, different lecture (spread across days)
    for sec_id, eids in section_index.items():
        for i in range(len(eids)):
            for j in range(i + 1, len(eids)):
                add_edge(eids[i], eids[j], SOFT_WEIGHT, "same_section")

    # Prerequisite conflicts
    if courses:
        course_sections: dict[str, list[str]] = defaultdict(list)
        for e in events:
            course_sections[e.course_id].append(e.event_id)

        for course in courses.values():
            for prereq_id in course.prerequisites:
                if prereq_id in course_sections:
                    for eid_a in course_sections[prereq_id]:
                        for eid_b in course_sections[course.course_id]:
                            add_edge(eid_a, eid_b, PREREQUISITE_WEIGHT, "prerequisite")

    # Store max_events_per_day metadata on nodes for solver use
    for e in events:
        max_load = min(
            (student_groups[gid].max_events_per_day
             for gid in e.student_group_ids if gid in student_groups),
            default=5,
        )
        G.nodes[e.event_id]["max_events_per_day"] = max_load

    return G
