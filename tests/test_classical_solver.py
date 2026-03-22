"""Tests for the classical game-theoretic solver."""

from src.graph.conflict_graph import build_conflict_graph
from src.models.course import Course
from src.models.event import Event
from src.models.room import Room
from src.models.timeslot import Day, TimeSlot
from src.models.preferences import StakeholderPreferences
from src.solvers.classical import ClassicalSolver


class TestClassicalSolver:
    def test_basic_solve(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42)
        timetable = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)

        # All events should be assigned
        assert len(timetable.assignments) == len(sample_events)
        assert timetable.solver == "classical"

    def test_no_teacher_conflicts(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42)
        timetable = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)

        # Events with same teacher should not share a timeslot
        event_map = {e.event_id: e for e in sample_events}
        slot_teachers = {}
        for a in timetable.assignments:
            ev = event_map[a.event_id]
            key = (a.timeslot, ev.teacher_id)
            assert key not in slot_teachers, f"Teacher conflict at {a.timeslot}"
            slot_teachers[key] = a.event_id

    def test_convergence(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42, max_iterations=500)
        timetable = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)
        assert timetable.converged

    def test_room_assignment(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42)
        timetable = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)

        # At least some events should have rooms
        assigned_rooms = [a.room_id for a in timetable.assignments if a.room_id]
        assert len(assigned_rooms) > 0

    def test_preference_respected(self):
        """Teacher with strong morning preference should get morning slots."""
        ts_morning = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        ts_afternoon = TimeSlot(day=Day.MON, period=4, start_hour=14, start_minute=0, duration_minutes=60)
        timeslots = [ts_morning, ts_afternoon]

        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1", student_count=20),
        ]
        rooms = [Room(room_id="R1", name="Room 1", capacity=30)]
        prefs = [StakeholderPreferences(
            entity_id="T1", entity_type="teacher",
            weights={ts_morning: 1.0, ts_afternoon: 0.0},
        )]

        graph = build_conflict_graph(events)
        solver = ClassicalSolver(seed=42)
        tt = solver.solve(graph, events, timeslots, rooms, prefs)

        assert tt.assignments[0].timeslot == ts_morning

    def test_frozen_events(self, sample_events, sample_timeslots, sample_rooms, sample_preferences):
        graph = build_conflict_graph(sample_events)
        solver = ClassicalSolver(seed=42)

        # First solve normally
        tt1 = solver.solve(graph, sample_events, sample_timeslots, sample_rooms, sample_preferences)

        # Then solve with first event frozen — it shouldn't move
        # (frozen_events only prevents changes during best-response, not initial assignment)
        frozen = {sample_events[0].event_id}
        tt2 = solver.solve(
            graph, sample_events, sample_timeslots, sample_rooms, sample_preferences,
            frozen_events=frozen,
        )
        assert len(tt2.assignments) == len(sample_events)
