# class Teacher:
#     def __init__(self, teacher_id, preferences):
#         self.teacher_id = teacher_id
#         self.preferences = preferences  # Dictionary of course preferences and class timings

#     def select_courses(self, courses):
#         # Method for course selection
#         selected_courses = []
#         for course in courses:
#             # Check if course is in teacher's preferences
#             if course in self.preferences['courses']:
#                 selected_courses.append(course)
#         return selected_courses

#     def indicate_availability(self, timings):
#         # Method for indicating availability and preferred class timings
#         self.preferences['availability'] = timings

#     def negotiate(self, negotiation_details):
#         # Method for negotiation with administrators or colleagues
#         pass

#     def calculate_payoff(self, timetable):
#         # Method to calculate teacher payoff based on the generated timetable
#         teacher_courses = timetable.get_teacher_courses(self.teacher_id)
#         total_courses = len(self.preferences['courses'])
#         if total_courses == 0:
#             return 0
#         return len(teacher_courses) / total_courses  # Simple ratio of assigned courses to total preferences
    



class Teacher:
    def __init__(self, teacher_id, preferences):
        self.teacher_id = teacher_id
        self.preferences = preferences  # Dictionary of course preferences and class timings

    def negotiate_timings(self, courses, available_timings):
        # Method to negotiate class timings for assigned courses based on available timings
        # Calculate payoffs for each available timing
        timing_payoffs = {}
        for timing in available_timings:
            self.negotiated_timings = {course: timing for course in courses}
            timing_payoffs[timing] = self.calculate_payoff()[2]  # Use satisfaction payoff as the negotiation criteria
        
        # Sort timings based on payoffs in descending order
        sorted_timings = sorted(timing_payoffs.items(), key=lambda x: x[1], reverse=True)
        
        # Select the timing with the highest payoff for negotiation
        selected_timing = sorted_timings[0][0]
        
        # Negotiate all assigned courses to the selected timing
        self.negotiated_timings = {course: selected_timing for course in courses}

    def calculate_payoff(self):
        # Placeholder values for preferences and assignments
        total_assigned_courses = 0  # Placeholder value
        matching_courses = 0  # Placeholder value
        actual_workload = 0  # Placeholder value
        desired_workload = 0  # Placeholder value

        # Placeholder values for professional satisfaction factors
        teaching_assignments = 0.8  # Placeholder value
        class_timings = 0.9  # Placeholder value
        workload = 0.7  # Placeholder value

        # Placeholder calculation for teaching preferences payoff
        teaching_preferences_payoff = matching_courses / total_assigned_courses if total_assigned_courses != 0 else 0

        # Placeholder calculation for workload balance payoff
        workload_balance_payoff = actual_workload / desired_workload if desired_workload != 0 else 0

        # Placeholder calculation for professional satisfaction payoff
        professional_satisfaction_payoff = (0.4 * teaching_assignments) + (0.3 * class_timings) + (0.3 * workload)

        return teaching_preferences_payoff, workload_balance_payoff, professional_satisfaction_payoff