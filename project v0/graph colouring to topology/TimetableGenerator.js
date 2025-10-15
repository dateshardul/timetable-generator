import { UtilityCalculator } from './UtilityCalculator.js';

// Define a class for timetable generation
class TimetableGenerator {
    constructor() {
        // Initialize an empty timetable grid
        this.timetable = [];
    }

    // Generate timetable based on user preferences
    generateTimetable(userPreferences,timetableGraph) {
        timetableGraph.resolveConflicts();

        // Iterate over each user's preferences
        for (let userId in userPreferences) {
            const preferences = userPreferences[userId];
            // Assign classes based on user preferences
            this.assignClasses(preferences);
        }

        // Calculate utility scores
        const utilityCalculator = new UtilityCalculator();
        const utilityScores = utilityCalculator.calculateUtility(this.timetable, userPreferences);

        // Evaluate the generated timetable and return
        return { timetable: this.timetable, utilityScores };
    }

    // Method to assign classes based on user preferences
    // Method to assign class to a time slot, room, and teacher
    // Method to assign class to a time slot, room, and teacher
    assignClass(courseId, preferredTimeSlots, preferredRooms, preferredTeachers) {
        // Convert preferences to priorities
        const timeSlotPriorities = preferredTimeSlots.map(slot => this.availableRooms[slot] ? 1 : 0);
        const roomPriorities = preferredRooms.map(room => this.availableRooms[room] ? 1 : 0);
        const teacherPriorities = preferredTeachers.map(teacher => this.availableTeachers[teacher] ? 1 : 0);

        // Calculate Nash equilibrium for each preference
        const timeSlotChoice = nashEquilibrium([timeSlotPriorities]);
        const roomChoice = nashEquilibrium([roomPriorities]);
        const teacherChoice = nashEquilibrium([teacherPriorities]);

        // Assign the class to the chosen time slot, room, and teacher
        this.timetable[timeSlotChoice][roomChoice] = courseId;
        this.availableRooms[roomChoice][timeSlotChoice] = false;
        this.availableTeachers[teacherChoice][timeSlotChoice] = false;
        console.log(`Assigned course ${courseId} to Time Slot ${timeSlotChoice}, Room ${roomChoice}, Teacher ${teacherChoice}`);
    }
}