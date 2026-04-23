"""Tests for game-theoretic foundation."""

import pytest

from src.game.game import TimetableGame, StrategyProfile
from src.game.potential import PotentialFunction, PotentialTrace
from src.game.equilibrium import NashVerifier
from src.game.welfare import WelfareAnalyzer
from src.graph.conflict_graph import build_conflict_graph
from src.models.event import Event
from src.models.timeslot import Day, TimeSlot
from src.models.preferences import StakeholderPreferences


def _ts(day, period, hour):
    return TimeSlot(day=day, period=period, start_hour=hour, start_minute=0, duration_minutes=60)


@pytest.fixture
def simple_game():
    """Two events with same teacher — must be in different timeslots."""
    events = [
        Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1"),
        Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T1"),
    ]
    timeslots = [
        _ts(Day.MON, 1, 9),
        _ts(Day.MON, 2, 10),
        _ts(Day.TUE, 1, 9),
    ]
    graph = build_conflict_graph(events)
    prefs = []
    game = TimetableGame(events, timeslots, graph, prefs)
    return game, events, timeslots


class TestTimetableGame:
    def test_payoff_no_conflict(self, simple_game):
        game, events, ts = simple_game
        profile = StrategyProfile()
        profile.set("E1", ts[0])  # Mon P1
        profile.set("E2", ts[1])  # Mon P2
        # No conflict — both should have positive payoff
        p1 = game.payoff("E1", profile)
        p2 = game.payoff("E2", profile)
        assert p1 > 0
        assert p2 > 0

    def test_payoff_with_conflict(self, simple_game):
        game, events, ts = simple_game
        profile = StrategyProfile()
        profile.set("E1", ts[0])  # Mon P1
        profile.set("E2", ts[0])  # Mon P1 — same slot, same teacher = conflict!
        # Should have very negative payoff due to conflict weight 1000
        p1 = game.payoff("E1", profile)
        assert p1 < -500  # heavily penalized

    def test_best_response_avoids_conflict(self, simple_game):
        game, events, ts = simple_game
        # Start with both at same slot (conflict)
        profile = StrategyProfile()
        profile.set("E1", ts[0])
        profile.set("E2", ts[0])
        # Best response for E2 should pick a different slot
        best_ts, best_payoff = game.best_response("E2", profile)
        assert best_ts != ts[0]
        assert best_payoff > game.payoff("E2", profile)


class TestPotentialFunction:
    def test_phi_higher_without_conflicts(self, simple_game):
        game, events, ts = simple_game
        phi = PotentialFunction(game)

        conflict_profile = StrategyProfile({"E1": ts[0], "E2": ts[0]})
        clean_profile = StrategyProfile({"E1": ts[0], "E2": ts[1]})

        phi_conflict = phi.compute(conflict_profile)
        phi_clean = phi.compute(clean_profile)
        assert phi_clean > phi_conflict

    def test_best_response_increases_phi(self, simple_game):
        game, events, ts = simple_game
        phi = PotentialFunction(game)

        # Start with conflict
        before = StrategyProfile({"E1": ts[0], "E2": ts[0]})
        phi_before = phi.compute(before)

        # Apply best response for E2
        best_ts, _ = game.best_response("E2", before)
        after = before.copy()
        after.set("E2", best_ts)
        phi_after = phi.compute(after)

        # Phi should increase (or stay same)
        assert phi_after >= phi_before

    def test_trace_monotonic(self, simple_game):
        game, events, ts = simple_game
        phi = PotentialFunction(game)
        trace = PotentialTrace()

        # Record conflict state
        profile = StrategyProfile({"E1": ts[0], "E2": ts[0]})
        phi.track(profile, trace)

        # Best response E2
        best_ts, _ = game.best_response("E2", profile)
        profile.set("E2", best_ts)
        phi.track(profile, trace)

        assert len(trace.values) == 2
        assert trace.monotonic  # should be non-decreasing


class TestNashVerifier:
    def test_conflict_is_not_nash(self, simple_game):
        game, events, ts = simple_game
        verifier = NashVerifier(game)
        profile = StrategyProfile({"E1": ts[0], "E2": ts[0]})
        report = verifier.verify(profile)
        assert not report.is_nash
        assert report.num_deviators > 0

    def test_clean_assignment_is_nash(self, simple_game):
        game, events, ts = simple_game
        verifier = NashVerifier(game)
        profile = StrategyProfile({"E1": ts[0], "E2": ts[1]})
        report = verifier.verify(profile)
        assert report.is_nash
        assert report.num_deviators == 0
        assert report.epsilon < 1e-6


class TestWelfareAnalyzer:
    def test_welfare_positive_for_clean(self, simple_game):
        game, events, ts = simple_game
        analyzer = WelfareAnalyzer(game)
        profile = StrategyProfile({"E1": ts[0], "E2": ts[1]})
        report = analyzer.analyze(profile)
        assert report.social_welfare > 0
        assert 0 <= report.jain_fairness <= 1.0

    def test_welfare_lower_with_conflicts(self, simple_game):
        game, events, ts = simple_game
        analyzer = WelfareAnalyzer(game)
        clean = StrategyProfile({"E1": ts[0], "E2": ts[1]})
        conflict = StrategyProfile({"E1": ts[0], "E2": ts[0]})
        w_clean = analyzer.analyze(clean).social_welfare
        w_conflict = analyzer.analyze(conflict).social_welfare
        assert w_clean > w_conflict

    def test_stakeholder_utilities(self, simple_game):
        game, events, ts = simple_game
        analyzer = WelfareAnalyzer(game)
        profile = StrategyProfile({"E1": ts[0], "E2": ts[1]})
        utils = analyzer.stakeholder_utilities(profile)
        # T1 teaches both events
        assert "T1" in utils
        assert utils["T1"]["num_events"] == 2


class TestSolverIntegration:
    """Test that the solver produces valid game-theoretic output."""

    def test_solver_output_has_game_theory(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        from src.graph.conflict_graph import build_conflict_graph
        from src.solvers.classical import ClassicalSolver

        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42)
        timetable = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)

        assert "game_theory" in timetable.metrics
        gt = timetable.metrics["game_theory"]

        # Nash equilibrium verified
        assert gt["nash_equilibrium"]["is_nash"] is True

        # Potential function computed
        assert "phi" in gt["potential_function"]

        # Welfare computed
        assert gt["welfare"]["social_welfare"] > 0
        assert 0 <= gt["welfare"]["jain_fairness"] <= 1.0
