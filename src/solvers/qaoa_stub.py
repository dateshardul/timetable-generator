"""QAOA circuit formulation stub (Phase 3).

Converts the QUBO to an Ising Hamiltonian, then builds a p-layer QAOA circuit
with parameterized gamma/beta angles optimized via classical optimizer.

To use: pip install qiskit qiskit-optimization
"""

from __future__ import annotations

import networkx as nx

from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.timeslot import TimeSlot
from src.models.timetable import Timetable

from .base import SolverBackend


class QAOASolver(SolverBackend):
    """Gate-based QAOA solver (stub)."""

    @property
    def name(self) -> str:
        return "qaoa"

    def solve(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        rooms: list[Room],
        preferences: list[StakeholderPreferences],
        frozen_events: set[str] | None = None,
    ) -> Timetable:
        raise NotImplementedError(
            "QAOA solver not yet implemented. "
            "Install qiskit and qiskit-optimization to enable."
        )

    def build_ising_hamiltonian(
        self,
        graph: nx.Graph,
        events: list[Event],
        timeslots: list[TimeSlot],
        preferences: list[StakeholderPreferences],
    ) -> tuple[dict, dict, float]:
        """Build Ising Hamiltonian from QUBO.

        Returns:
            (linear_terms, quadratic_terms, offset) for Ising model.
        """
        raise NotImplementedError("Ising Hamiltonian construction not yet implemented.")
