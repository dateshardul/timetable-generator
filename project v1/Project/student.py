# class Student:
#     def __init__(self, student_id, preferences):
#         self.student_id = student_id
#         self.preferences = preferences  # Dictionary of course preferences and class timings

#     def select_courses(self, courses):
#         # Method for course selection
#         selected_courses = []
#         for course in courses:
#             # Check if course is in student's preferences
#             if course in self.preferences['courses']:
#                 selected_courses.append(course)
#         return selected_courses

#     def select_courses(self):
#         # Simulate students selecting courses based on preferences
#         selected_courses = self.select_courses(self.preferences['courses'])
#         # For demonstration purposes, we'll simply print the selected courses
#         print(f"Student {self.student_id} selected courses: {selected_courses}")

#     def indicate_preferences(self, timings):
#         # Method for indicating preferred class timings
#         self.preferences['timings'] = timings

#     def prioritize_courses(self, course_priority):
#         # Method for prioritizing certain courses over others
#         self.preferences['priority'] = course_priority
    
#     def calculate_payoff(self, timetable):
#         # Method to calculate student payoff based on the generated timetable
#         student_courses = timetable.get_student_courses(self.student_id)
#         total_courses = len(self.preferences['courses'])
#         if total_courses == 0:
#             return 0
#         return len(student_courses) / total_courses  # Simple ratio of selected courses to total preferences



class Student:
    def __init__(self, student_id, preferences):
        self.student_id = student_id
        self.preferences = preferences  # Dictionary of course preferences and class timings
        self.enrolled_courses = []  # List to store enrolled courses
        self.negotiated_timings = {}  # Dictionary to store negotiated timings for enrolled courses

    def negotiate_timings(self, courses, available_timings):
        # Method to negotiate class timings for enrolled courses based on available timings
        # Calculate payoffs for each available timing
        timing_payoffs = {}
        for timing in available_timings:
            self.negotiated_timings = {course: timing for course in courses}
            timing_payoffs[timing] = self.calculate_payoff()[1]  # Use satisfaction payoff as the negotiation criteria
        
        # Sort timings based on payoffs in descending order
        sorted_timings = sorted(timing_payoffs.items(), key=lambda x: x[1], reverse=True)
        
        # Select the timing with the highest payoff for negotiation
        selected_timing = sorted_timings[0][0]
        
        # Negotiate all enrolled courses to the selected timing
        self.negotiated_timings = {course: selected_timing for course in courses}
    
    def calculate_payoff(self):
        # Placeholder values for preferences and enrollments
        total_preferred_courses = len(self.preferences['courses'])
        enrolled_preferred_courses = 0  # Placeholder value
        total_preferred_class_timings = len(self.preferences['class_timings'])
        accommodated_preferred_class_timings = 0  # Placeholder value

        # Placeholder values for academic performance factors
        spacing_of_classes = 0.8  # Placeholder value
        study_time = 0.9  # Placeholder value
        overlap_penalty = 0.7  # Placeholder value

        # Placeholder calculation for course availability payoff
        course_availability_payoff = enrolled_preferred_courses / total_preferred_courses

        # Placeholder calculation for satisfaction payoff
        satisfaction_payoff = accommodated_preferred_class_timings / total_preferred_class_timings

        # Placeholder calculation for academic performance payoff
        academic_performance_payoff = (0.4 * spacing_of_classes) + (0.3 * study_time) + (0.3 * overlap_penalty)

        return course_availability_payoff, satisfaction_payoff, academic_performance_payoff
