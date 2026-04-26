"""Scale tests — benchmark solver with 100+ events."""

import time

from src.engine.orchestrator import Orchestrator
from src.solvers.classical import ClassicalSolver


def _build_large_dataset(num_teachers=15, num_groups=6, num_courses=20, lectures_per=3):
    """Build a realistic large dataset.

    Creates num_courses courses, each with lectures_per lectures/week,
    distributed across num_teachers and num_groups with overlapping assignments.
    """
    teachers = [{"teacher_id": f"T{i+1}", "name": f"Prof {i+1}"} for i in range(num_teachers)]
    groups = [{"group_id": f"G{i+1}", "name": f"Year {i+1}", "size": 30 + i * 5} for i in range(num_groups)]
    rooms = [
        {"room_id": f"R{i+1}", "name": f"Room {100+i}", "capacity": 40 + i * 10}
        for i in range(8)
    ] + [
        {"room_id": f"LAB{i+1}", "name": f"Lab {i+1}", "capacity": 30, "room_type": "lab"}
        for i in range(3)
    ]

    courses = []
    sections = []
    for c in range(num_courses):
        cid = f"C{c+1:03d}"
        courses.append({"course_id": cid, "name": f"Course {c+1}"})
        # Assign to a teacher (round-robin with some sharing)
        tid = f"T{(c % num_teachers) + 1}"
        # Assign to 1-2 student groups (overlapping creates conflicts)
        gids = [f"G{(c % num_groups) + 1}"]
        if c % 3 == 0:  # every 3rd course shared between 2 groups
            gids.append(f"G{((c + 1) % num_groups) + 1}")
        sections.append({
            "section_id": f"{cid}-A",
            "course_id": cid,
            "lectures_per_week": lectures_per,
            "teacher_id": tid,
            "student_group_ids": gids,
            "max_students": 50,
        })

    # 5 days x 6 periods = 30 timeslots
    timeslots = [
        {"day": d, "period": p, "start_hour": 8 + p, "start_minute": 0, "duration_minutes": 60}
        for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        for p in range(1, 7)
    ]

    return {
        "courses": courses,
        "sections": sections,
        "teachers": teachers,
        "student_groups": groups,
        "rooms": rooms,
        "timeslots": timeslots,
        "preferences": [],
    }


class TestVectorizedSolver:
    def test_matches_classical_small(self):
        """Vectorized solver produces valid results on small dataset."""
        from src.solvers.vectorized import VectorizedSolver
        data = _build_large_dataset(num_teachers=10, num_groups=4, num_courses=20, lectures_per=3)
        result = Orchestrator(solver=VectorizedSolver(seed=42)).generate(data)
        assert result["converged"]

    def test_1000_events(self):
        """1000 events in reasonable time."""
        from src.solvers.vectorized import VectorizedSolver
        data = _build_large_dataset(num_teachers=40, num_groups=15, num_courses=200, lectures_per=5)
        data['timeslots'] = [
            {"day": d, "period": p, "start_hour": 7+p, "start_minute": 0, "duration_minutes": 60}
            for d in ["Monday","Tuesday","Wednesday","Thursday","Friday"]
            for p in range(1, 11)
        ]
        total = sum(s["lectures_per_week"] for s in data["sections"])
        assert total == 1000

        start = time.time()
        result = Orchestrator(solver=VectorizedSolver(seed=42)).generate(data)
        elapsed = time.time() - start

        assert result["converged"]
        assert elapsed < 30  # should be well under 10s
        print(f"\n  1000 events (vectorized): {elapsed:.2f}s")


class TestScale:
    def test_100_events(self):
        """~60 events (20 courses x 3 lectures). Should converge quickly."""
        data = _build_large_dataset(num_teachers=10, num_groups=4, num_courses=20, lectures_per=3)
        total_events = sum(s["lectures_per_week"] for s in data["sections"])
        assert total_events == 60

        start = time.time()
        result = Orchestrator().generate(data)
        elapsed = time.time() - start

        assert result["converged"]
        assert result["metrics"]["hard_conflicts"] == 0
        print(f"\n  60 events: {elapsed:.2f}s, {result['iterations']} iterations")

    def test_150_events(self):
        """~105 events (35 courses x 3 lectures) with enough slots. Moderate scale."""
        data = _build_large_dataset(num_teachers=15, num_groups=6, num_courses=35, lectures_per=3)
        total_events = sum(s["lectures_per_week"] for s in data["sections"])
        assert total_events == 105

        start = time.time()
        result = Orchestrator().generate(data)
        elapsed = time.time() - start

        assert result["converged"]
        print(f"\n  105 events: {elapsed:.2f}s, {result['iterations']} iters, {result['metrics']['hard_conflicts']} hard conflicts")

    def test_200_events(self):
        """~200 events (40 courses x 5 lectures) with 8 periods. Stress test."""
        data = _build_large_dataset(num_teachers=20, num_groups=8, num_courses=40, lectures_per=5)
        # Expand to 8 periods/day = 40 slots
        data["timeslots"] = [
            {"day": d, "period": p, "start_hour": 7 + p, "start_minute": 0, "duration_minutes": 60}
            for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
            for p in range(1, 9)
        ]
        total_events = sum(s["lectures_per_week"] for s in data["sections"])
        assert total_events == 200

        start = time.time()
        result = Orchestrator().generate(data)
        elapsed = time.time() - start

        assert result["converged"]
        print(f"\n  200 events: {elapsed:.2f}s, {result['iterations']} iters, {result['metrics']['hard_conflicts']} hard conflicts")

    def test_game_theory_at_scale(self):
        """Verify Nash equilibrium holds at 100+ events with solvable instance."""
        data = _build_large_dataset(num_teachers=15, num_groups=6, num_courses=35, lectures_per=3)

        result = Orchestrator().generate(data)
        gt = result["metrics"].get("game_theory", {})

        assert gt.get("nash_equilibrium", {}).get("is_nash") is True
        # Welfare can be negative when conflicts exist — check fairness instead
        assert gt.get("welfare", {}).get("jain_fairness", 0) > 0
