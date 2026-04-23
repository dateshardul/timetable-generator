"""Formal game definition for timetable scheduling.

This is a finite exact potential game:
  G = (N, {S_i}, {u_i})
  - N: set of players (events to schedule)
  - S_i: strategy set for player i (available timeslots)
  - u_i: payoff function for player i

Key property: There exists a potential function Φ such that for any
player i switching from strategy s to s':
  u_i(s', σ_{-i}) - u_i(s, σ_{-i}) = Φ(s', σ_{-i}) - Φ(s, σ_{-i})

This guarantees:
  1. Every best-response improvement strictly decreases Φ
  2. Φ is bounded below → convergence in finite steps
  3. Every local minimum of Φ is a pure Nash equilibrium
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import networkx as nx

from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.timeslot import TimeSlot


@dataclass
class Player:
    """A player in the timetable game (one event/lecture)."""

    player_id: str
    event: Event
    strategies: list[TimeSlot]  # available timeslots


@dataclass
class StrategyProfile:
    """A complete assignment of strategies to all players."""

    assignments: dict[str, TimeSlot] = field(default_factory=dict)  # player_id -> timeslot

    def get(self, player_id: str) -> TimeSlot | None:
        return self.assignments.get(player_id)

    def set(self, player_id: str, strategy: TimeSlot) -> None:
        self.assignments[player_id] = strategy

    def copy(self) -> StrategyProfile:
        return StrategyProfile(assignments=dict(self.assignments))


class TimetableGame:
    """Formal definition of the timetable scheduling game.

    This class separates the game definition from the solver, making the
    mathematical structure explicit and verifiable.
    """

    def __init__(
        self,
        events: list[Event],
        timeslots: list[TimeSlot],
        graph: nx.Graph,
        preferences: list[StakeholderPreferences],
        spread_penalty: float = 0.5,
    ):
        self.players = {e.event_id: Player(e.event_id, e, list(timeslots)) for e in events}
        self.graph = graph
        self.pref_map = {p.entity_id: p for p in preferences}
        self.spread_penalty = spread_penalty

        # Build section index for spread penalty
        self._section_events: dict[str, list[str]] = {}
        for e in events:
            self._section_events.setdefault(e.section_id, []).append(e.event_id)

    @property
    def player_ids(self) -> list[str]:
        return list(self.players.keys())

    @property
    def num_players(self) -> int:
        return len(self.players)

    def payoff(self, player_id: str, profile: StrategyProfile) -> float:
        """Compute payoff u_i(σ) for player i under strategy profile σ.

        u_i(σ) = preference_reward(i, σ_i)
               - conflict_penalty(i, σ)
               - spread_penalty(i, σ)
        """
        strategy = profile.get(player_id)
        if strategy is None:
            return float("-inf")

        event = self.players[player_id].event

        # Preference reward: avg of teacher + student group preferences
        teacher_pref = self.pref_map.get(event.teacher_id)
        teacher_w = teacher_pref.get_weight(strategy) if teacher_pref else 0.5

        group_weights = []
        for gid in event.student_group_ids:
            gp = self.pref_map.get(gid)
            group_weights.append(gp.get_weight(strategy) if gp else 0.5)
        avg_group_w = sum(group_weights) / len(group_weights) if group_weights else 0.5

        pref_reward = (teacher_w + avg_group_w) / 2.0

        # Conflict penalty: sum of edge weights for neighbors at same timeslot
        conflict_pen = 0.0
        if player_id in self.graph:
            for neighbor in self.graph.neighbors(player_id):
                if profile.get(neighbor) == strategy:
                    conflict_pen += self.graph.edges[player_id, neighbor].get("weight", 1.0)

        # Spread penalty: same-section events on same day
        spread_pen = 0.0
        for sibling in self._section_events.get(event.section_id, []):
            if sibling == player_id:
                continue
            sib_ts = profile.get(sibling)
            if sib_ts and sib_ts.day == strategy.day:
                spread_pen += self.spread_penalty

        return pref_reward - conflict_pen - spread_pen

    def best_response(self, player_id: str, profile: StrategyProfile) -> tuple[TimeSlot | None, float]:
        """Find the best-response strategy for player i given others' choices.

        Returns (best_strategy, best_payoff).
        """
        player = self.players[player_id]
        best_ts = None
        best_payoff = float("-inf")

        for ts in player.strategies:
            test_profile = profile.copy()
            test_profile.set(player_id, ts)
            p = self.payoff(player_id, test_profile)
            if p > best_payoff:
                best_payoff = p
                best_ts = ts

        return best_ts, best_payoff

    def is_best_response(self, player_id: str, profile: StrategyProfile) -> bool:
        """Check if player i is currently playing a best response."""
        current_ts = profile.get(player_id)
        if current_ts is None:
            return False
        current_payoff = self.payoff(player_id, profile)
        _, best_payoff = self.best_response(player_id, profile)
        return current_payoff >= best_payoff - 1e-9  # tolerance for float comparison

    def edge_weight(self, player_a: str, player_b: str) -> float:
        """Get conflict edge weight between two players."""
        if self.graph.has_edge(player_a, player_b):
            return self.graph.edges[player_a, player_b].get("weight", 0.0)
        return 0.0
