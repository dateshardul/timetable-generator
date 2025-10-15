from student import Student
from teacher import Teacher
from room import Room
from timetable_graph import TimetableGraph

def main():
    timetable = TimetableGraph()

    # Create instances of students, teachers, and rooms
    student1 = Student(student_id='s1', name='Alice', actions={'Course Selection', 'Preferred Class Timings', 'Priority Preferences'})
    teacher1 = Teacher(teacher_id='t1', name='Mr. Smith', actions={'Course Preferences', 'Preferred Class Timings', 'Workload Considerations'})
    room1 = Room(room_id='r1', name='Room A', actions={'Room Allocation', 'Class Timings'})

    # Add nodes representing students, teachers, and rooms to the timetable graph
    timetable.add_event(student1.student_id, student1.name, student1.actions)
    timetable.add_resource(teacher1.teacher_id, 'teacher', teacher1.name, teacher1.actions)
    timetable.add_resource(room1.room_id, 'room', room1.name, room1.actions)

    # Add constraints and other properties as needed
    timetable.add_constraint(student1.student_id, room1.room_id, 'room_allocation')
    timetable.add_constraint(student1.student_id, teacher1.teacher_id, 'teacher_assignment')

    # Set strategies, payoffs, and constraints
    timetable.set_strategy(student1.student_id, 'Course Prioritization')
    timetable.set_strategy(student1.student_id, 'Flexibility')
    timetable.set_strategy(student1.student_id, 'Communication')

    timetable.set_strategy(teacher1.teacher_id, 'Course Preference Emphasis')
    timetable.set_strategy(teacher1.teacher_id, 'Availability Management')
    timetable.set_strategy(teacher1.teacher_id, 'Negotiation')

    timetable.set_strategy(room1.room_id, 'Optimal Room Allocation')
    timetable.set_strategy(room1.room_id, 'Resource Utilization')

    # Display the timetable graph
    timetable.display()

if __name__ == "__main__":
    main()
