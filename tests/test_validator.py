"""Tests for the validator."""

from src.engine.validator import validate_timetable
from src.models.event import Event
from src.models.room import Room
from src.models.timeslot import Day, TimeSlot
from src.models.timetable import Assignment, Timetable


class TestValidator:
    def _ts(self, day=Day.MON, period=1, hour=9):
        return TimeSlot(day=day, period=period, start_hour=hour, start_minute=0, duration_minutes=60)

    def test_valid_timetable(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1", student_count=20),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T2", student_count=20),
        ]
        rooms = [Room(room_id="R1", name="R1", capacity=30)]
        tt = Timetable(assignments=[
            Assignment(event_id="E1", timeslot=self._ts(Day.MON, 1), room_id="R1"),
            Assignment(event_id="E2", timeslot=self._ts(Day.TUE, 1), room_id="R1"),
        ])
        result = validate_timetable(tt, events, rooms)
        assert result["valid"]
        assert len(result["hard_violations"]) == 0

    def test_teacher_conflict_detected(self):
        ts = self._ts()
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1"),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T1"),
        ]
        rooms = []
        tt = Timetable(assignments=[
            Assignment(event_id="E1", timeslot=ts),
            Assignment(event_id="E2", timeslot=ts),
        ])
        result = validate_timetable(tt, events, rooms)
        assert not result["valid"]
        assert any("Teacher T1" in v for v in result["hard_violations"])

    def test_room_capacity_violation(self):
        ts = self._ts()
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1", student_count=50),
        ]
        rooms = [Room(room_id="R1", name="R1", capacity=30)]
        tt = Timetable(assignments=[
            Assignment(event_id="E1", timeslot=ts, room_id="R1"),
        ])
        result = validate_timetable(tt, events, rooms)
        assert not result["valid"]

    def test_same_section_same_day_soft_violation(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1", lecture_index=0),
            Event(event_id="E2", section_id="S1", course_id="C1", teacher_id="T1", lecture_index=1),
        ]
        rooms = []
        tt = Timetable(assignments=[
            Assignment(event_id="E1", timeslot=self._ts(Day.MON, 1, 9)),
            Assignment(event_id="E2", timeslot=self._ts(Day.MON, 2, 10)),
        ])
        result = validate_timetable(tt, events, rooms)
        assert result["valid"]  # soft only
        assert len(result["soft_violations"]) > 0
