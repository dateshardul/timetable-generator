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
from src.models.timetable import Assignment, SolverStep, Timetable

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
        greedy_randomness: float = 0.0,
    ):
        self.max_iterations = max_iterations
        self.seed = seed
        # greedy_randomness in [0,1]: 0 = optimal greedy, 1 = fully random initial assignment
        # Use >0 for demo mode to create initial conflicts that best-response resolves
        self.greedy_randomness = greedy_randomness
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
        steps: list[SolverStep] = []

        def count_conflicts(a: dict[str, TimeSlot]) -> int:
            """Count hard conflicts in current assignment."""
            c = 0
            for eid in a:
                if eid not in graph:
                    continue
                for nb in graph.neighbors(eid):
                    if a.get(nb) == a[eid] and graph.edges[eid, nb].get("weight", 0) >= 1000:
                        c += 1
            return c // 2  # each conflict counted twice

        # Phase A: Greedy initial assignment (Welsh-Powell, with optional randomness)
        ordered = sorted(
            events,
            key=lambda e: graph.degree(e.event_id) if e.event_id in graph else 0,
            reverse=True,
        )
        for event in ordered:
            if event.event_id in frozen_events and event.event_id in assignment:
                continue
            conflicts_before = count_conflicts(assignment)

            # With greedy_randomness > 0, sometimes pick a random slot instead of optimal
            if self.greedy_randomness > 0 and rng.random() < self.greedy_randomness:
                best_slot = rng.choice(timeslots)
                reason = "Random initial placement (demo mode)"
            else:
                best_slot = None
                best_payoff = float("-inf")
                for ts in timeslots:
                    p = self._payoff(event, ts, assignment, graph, pref_map, section_events)
                    if p > best_payoff:
                        best_payoff = p
                        best_slot = ts
                reason = f"Most constrained ({graph.degree(event.event_id) if event.event_id in graph else 0} edges), best payoff slot"

            if best_slot is not None:
                assignment[event.event_id] = best_slot
                conflicts_after = count_conflicts(assignment)
                steps.append(SolverStep(
                    event_id=event.event_id,
                    timeslot=str(best_slot),
                    phase="greedy",
                    conflicts_before=conflicts_before,
                    conflicts_after=conflicts_after,
                    reason=reason,
                ))

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
                    old_ts_str = str(current_ts) if current_ts else None
                    conflicts_before = count_conflicts(assignment)
                    assignment[event.event_id] = best_ts
                    conflicts_after = count_conflicts(assignment)
                    improved = True
                    delta = conflicts_before - conflicts_after
                    reason = f"Iter {iterations}: moved for better payoff"
                    if delta > 0:
                        reason += f", resolved {delta} conflict{'s' if delta > 1 else ''}"
                    elif delta < 0:
                        reason += f", trade-off (+{-delta} conflicts for better preference)"
                    steps.append(SolverStep(
                        event_id=event.event_id,
                        timeslot=str(best_ts),
                        phase="best_response",
                        old_timeslot=old_ts_str,
                        conflicts_before=conflicts_before,
                        conflicts_after=conflicts_after,
                        reason=reason,
                    ))

            if not improved:
                converged = True
                break

        # Phase C: Room assignment (preference-aware)
        room_assignments = self._assign_rooms(assignment, event_map, rooms, pref_map)

        # Phase D: Game-theoretic verification
        game_analysis = self._analyze_game(
            events, timeslots, graph, preferences, assignment
        )

        # Build output
        assignments_out = []
        for eid, ts in assignment.items():
            assignments_out.append(Assignment(
                event_id=eid,
                timeslot=ts,
                room_id=room_assignments.get(eid),
            ))

        timetable = Timetable(
            assignments=assignments_out,
            converged=converged,
            iterations=iterations,
            solver=self.name,
            steps=steps,
        )
        timetable.metrics["game_theory"] = game_analysis
        return timetable

    def _analyze_game(
        self,
        events: list[Event],
        timeslots: list[TimeSlot],
        graph: nx.Graph,
        preferences: list[StakeholderPreferences],
        assignment: dict[str, TimeSlot],
    ) -> dict:
        """Run formal game-theoretic analysis on the final assignment."""
        from src.game.game import TimetableGame, StrategyProfile
        from src.game.potential import PotentialFunction
        from src.game.equilibrium import NashVerifier
        from src.game.welfare import WelfareAnalyzer

        game = TimetableGame(events, timeslots, graph, preferences)
        profile = StrategyProfile(assignments=dict(assignment))

        # Verify Nash equilibrium
        nash_report = NashVerifier(game).verify(profile)

        # Compute potential function
        phi = PotentialFunction(game)
        phi_value = phi.compute(profile)
        convergence_bound = phi.convergence_bound(profile)

        # Welfare analysis
        welfare = WelfareAnalyzer(game)
        welfare_report = welfare.analyze(profile)
        stakeholder_utils = welfare.stakeholder_utilities(profile)
        poa_estimate = welfare.estimate_price_of_anarchy(profile, num_random_samples=50)
        welfare_report.estimated_poa = poa_estimate

        return {
            "nash_equilibrium": nash_report.to_dict(),
            "potential_function": {
                "phi": round(phi_value, 6),
                "convergence_bound": convergence_bound,
            },
            "welfare": welfare_report.to_dict(),
            "stakeholder_utilities": stakeholder_utils,
        }

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

        # ── Preference reward (multi-dimensional) ──
        # 1. Timeslot preference: teacher + avg student group
        teacher_pref = pref_map.get(event.teacher_id)
        teacher_ts_w = teacher_pref.get_weight(timeslot) if teacher_pref else 0.5

        group_ts_weights = []
        for gid in event.student_group_ids:
            gp = pref_map.get(gid)
            group_ts_weights.append(gp.get_weight(timeslot) if gp else 0.5)
        avg_group_ts = sum(group_ts_weights) / len(group_ts_weights) if group_ts_weights else 0.5

        timeslot_pref = (teacher_ts_w + avg_group_ts) / 2.0

        # 2. Teacher-for-course preference: does this teacher want to teach this course?
        course_pref = 0.5
        if teacher_pref:
            course_pref = teacher_pref.get_course_weight(event.course_id)

        # 3. Student-for-teacher preference: do students prefer this teacher?
        teacher_pref_from_students = []
        for gid in event.student_group_ids:
            gp = pref_map.get(gid)
            if gp:
                teacher_pref_from_students.append(gp.get_teacher_weight(event.teacher_id))
        avg_teacher_pref = (
            sum(teacher_pref_from_students) / len(teacher_pref_from_students)
            if teacher_pref_from_students else 0.5
        )

        # Weighted combination: timeslot matters most (0.6), then teacher-student fit (0.25), then course fit (0.15)
        preference_reward = 0.6 * timeslot_pref + 0.25 * avg_teacher_pref + 0.15 * course_pref

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
        pref_map: dict[str, StakeholderPreferences] | None = None,
    ) -> dict[str, str]:
        """Phase C: assign rooms with preference-aware scoring.

        For each timeslot, sort events by student count (best-fit decreasing).
        For each event, score candidate rooms by:
          - Capacity waste (lower = better)
          - Teacher room preference (higher = better)
          - Student group room preference (higher = better)
        """
        pref_map = pref_map or {}
        room_assignments: dict[str, str] = {}

        # Group events by timeslot
        slot_events: dict[TimeSlot, list[str]] = defaultdict(list)
        for eid, ts in assignment.items():
            slot_events[ts].append(eid)

        for ts, eids in slot_events.items():
            eids_sorted = sorted(
                eids,
                key=lambda eid: event_map[eid].student_count,
                reverse=True,
            )
            used_rooms: set[str] = set()

            for eid in eids_sorted:
                event = event_map[eid]
                best_room = None
                best_score = float("-inf")

                for room in rooms:
                    if room.room_id in used_rooms:
                        continue
                    if room.capacity < event.student_count:
                        continue
                    if event.event_type == "lab" and room.room_type != "lab":
                        continue
                    if event.equipment and not all(
                        eq in room.equipment for eq in event.equipment
                    ):
                        continue

                    # Score: combine capacity fit + room preferences
                    waste = room.capacity - event.student_count
                    capacity_score = 1.0 / (1.0 + waste)  # 0-1, higher = tighter fit

                    # Teacher room preference
                    teacher_pref = pref_map.get(event.teacher_id)
                    teacher_room_w = teacher_pref.get_room_weight(room.room_id) if teacher_pref else 0.5

                    # Student group room preferences
                    group_room_ws = []
                    for gid in event.student_group_ids:
                        gp = pref_map.get(gid)
                        group_room_ws.append(gp.get_room_weight(room.room_id) if gp else 0.5)
                    avg_group_room = sum(group_room_ws) / len(group_room_ws) if group_room_ws else 0.5

                    # Weighted score: capacity fit (0.5) + teacher pref (0.3) + student pref (0.2)
                    score = 0.5 * capacity_score + 0.3 * teacher_room_w + 0.2 * avg_group_room

                    if score > best_score:
                        best_score = score
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
