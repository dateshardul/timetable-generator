"""Pipeline orchestrator: input -> models -> graph -> solver -> timetable."""

from __future__ import annotations

from src.graph.conflict_graph import build_conflict_graph
from src.models.course import Course, Section
from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.student import StudentGroup
from src.models.teacher import Teacher
from src.models.timeslot import Day, TimeSlot
from src.models.timetable import Timetable
from src.solvers.base import SolverBackend
from src.solvers.classical import ClassicalSolver

from .metrics import compute_metrics
from .validator import validate_timetable


class Orchestrator:
    """Coordinates the full pipeline: parse input -> build graph -> solve -> validate."""

    def __init__(self, solver: SolverBackend | None = None):
        self.solver = solver or ClassicalSolver(seed=42)

    def generate(self, input_data: dict) -> dict:
        """Full pipeline from JSON input to timetable output.

        Args:
            input_data: Dict with courses, sections, teachers, student_groups,
                        rooms, timeslots, preferences.

        Returns:
            Dict with assignments, metrics, converged, iterations, solver,
            and validation results.
        """
        # Parse input
        courses, sections, teachers, student_groups, rooms, timeslots, preferences = (
            self._parse_input(input_data)
        )

        # Create events from sections
        events = self._create_events(sections, student_groups)

        # Build conflict graph
        course_map = {c.course_id: c for c in courses}
        group_map = {g.group_id: g for g in student_groups}
        graph = build_conflict_graph(events, course_map, group_map)

        # Solve
        timetable = self.solver.solve(graph, events, timeslots, rooms, preferences)

        # Compute metrics (preserve game_theory analysis from solver)
        game_theory = timetable.metrics.get("game_theory")
        metrics = compute_metrics(timetable, events, rooms, preferences)
        if game_theory:
            metrics["game_theory"] = game_theory
        timetable.metrics = metrics

        # Validate
        validation = validate_timetable(timetable, events, rooms)

        result = timetable.to_dict()
        result["validation"] = validation
        return result

    def regenerate(
        self, input_data: dict, updated_preferences: list[dict]
    ) -> dict:
        """Re-run with updated preferences (feedback loop)."""
        input_data = dict(input_data)
        input_data["preferences"] = updated_preferences
        return self.generate(input_data)

    def reschedule(
        self, input_data: dict, frozen_event_ids: list[str]
    ) -> dict:
        """Partial re-solve: freeze unaffected events, re-solve the rest."""
        courses, sections, teachers, student_groups, rooms, timeslots, preferences = (
            self._parse_input(input_data)
        )
        events = self._create_events(sections, student_groups)
        course_map = {c.course_id: c for c in courses}
        group_map = {g.group_id: g for g in student_groups}
        graph = build_conflict_graph(events, course_map, group_map)

        timetable = self.solver.solve(
            graph, events, timeslots, rooms, preferences,
            frozen_events=set(frozen_event_ids),
        )

        game_theory = timetable.metrics.get("game_theory")
        metrics = compute_metrics(timetable, events, rooms, preferences)
        if game_theory:
            metrics["game_theory"] = game_theory
        timetable.metrics = metrics
        validation = validate_timetable(timetable, events, rooms)

        result = timetable.to_dict()
        result["validation"] = validation
        return result

    def _parse_input(self, data: dict) -> tuple:
        """Parse JSON input into model objects."""
        day_map = {d.value: d for d in Day}

        courses = [Course(**c) for c in data.get("courses", [])]
        sections = [Section(**s) for s in data.get("sections", [])]
        teachers = [Teacher(**t) for t in data.get("teachers", [])]
        student_groups = [StudentGroup(**g) for g in data.get("student_groups", [])]
        rooms = [Room(**r) for r in data.get("rooms", [])]

        timeslots = []
        for ts in data.get("timeslots", []):
            ts_copy = dict(ts)
            ts_copy["day"] = day_map[ts_copy["day"]] if isinstance(ts_copy["day"], str) else ts_copy["day"]
            timeslots.append(TimeSlot(**ts_copy))

        preferences = []
        for p in data.get("preferences", []):
            weights = {}
            for w in p.get("weights", []):
                w_copy = dict(w)
                day = day_map[w_copy.pop("day")] if isinstance(w_copy.get("day"), str) else w_copy.pop("day", None)
                weight_val = w_copy.pop("weight")
                ts = TimeSlot(day=day, **w_copy)
                weights[ts] = weight_val
            # Parse additional preference dimensions
            room_weights = {rw["room_id"]: rw["weight"] for rw in p.get("room_weights", [])}
            teacher_weights = {tw["teacher_id"]: tw["weight"] for tw in p.get("teacher_weights", [])}
            course_weights = {cw["course_id"]: cw["weight"] for cw in p.get("course_weights", [])}

            preferences.append(StakeholderPreferences(
                entity_id=p["entity_id"],
                entity_type=p["entity_type"],
                weights=weights,
                room_weights=room_weights,
                teacher_weights=teacher_weights,
                course_weights=course_weights,
            ))

        return courses, sections, teachers, student_groups, rooms, timeslots, preferences

    def _create_events(
        self,
        sections: list[Section],
        student_groups: list[StudentGroup],
    ) -> list[Event]:
        """Create Event objects from sections."""
        group_map = {g.group_id: g for g in student_groups}
        events = []
        for sec in sections:
            student_count = sum(
                group_map[gid].size for gid in sec.student_group_ids if gid in group_map
            )
            for i in range(sec.lectures_per_week):
                events.append(Event(
                    event_id=f"{sec.section_id}_L{i}",
                    section_id=sec.section_id,
                    course_id=sec.course_id,
                    teacher_id=sec.teacher_id or "",
                    student_group_ids=list(sec.student_group_ids),
                    student_count=student_count,
                    event_type=sec.section_type,
                    lecture_index=i,
                ))
        return events
