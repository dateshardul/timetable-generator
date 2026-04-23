"""Nash equilibrium verification and analysis.

A strategy profile σ is a pure Nash equilibrium if no player can
unilaterally improve their payoff:
  ∀i ∈ N, ∀s' ∈ S_i: u_i(σ_i, σ_{-i}) ≥ u_i(s', σ_{-i})

In our exact potential game, every local maximum of Φ is a Nash equilibrium.
The converse also holds: every Nash equilibrium is a local maximum of Φ.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .game import TimetableGame, StrategyProfile


@dataclass
class NashReport:
    """Result of Nash equilibrium verification."""

    is_nash: bool
    deviating_players: list[dict] = field(default_factory=list)
    # Each entry: {player_id, current_strategy, current_payoff, best_strategy, best_payoff, improvement}
    epsilon: float = 0.0  # max improvement any player could get = ε-Nash measure

    @property
    def num_deviators(self) -> int:
        return len(self.deviating_players)

    def to_dict(self) -> dict:
        return {
            "is_nash": self.is_nash,
            "num_deviators": self.num_deviators,
            "epsilon": round(self.epsilon, 6),
            "deviating_players": self.deviating_players[:10],  # cap for display
        }


class NashVerifier:
    """Verify whether a strategy profile is a Nash equilibrium."""

    def __init__(self, game: TimetableGame):
        self.game = game

    def verify(self, profile: StrategyProfile) -> NashReport:
        """Check if profile is a Nash equilibrium.

        For each player, compute best-response payoff and compare to current.
        If any player can improve, it's not Nash.
        """
        deviators = []
        max_improvement = 0.0

        for pid in self.game.player_ids:
            current_ts = profile.get(pid)
            if current_ts is None:
                continue

            current_payoff = self.game.payoff(pid, profile)
            best_ts, best_payoff = self.game.best_response(pid, profile)

            improvement = best_payoff - current_payoff
            if improvement > 1e-9:
                deviators.append({
                    "player_id": pid,
                    "current_strategy": str(current_ts),
                    "current_payoff": round(current_payoff, 4),
                    "best_strategy": str(best_ts),
                    "best_payoff": round(best_payoff, 4),
                    "improvement": round(improvement, 4),
                })
                max_improvement = max(max_improvement, improvement)

        return NashReport(
            is_nash=len(deviators) == 0,
            deviating_players=deviators,
            epsilon=max_improvement,
        )

    def verify_epsilon_nash(self, profile: StrategyProfile, epsilon: float) -> bool:
        """Check if profile is an ε-Nash equilibrium.

        No player can improve by more than ε.
        """
        report = self.verify(profile)
        return report.epsilon <= epsilon

    def best_response_dynamics_step(
        self, profile: StrategyProfile, player_id: str
    ) -> tuple[StrategyProfile, float]:
        """Execute one best-response step for a specific player.

        Returns (new_profile, improvement). Improvement is 0 if already at best response.
        """
        current_payoff = self.game.payoff(player_id, profile)
        best_ts, best_payoff = self.game.best_response(player_id, profile)

        if best_payoff <= current_payoff + 1e-9:
            return profile, 0.0

        new_profile = profile.copy()
        new_profile.set(player_id, best_ts)
        return new_profile, best_payoff - current_payoff
