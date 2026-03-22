"""Game-theoretic iterative best-response solver.

Three phases:
  A) Greedy initial assignment (Welsh-Powell heuristic)
  B) Iterative best-response dynamics until Nash equilibrium
  C) Room assignment (decoupled, greedy best-fit decreasing)
"""

from __future__ import annotations

import random
from collections import defaultdict

import networkx as nx

from src.models.costs import DisruptionCost, TransitionMatrix
from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timeslot import TimeSlot
from src.models.timetable import Assignment, Timetable

from .base import SolverBackend

CONFLICT_PENALTY_WEIGHT = 1000
SPREAD_PENALTY = 0.5
TRANSITION_PENALTY_WEIGHT = 0.1  # weight for room-to-room transition cost
DISRUPTION_PENALTY_WEIGHT = 50   # weight for changing an existing assignment


class ClassicalSolver(SolverBackend):
    """Classical game-theoretic solver using best-response dynamics."""

    def __init__(
        self,
        max_iterations: int = 1000,
        seed: int | None = None,
        transition_matrix: TransitionMatrix | None = None,
        disruption_costs: list[DisruptionCost] | None = None,
        prior_assignments: dict[str, tuple[TimeSlot, str | None]] | None = None,
    ):
        self.max_iterations = max_iterations
        self.seed = seed
        self.transition_matrix = transition_matrix or TransitionMatrix()
        self.disruption_map = {d.event_id: d for d in (disruption_costs or [])}
        # prior_assignments: event_id -> (old_timeslot, old_room_id) for disruption calc
        self.prior_assignments = prior_assignments or {}

    @property
    def name(self) -> str:
        return "classical"

    def solve(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        rooms: list[Room],
        preferences: list[StakeholderPreferences],
        frozen_events: set[str] | None = None,
    ) -> Timetable:
        frozen_events = frozen_events or set()
        rng = random.Random(self.seed)

        # Build lookup maps
        event_map = {e.event_id: e for e in events}
        pref_map = self._build_pref_map(preferences)
        section_events = self._build_section_events(events)

        # Current assignment: event_id -> TimeSlot
        assignment: dict[str, TimeSlot] = {}

        # Phase A: Greedy initial assignment (Welsh-Powell)
        ordered = sorted(
            events,
            key=lambda e: graph.degree(e.event_id) if e.event_id in graph else 0,
            reverse=True,
        )
        for event in ordered:
            if event.event_id in frozen_events and event.event_id in assignment:
                continue
            best_slot = None
            best_payoff = float("-inf")
            for ts in timeslots:
                p = self._payoff(event, ts, assignment, graph, pref_map, section_events)
                if p > best_payoff:
                    best_payoff = p
                    best_slot = ts
            if best_slot is not None:
                assignment[event.event_id] = best_slot

        # Phase B: Iterative best-response dynamics
        converged = False
        iterations = 0
        movable = [e for e in events if e.event_id not in frozen_events]

        for iteration in range(self.max_iterations):
            iterations = iteration + 1
            improved = False
            rng.shuffle(movable)

            for event in movable:
                current_ts = assignment.get(event.event_id)
                current_payoff = self._payoff(
                    event, current_ts, assignment, graph, pref_map, section_events
                ) if current_ts else float("-inf")

                best_ts = current_ts
                best_payoff = current_payoff

                for ts in timeslots:
                    if ts == current_ts:
                        continue
                    p = self._payoff(event, ts, assignment, graph, pref_map, section_events)
                    if p > best_payoff:
                        best_payoff = p
                        best_ts = ts

                if best_ts != current_ts:
                    assignment[event.event_id] = best_ts
                    improved = True

            if not improved:
                converged = True
                break

        # Phase C: Room assignment (greedy best-fit decreasing)
        room_assignments = self._assign_rooms(assignment, event_map, rooms)

        # Build output
        assignments = []
        for eid, ts in assignment.items():
            assignments.append(Assignment(
                event_id=eid,
                timeslot=ts,
                room_id=room_assignments.get(eid),
            ))

        return Timetable(
            assignments=assignments,
            converged=converged,
            iterations=iterations,
            solver=self.name,
        )

    def _payoff(
        self,
        event: Event,
        timeslot: TimeSlot | None,
        assignment: dict[str, TimeSlot],
        graph: nx.Graph,
        pref_map: dict[str, StakeholderPreferences],
        section_events: dict[str, list[str]],
        room_assignments: dict[str, str] | None = None,
    ) -> float:
        """Compute payoff for an event choosing a timeslot.

        payoff = preference_reward
               - conflict_penalty
               - spread_penalty
               - transition_penalty  (room-to-room movement cost for consecutive events)
               - disruption_penalty  (cost of changing from a prior assignment)
        """
        if timeslot is None:
            return float("-inf")

        room_assignments = room_assignments or {}

        # Preference reward: teacher pref + avg student group pref
        teacher_pref = pref_map.get(event.teacher_id)
        teacher_w = teacher_pref.get_weight(timeslot) if teacher_pref else 0.5

        group_weights = []
        for gid in event.student_group_ids:
            gp = pref_map.get(gid)
            group_weights.append(gp.get_weight(timeslot) if gp else 0.5)
        avg_group_w = sum(group_weights) / len(group_weights) if group_weights else 0.5

        preference_reward = (teacher_w + avg_group_w) / 2.0

        # Conflict penalty: sum of edge weights for neighbors assigned to same timeslot
        conflict_penalty = 0.0
        if event.event_id in graph:
            for neighbor in graph.neighbors(event.event_id):
                if assignment.get(neighbor) == timeslot:
                    edge_data = graph.edges[event.event_id, neighbor]
                    conflict_penalty += edge_data.get("weight", 1.0)

        # Spread penalty: same-section lecture on the same day
        spread_penalty = 0.0
        for sibling_eid in section_events.get(event.section_id, []):
            if sibling_eid == event.event_id:
                continue
            sibling_ts = assignment.get(sibling_eid)
            if sibling_ts and sibling_ts.day == timeslot.day:
                spread_penalty += SPREAD_PENALTY

        # Transition penalty: cost for student groups moving between rooms
        # For each student group, look at their other events in adjacent periods
        transition_penalty = 0.0
        current_room = room_assignments.get(event.event_id)
        if current_room and self.transition_matrix.costs:
            for gid in event.student_group_ids:
                for sibling_eid in section_events.get(event.section_id, []):
                    if sibling_eid == event.event_id:
                        continue
                    sib_ts = assignment.get(sibling_eid)
                    sib_room = room_assignments.get(sibling_eid)
                    if sib_ts and sib_room and sib_ts.day == timeslot.day:
                        # Adjacent periods
                        if abs(sib_ts.period - timeslot.period) == 1:
                            transition_penalty += (
                                self.transition_matrix.get_cost(current_room, sib_room)
                                * TRANSITION_PENALTY_WEIGHT
                            )

        # Disruption penalty: cost of changing from prior assignment
        disruption_penalty = 0.0
        prior = self.prior_assignments.get(event.event_id)
        if prior:
            old_ts, old_room = prior
            if old_ts != timeslot:
                dc = self.disruption_map.get(event.event_id)
                weight = dc.disruption_weight if dc else 1.0
                disruption_penalty = DISRUPTION_PENALTY_WEIGHT * weight

        return (
            preference_reward
            - conflict_penalty
            - spread_penalty
            - transition_penalty
            - disruption_penalty
        )

    def _assign_rooms(
        self,
        assignment: dict[str, TimeSlot],
        event_map: dict[str, Event],
        rooms: list[Room],
    ) -> dict[str, str]:
        """Phase C: assign rooms greedily by timeslot."""
        room_assignments: dict[str, str] = {}

        # Group events by timeslot
        slot_events: dict[TimeSlot, list[str]] = defaultdict(list)
        for eid, ts in assignment.items():
            slot_events[ts].append(eid)

        for ts, eids in slot_events.items():
            # Sort by student count descending (best-fit decreasing)
            eids_sorted = sorted(
                eids,
                key=lambda eid: event_map[eid].student_count,
                reverse=True,
            )
            used_rooms: set[str] = set()

            for eid in eids_sorted:
                event = event_map[eid]
                best_room = None
                best_waste = float("inf")

                for room in rooms:
                    if room.room_id in used_rooms:
                        continue
                    if room.capacity < event.student_count:
                        continue
                    # Type matching
                    if event.event_type == "lab" and room.room_type != "lab":
                        continue
                    # Equipment matching
                    if event.equipment and not all(
                        eq in room.equipment for eq in event.equipment
                    ):
                        continue
                    waste = room.capacity - event.student_count
                    if waste < best_waste:
                        best_waste = waste
                        best_room = room

                if best_room:
                    room_assignments[eid] = best_room.room_id
                    used_rooms.add(best_room.room_id)

        return room_assignments

    def _build_pref_map(
        self, preferences: list[StakeholderPreferences]
    ) -> dict[str, StakeholderPreferences]:
        return {p.entity_id: p for p in preferences}

    def _build_section_events(self, events: list[Event]) -> dict[str, list[str]]:
        result: dict[str, list[str]] = defaultdict(list)
        for e in events:
            result[e.section_id].append(e.event_id)
        return result
