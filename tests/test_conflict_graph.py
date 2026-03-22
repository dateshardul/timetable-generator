"""Tests for conflict graph construction."""

from src.graph.conflict_graph import build_conflict_graph, HARD_WEIGHT, SOFT_WEIGHT, PREREQUISITE_WEIGHT
from src.models.course import Course
from src.models.event import Event
from src.models.student import StudentGroup


class TestConflictGraph:
    def test_same_teacher_hard_conflict(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1"),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T1"),
        ]
        G = build_conflict_graph(events)
        assert G.has_edge("E1", "E2")
        assert G.edges["E1", "E2"]["weight"] >= HARD_WEIGHT
        assert "same_teacher" in G.edges["E1", "E2"]["types"]

    def test_same_student_group_hard_conflict(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1",
                  student_group_ids=["G1"]),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T2",
                  student_group_ids=["G1"]),
        ]
        G = build_conflict_graph(events)
        assert G.has_edge("E1", "E2")
        assert "same_student_group" in G.edges["E1", "E2"]["types"]

    def test_same_section_soft_conflict(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1", lecture_index=0),
            Event(event_id="E2", section_id="S1", course_id="C1", teacher_id="T1", lecture_index=1),
        ]
        G = build_conflict_graph(events)
        assert G.has_edge("E1", "E2")
        types = G.edges["E1", "E2"]["types"]
        assert "same_section" in types
        # Also has same_teacher
        assert "same_teacher" in types

    def test_no_conflict_independent_events(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1"),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T2"),
        ]
        G = build_conflict_graph(events)
        assert not G.has_edge("E1", "E2")

    def test_prerequisite_conflict(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1"),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T2"),
        ]
        courses = {
            "C1": Course(course_id="C1", name="Intro"),
            "C2": Course(course_id="C2", name="Advanced", prerequisites=["C1"]),
        }
        G = build_conflict_graph(events, courses=courses)
        assert G.has_edge("E1", "E2")
        assert "prerequisite" in G.edges["E1", "E2"]["types"]

    def test_equipment_conflict(self):
        events = [
            Event(event_id="E1", section_id="S1", course_id="C1", teacher_id="T1",
                  equipment=["oscilloscope"]),
            Event(event_id="E2", section_id="S2", course_id="C2", teacher_id="T2",
                  equipment=["oscilloscope"]),
        ]
        G = build_conflict_graph(events)
        assert G.has_edge("E1", "E2")
        assert "same_equipment" in G.edges["E1", "E2"]["types"]

    def test_node_count(self, sample_events):
        G = build_conflict_graph(sample_events)
        assert G.number_of_nodes() == 5
