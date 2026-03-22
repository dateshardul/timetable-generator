"""Tests for data models."""

from src.models.timeslot import Day, TimeSlot
from src.models.course import Course, Section
from src.models.room import Room
from src.models.teacher import Teacher
from src.models.student import StudentGroup
from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.timetable import Assignment, Timetable


class TestTimeSlot:
    def test_frozen_hashable(self):
        ts1 = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        ts2 = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        assert ts1 == ts2
        assert hash(ts1) == hash(ts2)
        assert ts1 in {ts2}

    def test_no_overlap_different_day(self):
        ts1 = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        ts2 = TimeSlot(day=Day.TUE, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        assert not ts1.overlaps(ts2)

    def test_overlap_same_day(self):
        ts1 = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        ts2 = TimeSlot(day=Day.MON, period=2, start_hour=9, start_minute=30, duration_minutes=60)
        assert ts1.overlaps(ts2)

    def test_no_overlap_adjacent(self):
        ts1 = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        ts2 = TimeSlot(day=Day.MON, period=2, start_hour=10, start_minute=0, duration_minutes=60)
        assert not ts1.overlaps(ts2)

    def test_end_time(self):
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=30, duration_minutes=90)
        assert ts.end_hour == 11
        assert ts.end_minute == 0

    def test_label(self):
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        assert "Monday" in ts.label
        assert "P1" in ts.label


class TestPreferences:
    def test_default_weight(self):
        prefs = StakeholderPreferences(entity_id="T1", entity_type="teacher")
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        assert prefs.get_weight(ts) == 0.5

    def test_set_weight(self):
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        prefs = StakeholderPreferences(entity_id="T1", entity_type="teacher", weights={ts: 0.9})
        assert prefs.get_weight(ts) == 0.9


class TestTimetable:
    def test_to_dict(self):
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        tt = Timetable(
            assignments=[Assignment(event_id="E1", timeslot=ts, room_id="R1")],
            converged=True,
            iterations=5,
        )
        d = tt.to_dict()
        assert d["converged"] is True
        assert len(d["assignments"]) == 1
        assert d["assignments"][0]["event_id"] == "E1"

    def test_get_assignment(self):
        ts = TimeSlot(day=Day.MON, period=1, start_hour=9, start_minute=0, duration_minutes=60)
        tt = Timetable(assignments=[Assignment(event_id="E1", timeslot=ts)])
        assert tt.get_assignment("E1") is not None
        assert tt.get_assignment("E999") is None
