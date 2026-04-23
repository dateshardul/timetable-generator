"""Potential function for the timetable congestion game.

For an exact potential game, the potential function Φ satisfies:
  u_i(s', σ_{-i}) - u_i(s, σ_{-i}) = Φ(s', σ_{-i}) - Φ(s, σ_{-i})

For our timetable game:
  Φ(σ) = Σ_i pref_reward(i, σ_i)           [each player's preference]
        - Σ_{(i,j)∈E} w_ij·[σ_i = σ_j]     [each conflict edge counted ONCE]
        - Σ_i spread_penalty(i, σ)           [spread penalties]

When player i switches from s to s':
  ΔΦ = Δpref_i
     - Σ_{j∈N(i)} w_ij·([s'=σ_j] - [s=σ_j])   [only edges incident to i change]
     - Δspread_i

  Δu_i = same expression (by definition of payoff)

  Therefore ΔΦ = Δu_i → exact potential game. QED.

Consequences:
  - Every best-response move strictly increases u_i, so it strictly increases Φ
    Wait — our payoff is maximized, but we want Φ to DECREASE for convergence.
    Convention: we track NEGATIVE potential (lower = better), or equivalently:
    Every best-response move strictly INCREASES Φ, and Φ is bounded above.
    Either way, finite strategy space → finite improvement → convergence.

  - Number of improvement steps ≤ |Φ_max - Φ_min| / min_improvement
    This gives a convergence bound.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .game import TimetableGame, StrategyProfile


@dataclass
class PotentialTrace:
    """Record of Φ values during solver execution."""

    values: list[float] = field(default_factory=list)
    deltas: list[float] = field(default_factory=list)
    monotonic: bool = True  # True if Φ strictly increased at every best-response step

    @property
    def converged(self) -> bool:
        """True if the last delta was 0 (no improvement possible)."""
        return len(self.deltas) > 0 and abs(self.deltas[-1]) < 1e-9

    @property
    def total_improvement(self) -> float:
        return self.values[-1] - self.values[0] if len(self.values) >= 2 else 0.0

    def to_dict(self) -> dict:
        return {
            "values": [round(v, 6) for v in self.values],
            "deltas": [round(d, 6) for d in self.deltas],
            "monotonic": self.monotonic,
            "total_improvement": round(self.total_improvement, 6),
            "num_steps": len(self.values),
        }


class PotentialFunction:
    """Computes and tracks the exact potential function Φ(σ)."""

    def __init__(self, game: TimetableGame):
        self.game = game

    def compute(self, profile: StrategyProfile) -> float:
        """Compute Φ(σ) for the current strategy profile.

        Φ(σ) = Σ_i pref(i, σ_i) - Σ_{(i,j)∈E} w_ij·[σ_i=σ_j] - Σ_i spread(i, σ)

        Note: conflict edges counted ONCE (not twice), unlike the per-player
        payoff which counts each neighbor separately.
        """
        phi = 0.0

        # Preference reward for each player
        for pid in self.game.player_ids:
            ts = profile.get(pid)
            if ts is None:
                continue
            event = self.game.players[pid].event

            teacher_pref = self.game.pref_map.get(event.teacher_id)
            teacher_w = teacher_pref.get_weight(ts) if teacher_pref else 0.5

            group_weights = []
            for gid in event.student_group_ids:
                gp = self.game.pref_map.get(gid)
                group_weights.append(gp.get_weight(ts) if gp else 0.5)
            avg_gw = sum(group_weights) / len(group_weights) if group_weights else 0.5

            phi += (teacher_w + avg_gw) / 2.0

        # Conflict penalty: each edge counted ONCE
        seen_edges: set[tuple[str, str]] = set()
        for pid in self.game.player_ids:
            ts = profile.get(pid)
            if ts is None or pid not in self.game.graph:
                continue
            for neighbor in self.game.graph.neighbors(pid):
                edge_key = tuple(sorted((pid, neighbor)))
                if edge_key in seen_edges:
                    continue
                seen_edges.add(edge_key)
                if profile.get(neighbor) == ts:
                    phi -= self.game.graph.edges[pid, neighbor].get("weight", 1.0)

        # Spread penalty
        for pid in self.game.player_ids:
            ts = profile.get(pid)
            if ts is None:
                continue
            event = self.game.players[pid].event
            for sibling in self.game._section_events.get(event.section_id, []):
                if sibling == pid:
                    continue
                sib_ts = profile.get(sibling)
                if sib_ts and sib_ts.day == ts.day:
                    phi -= self.game.spread_penalty

        return phi

    def verify_improvement(
        self,
        profile_before: StrategyProfile,
        profile_after: StrategyProfile,
        player_id: str,
    ) -> tuple[float, float, bool]:
        """Verify that a best-response move increased Φ.

        Returns (Φ_before, Φ_after, is_valid_improvement).
        """
        phi_before = self.compute(profile_before)
        phi_after = self.compute(profile_after)
        # For a best-response move, Φ_after should be > Φ_before (or equal if no improvement)
        return phi_before, phi_after, phi_after >= phi_before - 1e-9

    def track(self, profile: StrategyProfile, trace: PotentialTrace) -> None:
        """Record current Φ value in the trace."""
        phi = self.compute(profile)
        if trace.values:
            delta = phi - trace.values[-1]
            trace.deltas.append(delta)
            # During best-response phase, Φ should never decrease
            if delta < -1e-9:
                trace.monotonic = False
        trace.values.append(phi)

    def convergence_bound(self, profile: StrategyProfile) -> int:
        """Upper bound on remaining improvement steps.

        Since each best-response step improves Φ by at least min_edge_weight
        (the smallest conflict resolved), and total potential range is bounded:
          max_steps ≤ (Φ_max - Φ_current) / min_improvement

        This is a loose bound but proves finiteness.
        """
        # Φ_max: all players at their best preference, no conflicts
        phi_max = self.game.num_players * 1.0  # max pref = 1.0

        # Minimum possible improvement: smallest edge weight or spread penalty
        min_weights = [self.game.spread_penalty]
        for u, v, data in self.game.graph.edges(data=True):
            min_weights.append(data.get("weight", 1.0))
        min_improvement = min(min_weights) if min_weights else 0.1

        phi_current = self.compute(profile)
        if min_improvement <= 0:
            return 999999
        return max(1, int((phi_max - phi_current) / min_improvement))
