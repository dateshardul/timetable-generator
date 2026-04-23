"""Social welfare analysis and Price of Anarchy.

Social Welfare: W(σ) = Σ_i u_i(σ)  (sum of all players' payoffs)

Price of Anarchy (PoA): measures how much worse a Nash equilibrium can be
compared to the social optimum:
  PoA = W(σ*) / W(σ_NE)
  where σ* = social optimum, σ_NE = worst Nash equilibrium

For weighted congestion games, theoretical PoA bounds exist.
We compute the empirical PoA for the specific instance.

Price of Stability (PoS): ratio of BEST Nash equilibrium to social optimum.
  PoS = W(σ*) / W(σ_best_NE)
For exact potential games, PoS = 1 (the potential maximizer IS socially optimal
among Nash equilibria).

Fairness: Beyond total welfare, we measure distribution of payoffs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .game import TimetableGame, StrategyProfile


@dataclass
class WelfareReport:
    """Social welfare analysis of a strategy profile."""

    social_welfare: float = 0.0           # Σ u_i(σ)
    avg_payoff: float = 0.0               # W / n
    min_payoff: float = 0.0               # min_i u_i(σ)
    max_payoff: float = 0.0               # max_i u_i(σ)
    jain_fairness: float = 0.0            # Jain's fairness index
    payoff_distribution: dict[str, float] = field(default_factory=dict)  # player_id -> payoff
    gini_coefficient: float = 0.0         # inequality measure (0=equal, 1=unequal)
    estimated_poa: float | None = None    # empirical Price of Anarchy estimate

    def to_dict(self) -> dict:
        return {
            "social_welfare": round(self.social_welfare, 4),
            "avg_payoff": round(self.avg_payoff, 4),
            "min_payoff": round(self.min_payoff, 4),
            "max_payoff": round(self.max_payoff, 4),
            "jain_fairness": round(self.jain_fairness, 4),
            "gini_coefficient": round(self.gini_coefficient, 4),
            "estimated_poa": round(self.estimated_poa, 4) if self.estimated_poa else None,
        }


class WelfareAnalyzer:
    """Analyze social welfare properties of a timetable assignment."""

    def __init__(self, game: TimetableGame):
        self.game = game

    def analyze(self, profile: StrategyProfile) -> WelfareReport:
        """Compute welfare metrics for a strategy profile."""
        payoffs = {}
        for pid in self.game.player_ids:
            payoffs[pid] = self.game.payoff(pid, profile)

        values = list(payoffs.values())
        n = len(values)
        if n == 0:
            return WelfareReport()

        total = sum(values)
        avg = total / n
        mn = min(values)
        mx = max(values)

        # Jain's fairness: (Σx)² / (n·Σx²)
        sq_sum = sum(v * v for v in values)
        jain = (total * total) / (n * sq_sum) if sq_sum > 0 else 1.0

        # Gini coefficient
        gini = self._gini(values)

        return WelfareReport(
            social_welfare=total,
            avg_payoff=avg,
            min_payoff=mn,
            max_payoff=mx,
            jain_fairness=jain,
            payoff_distribution=payoffs,
            gini_coefficient=gini,
        )

    def estimate_price_of_anarchy(
        self,
        nash_profile: StrategyProfile,
        num_random_samples: int = 100,
    ) -> float:
        """Estimate Price of Anarchy by comparing Nash welfare to random profiles.

        True PoA requires finding the social optimum (NP-hard for graph coloring).
        Instead, we sample random profiles and use the best as a lower bound
        on the social optimum, giving an upper bound on PoA.

        Returns estimated PoA (≥ 1.0, lower is better).
        """
        import random

        nash_welfare = sum(
            self.game.payoff(pid, nash_profile) for pid in self.game.player_ids
        )

        if nash_welfare <= 0:
            return float("inf")

        best_random_welfare = nash_welfare
        rng = random.Random(42)

        for _ in range(num_random_samples):
            random_profile = StrategyProfile()
            for pid in self.game.player_ids:
                player = self.game.players[pid]
                random_profile.set(pid, rng.choice(player.strategies))
            w = sum(self.game.payoff(pid, random_profile) for pid in self.game.player_ids)
            best_random_welfare = max(best_random_welfare, w)

        return best_random_welfare / nash_welfare if nash_welfare > 0 else float("inf")

    @staticmethod
    def _gini(values: list[float]) -> float:
        """Compute Gini coefficient of a list of values."""
        if not values:
            return 0.0
        # Shift to non-negative for Gini calculation
        mn = min(values)
        shifted = [v - mn for v in values]
        n = len(shifted)
        total = sum(shifted)
        if total == 0:
            return 0.0
        sorted_vals = sorted(shifted)
        numerator = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(sorted_vals))
        return numerator / (n * total)

    def stakeholder_utilities(
        self, profile: StrategyProfile
    ) -> dict[str, dict]:
        """Compute per-stakeholder (teacher/group) utility, not per-event.

        Groups event payoffs by their teacher and student groups to show
        how the timetable affects each real person/group.
        """
        teacher_payoffs: dict[str, list[float]] = {}
        group_payoffs: dict[str, list[float]] = {}

        for pid in self.game.player_ids:
            payoff = self.game.payoff(pid, profile)
            event = self.game.players[pid].event

            teacher_payoffs.setdefault(event.teacher_id, []).append(payoff)
            for gid in event.student_group_ids:
                group_payoffs.setdefault(gid, []).append(payoff)

        result = {}
        for tid, payoffs in teacher_payoffs.items():
            result[tid] = {
                "type": "teacher",
                "total_payoff": round(sum(payoffs), 4),
                "avg_payoff": round(sum(payoffs) / len(payoffs), 4),
                "num_events": len(payoffs),
            }
        for gid, payoffs in group_payoffs.items():
            result[gid] = {
                "type": "student_group",
                "total_payoff": round(sum(payoffs), 4),
                "avg_payoff": round(sum(payoffs) / len(payoffs), 4),
                "num_events": len(payoffs),
            }
        return result
