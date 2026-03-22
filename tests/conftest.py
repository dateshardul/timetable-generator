"""Shared test fixtures."""

import pytest

from src.models.course import Course, Section
from src.models.event import Event
from src.models.preferences import StakeholderPreferences
from src.models.room import Room
from src.models.student import StudentGroup
from src.models.teacher import Teacher
from src.models.timeslot import Day, TimeSlot


@pytest.fixture
def sample_timeslots():
    """5 days x 4 periods = 20 timeslots."""
    slots = []
    for day in [Day.MON, Day.TUE, Day.WED, Day.THU, Day.FRI]:
        for period in range(1, 5):
            hour = 8 + period  # 9, 10, 11, 12
            slots.append(TimeSlot(day=day, period=period, start_hour=hour, start_minute=0, duration_minutes=60))
    return slots


@pytest.fixture
def sample_teachers():
    return [
        Teacher(teacher_id="T1", name="Dr. Smith"),
        Teacher(teacher_id="T2", name="Dr. Jones"),
    ]


@pytest.fixture
def sample_student_groups():
    return [
        StudentGroup(group_id="G1", name="CS Year 1", size=40),
        StudentGroup(group_id="G2", name="CS Year 2", size=35),
    ]


@pytest.fixture
def sample_rooms():
    return [
        Room(room_id="R1", name="Room 101", capacity=50),
        Room(room_id="R2", name="Room 102", capacity=40),
        Room(room_id="R3", name="Lab A", capacity=30, room_type="lab"),
    ]


@pytest.fixture
def sample_courses():
    return [
        Course(course_id="CS101", name="Intro to CS"),
        Course(course_id="CS201", name="Data Structures", prerequisites=["CS101"]),
    ]


@pytest.fixture
def sample_sections(sample_courses):
    return [
        Section(section_id="CS101-A", course_id="CS101", lectures_per_week=3,
                teacher_id="T1", student_group_ids=["G1"], max_students=40),
        Section(section_id="CS201-A", course_id="CS201", lectures_per_week=2,
                teacher_id="T2", student_group_ids=["G2"], max_students=35),
    ]


@pytest.fixture
def sample_events(sample_sections, sample_student_groups):
    """5 events: 3 for CS101, 2 for CS201."""
    group_map = {g.group_id: g for g in sample_student_groups}
    events = []
    for sec in sample_sections:
        count = sum(group_map[gid].size for gid in sec.student_group_ids if gid in group_map)
        for i in range(sec.lectures_per_week):
            events.append(Event(
                event_id=f"{sec.section_id}_L{i}",
                section_id=sec.section_id,
                course_id=sec.course_id,
                teacher_id=sec.teacher_id,
                student_group_ids=list(sec.student_group_ids),
                student_count=count,
                lecture_index=i,
            ))
    return events


@pytest.fixture
def sample_preferences(sample_timeslots):
    """Teacher T1 prefers mornings, T2 prefers afternoons."""
    t1_weights = {}
    t2_weights = {}
    for ts in sample_timeslots:
        t1_weights[ts] = 0.9 if ts.start_hour <= 10 else 0.3
        t2_weights[ts] = 0.3 if ts.start_hour <= 10 else 0.9
    return [
        StakeholderPreferences(entity_id="T1", entity_type="teacher", weights=t1_weights),
        StakeholderPreferences(entity_id="T2", entity_type="teacher", weights=t2_weights),
    ]


@pytest.fixture
def sample_input_data():
    """Complete JSON input for orchestrator tests."""
    return {
        "courses": [
            {"course_id": "CS101", "name": "Intro to CS"},
            {"course_id": "CS201", "name": "Data Structures", "prerequisites": ["CS101"]},
        ],
        "sections": [
            {"section_id": "CS101-A", "course_id": "CS101", "lectures_per_week": 3,
             "teacher_id": "T1", "student_group_ids": ["G1"], "max_students": 40},
            {"section_id": "CS201-A", "course_id": "CS201", "lectures_per_week": 2,
             "teacher_id": "T2", "student_group_ids": ["G2"], "max_students": 35},
        ],
        "teachers": [
            {"teacher_id": "T1", "name": "Dr. Smith"},
            {"teacher_id": "T2", "name": "Dr. Jones"},
        ],
        "student_groups": [
            {"group_id": "G1", "name": "CS Year 1", "size": 40},
            {"group_id": "G2", "name": "CS Year 2", "size": 35},
        ],
        "rooms": [
            {"room_id": "R1", "name": "Room 101", "capacity": 50},
            {"room_id": "R2", "name": "Room 102", "capacity": 40},
            {"room_id": "R3", "name": "Lab A", "capacity": 30, "room_type": "lab"},
        ],
        "timeslots": [
            {"day": "Monday", "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
            for p in range(1, 5)
        ] + [
            {"day": "Tuesday", "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
            for p in range(1, 5)
        ] + [
            {"day": "Wednesday", "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
            for p in range(1, 5)
        ] + [
            {"day": "Thursday", "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
            for p in range(1, 5)
        ] + [
            {"day": "Friday", "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
            for p in range(1, 5)
        ],
        "preferences": [],
    }
