"""Numpy-vectorized game-theoretic solver.

Same algorithm as ClassicalSolver but with matrix operations:
- Conflict matrix: sparse NxN with edge weights
- Preference matrix: NxT with preference rewards per event-timeslot pair
- Assignment vector: N integers (index into timeslots)
- Payoff computation: matrix multiply instead of Python loops

Target: 10-50x speedup over the loop-based classical solver.
"""

from __future__ import annotations

import random
from collections import defaultdict

import networkx as nx
import numpy as np

from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timeslot import TimeSlot
from src.models.timetable import Assignment, SolverStep, Timetable

from .base import SolverBackend


class VectorizedSolver(SolverBackend):
    """Numpy-vectorized best-response dynamics solver."""

    def __init__(
        self,
        max_iterations: int = 1000,
        seed: int | None = None,
        greedy_randomness: float = 0.0,
    ):
        self.max_iterations = max_iterations
        self.seed = seed
        self.greedy_randomness = greedy_randomness
        self.payoff_weights = (0.6, 0.25, 0.15)

    @property
    def name(self) -> str:
        return "vectorized"

    def solve(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        rooms: list[Room],
        preferences: list[StakeholderPreferences],
        frozen_events: set[str] | None = None,
        pre_assignments: dict[str, TimeSlot] | None = None,
    ) -> Timetable:
        frozen_events = frozen_events or set()
        rng = random.Random(self.seed)
        np_rng = np.random.RandomState(self.seed or 0)

        N = len(events)
        T = len(timeslots)
        if N == 0 or T == 0:
            return Timetable(solver=self.name)

        # Index maps
        eid_to_idx = {e.event_id: i for i, e in enumerate(events)}
        ts_to_idx = {ts: j for j, ts in enumerate(timeslots)}
        idx_to_ts = {j: ts for j, ts in enumerate(timeslots)}

        # ── Build conflict matrix (sparse-like via dense NxN) ──
        # W[i][j] = edge weight between event i and event j
        W = np.zeros((N, N), dtype=np.float64)
        for u, v, data in graph.edges(data=True):
            if u in eid_to_idx and v in eid_to_idx:
                i, j = eid_to_idx[u], eid_to_idx[v]
                w = data.get("weight", 1.0)
                W[i, j] = w
                W[j, i] = w

        # ── Build preference matrix P[i][j] = preference reward for event i at timeslot j ──
        pref_map = {p.entity_id: p for p in preferences}
        w_ts, w_te, w_co = self.payoff_weights

        P = np.full((N, T), 0.5, dtype=np.float64)  # default neutral
        for i, event in enumerate(events):
            teacher_pref = pref_map.get(event.teacher_id)
            for j, ts in enumerate(timeslots):
                # Timeslot preference
                t_w = teacher_pref.get_weight(ts) if teacher_pref else 0.5
                g_ws = []
                for gid in event.student_group_ids:
                    gp = pref_map.get(gid)
                    g_ws.append(gp.get_weight(ts) if gp else 0.5)
                avg_g = sum(g_ws) / len(g_ws) if g_ws else 0.5
                ts_pref = (t_w + avg_g) / 2.0

                # Teacher-for-course
                co_pref = teacher_pref.get_course_weight(event.course_id) if teacher_pref else 0.5

                # Student-for-teacher
                te_prefs = []
                for gid in event.student_group_ids:
                    gp = pref_map.get(gid)
                    if gp:
                        te_prefs.append(gp.get_teacher_weight(event.teacher_id))
                avg_te = sum(te_prefs) / len(te_prefs) if te_prefs else 0.5

                P[i, j] = w_ts * ts_pref + w_te * avg_te + w_co * co_pref

        # ── Build spread penalty data ──
        # section_mates[i] = list of event indices in same section (excluding i)
        section_events: dict[str, list[int]] = defaultdict(list)
        for i, e in enumerate(events):
            section_events[e.section_id].append(i)

        # Day index for each timeslot
        ts_day = np.array([ts.day.value for ts in timeslots])  # string array for day comparison

        # ── Frozen mask ──
        frozen_mask = np.array([e.event_id in frozen_events for e in events], dtype=bool)

        # ── Assignment vector: -1 = unassigned ──
        assignment = np.full(N, -1, dtype=np.int32)

        # Pre-load frozen assignments
        if pre_assignments:
            for eid, ts in pre_assignments.items():
                if eid in eid_to_idx and ts in ts_to_idx:
                    assignment[eid_to_idx[eid]] = ts_to_idx[ts]

        steps: list[SolverStep] = []

        # Track hard conflict count incrementally
        _hard_conflicts = [0]

        def recount_hard_conflicts() -> int:
            """Full recount — use sparingly."""
            c = 0
            for i in range(N):
                if assignment[i] < 0:
                    continue
                same = np.where((assignment == assignment[i]) & (W[i] >= 1000))[0]
                c += sum(1 for j in same if j > i)
            _hard_conflicts[0] = c
            return c

        def delta_conflicts_for_move(idx: int, old_j: int, new_j: int) -> int:
            """How many hard conflicts change if event idx moves from old_j to new_j."""
            if old_j == new_j:
                return 0
            # Conflicts removed: neighbors at old_j with hard edges
            removed = 0
            if old_j >= 0:
                at_old = (assignment == old_j)
                at_old[idx] = False
                removed = int((W[idx][at_old] >= 1000).sum())
            # Conflicts added: neighbors at new_j with hard edges
            added = 0
            at_new = (assignment == new_j)
            at_new[idx] = False
            added = int((W[idx][at_new] >= 1000).sum())
            return added - removed

        def compute_payoff_for_event(i: int, slot_j: int) -> float:
            """Compute payoff for event i choosing timeslot j."""
            # Preference reward
            pref = P[i, slot_j]

            # Conflict penalty: sum of W[i,k] for all k assigned to same slot
            conflict = 0.0
            same_slot_mask = (assignment == slot_j)
            same_slot_mask[i] = False  # exclude self
            conflict = W[i][same_slot_mask].sum()

            # Spread penalty: same-section on same day
            spread = 0.0
            day_j = ts_day[slot_j]
            for mate in section_events.get(events[i].section_id, []):
                if mate == i or assignment[mate] < 0:
                    continue
                if ts_day[assignment[mate]] == day_j:
                    spread += 0.5

            return pref - conflict - spread

        def best_slot_for_event(i: int) -> tuple[int, float, np.ndarray, np.ndarray]:
            """Find best timeslot for event i — vectorized over timeslots.
            Returns (best_j, best_payoff, all_payoffs, conflict_counts)."""
            prefs = P[i]  # shape (T,)

            # Conflict penalty per timeslot
            conflict_pen = np.zeros(T, dtype=np.float64)
            hard_counts = np.zeros(T, dtype=np.int32)
            for k in range(N):
                if k == i or assignment[k] < 0:
                    continue
                conflict_pen[assignment[k]] += W[i, k]
                if W[i, k] >= 1000:
                    hard_counts[assignment[k]] += 1

            # Spread penalty per timeslot
            spread_pen = np.zeros(T, dtype=np.float64)
            for mate in section_events.get(events[i].section_id, []):
                if mate == i or assignment[mate] < 0:
                    continue
                mate_day = ts_day[assignment[mate]]
                for j in range(T):
                    if ts_day[j] == mate_day:
                        spread_pen[j] += 0.5

            payoffs = prefs - conflict_pen - spread_pen
            best_j = int(np.argmax(payoffs))
            return best_j, float(payoffs[best_j]), payoffs, hard_counts

        # ── Phase A: Greedy initial assignment ──
        # Order by degree (most constrained first)
        degrees = np.array([graph.degree(e.event_id) if e.event_id in graph else 0 for e in events])
        order = np.argsort(-degrees)

        for idx in order:
            if frozen_mask[idx] and assignment[idx] >= 0:
                continue

            conflicts_before = _hard_conflicts[0]

            if self.greedy_randomness > 0 and rng.random() < self.greedy_randomness:
                best_j = rng.randint(0, T - 1)
                _, _, all_payoffs, hard_counts = best_slot_for_event(idx)
                reason = "Random initial placement (demo mode)"
                chosen_payoff = float(all_payoffs[best_j])
            else:
                best_j, chosen_payoff, all_payoffs, hard_counts = best_slot_for_event(idx)
                reason = f"Most constrained ({degrees[idx]} edges), best payoff slot"

            # Build top alternatives for animation
            alts = sorted(
                [{"timeslot": str(idx_to_ts[j]), "payoff": round(float(all_payoffs[j]), 3),
                  "conflicts": int(hard_counts[j])} for j in range(T)],
                key=lambda a: a["payoff"], reverse=True
            )

            delta = delta_conflicts_for_move(idx, -1, best_j)
            assignment[idx] = best_j
            _hard_conflicts[0] += delta
            conflicts_after = _hard_conflicts[0]

            steps.append(SolverStep(
                event_id=events[idx].event_id,
                timeslot=str(idx_to_ts[best_j]),
                phase="greedy",
                conflicts_before=conflicts_before,
                conflicts_after=conflicts_after,
                reason=reason,
                payoff=chosen_payoff,
                alternatives=alts,
            ))

        # ── Phase B: Iterative best-response ──
        converged = False
        iterations = 0
        movable = [i for i in range(N) if not frozen_mask[i]]

        for iteration in range(self.max_iterations):
            iterations = iteration + 1
            improved = False
            np_rng.shuffle(movable)

            for idx in movable:
                current_j = assignment[idx]
                current_payoff = compute_payoff_for_event(idx, current_j) if current_j >= 0 else float("-inf")

                best_j, best_payoff, all_payoffs, hard_counts = best_slot_for_event(idx)

                if best_j != current_j and best_payoff > current_payoff + 1e-9:
                    old_ts_str = str(idx_to_ts[current_j]) if current_j >= 0 else None
                    conflicts_before = _hard_conflicts[0]
                    d = delta_conflicts_for_move(idx, current_j, best_j)
                    assignment[idx] = best_j
                    _hard_conflicts[0] += d
                    conflicts_after = _hard_conflicts[0]
                    improved = True

                    cdelta = conflicts_before - conflicts_after
                    reason = f"Iter {iterations}: moved for better payoff"
                    if cdelta > 0:
                        reason += f", resolved {cdelta} conflict{'s' if cdelta > 1 else ''}"
                    elif cdelta < 0:
                        reason += f", trade-off (+{-cdelta} conflicts for better preference)"

                    alts = sorted(
                        [{"timeslot": str(idx_to_ts[j]), "payoff": round(float(all_payoffs[j]), 3),
                          "conflicts": int(hard_counts[j])} for j in range(T)],
                        key=lambda a: a["payoff"], reverse=True
                    )

                    steps.append(SolverStep(
                        event_id=events[idx].event_id,
                        timeslot=str(idx_to_ts[best_j]),
                        phase="best_response",
                        old_timeslot=old_ts_str,
                        conflicts_before=conflicts_before,
                        conflicts_after=conflicts_after,
                        reason=reason,
                        payoff=best_payoff,
                        alternatives=alts,
                    ))

            if not improved:
                converged = True
                break

        # ── Phase C: Room assignment ──
        event_map = {e.event_id: e for e in events}
        ts_assignment = {events[i].event_id: idx_to_ts[assignment[i]] for i in range(N) if assignment[i] >= 0}
        room_assignments = self._assign_rooms(ts_assignment, event_map, rooms)

        # Build output
        assignments_out = []
        for i in range(N):
            if assignment[i] >= 0:
                eid = events[i].event_id
                assignments_out.append(Assignment(
                    event_id=eid,
                    timeslot=idx_to_ts[assignment[i]],
                    room_id=room_assignments.get(eid),
                ))

        return Timetable(
            assignments=assignments_out,
            converged=converged,
            iterations=iterations,
            solver=self.name,
            steps=steps,
        )

    def _assign_rooms(
        self,
        assignment: dict[str, TimeSlot],
        event_map: dict[str, Event],
        rooms: list[Room],
    ) -> dict[str, str]:
        """Phase C: greedy room assignment (same as classical)."""
        room_assignments: dict[str, str] = {}
        slot_events: dict[TimeSlot, list[str]] = defaultdict(list)
        for eid, ts in assignment.items():
            slot_events[ts].append(eid)

        for ts, eids in slot_events.items():
            eids_sorted = sorted(eids, key=lambda eid: event_map[eid].student_count, reverse=True)
            used: set[str] = set()
            for eid in eids_sorted:
                event = event_map[eid]
                best_room = None
                best_waste = float("inf")
                for room in rooms:
                    if room.room_id in used or room.capacity < event.student_count:
                        continue
                    if event.event_type == "lab" and room.room_type != "lab":
                        continue
                    waste = room.capacity - event.student_count
                    if waste < best_waste:
                        best_waste = waste
                        best_room = room
                if best_room:
                    room_assignments[eid] = best_room.room_id
                    used.add(best_room.room_id)
        return room_assignments
