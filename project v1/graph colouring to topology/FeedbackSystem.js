// Define a class for enhanced feedback and adaptation
class FeedbackSystem {
    constructor() {
        // Initialize feedback data structure
        this.feedbackData = {};
    }

    // Provide enhanced feedback to users based on the generated timetable and utility scores
    provideFeedback(generatedTimetable, utilityScores, userPreferences) {
        // Prepare feedback for each user
        for (let userId in utilityScores) {
            const utilityScore = utilityScores[userId];
            const preferences = userPreferences[userId];
            // Provide enhanced feedback to the user based on their utility score, generated timetable, and preferences
            const feedback = this.generateFeedbackMessage(utilityScore, generatedTimetable, preferences);
            // Store feedback for the user
            this.feedbackData[userId] = feedback;
        }

        // Return feedback data for all users
        return this.feedbackData;
    }

    // Method to generate enhanced feedback message for a user
    generateFeedbackMessage(utilityScore, generatedTimetable, preferences) {
        // Generate detailed feedback message based on utility score, generated timetable, and preferences
        let feedbackMessage = `Your utility score is ${utilityScore}.`;
        // Provide insights on how preferences influenced the generated timetable
        feedbackMessage += "\n\n";
        feedbackMessage += "Generated Timetable:";
        feedbackMessage += "\n";
        feedbackMessage += JSON.stringify(generatedTimetable);
        feedbackMessage += "\n\n";
        feedbackMessage += "Your Preferences:";
        feedbackMessage += "\n";
        feedbackMessage += JSON.stringify(preferences);
        // Offer suggestions for adjusting preferences based on the feedback received
        feedbackMessage += "\n\n";
        feedbackMessage += "Suggestions for Preference Adjustment:";
        feedbackMessage += "\n";
        feedbackMessage += this.suggestPreferenceAdjustment(generatedTimetable, preferences);
        return feedbackMessage;
    }

    // Method to suggest preference adjustments based on the generated timetable and user preferences
    suggestPreferenceAdjustment(generatedTimetable, preferences) {
        let suggestion = "";

        // Identify classes with high demand or high conflict
        const classDemand = new Map();
        const classConflict = new Map();

        for (let classData of generatedTimetable) {
            const courseId = classData.courseId;
            if (!classDemand.has(courseId)) {
                classDemand.set(courseId, 0);
            }
            classDemand.set(courseId, classDemand.get(courseId) + 1);
        }

        for (let [courseId, demand] of classDemand.entries()) {
            if (demand > 1) {
                classConflict.set(courseId, demand);
            }
        }

        // Suggest preference adjustments for classes with high demand or high conflict
        for (let [courseId, demand] of classConflict.entries()) {
            suggestion += `Class ${courseId} has high demand (${demand} occurrences). Consider adjusting your preferences for this class.\n`;
        }

        // Highlight potential trade-offs
        suggestion += "\n";
        suggestion += "Consider potential trade-offs such as selecting alternative time slots or rooms to avoid conflicts.\n";

        return suggestion;
    }
}