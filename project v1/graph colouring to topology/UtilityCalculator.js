// Define a class for utility calculation
class UtilityCalculator {
    constructor() {
        // Initialize utility scores for each user
        this.utilityScores = {};
    }

    // Calculate utility scores based on the generated timetable and user preferences
    calculateUtility(generatedTimetable, userPreferences) {
        // Reset utility scores
        this.utilityScores = {};

        // Iterate over each user's preferences
        for (let userId in userPreferences) {
            const preferences = userPreferences[userId];
            // Calculate utility score for the current user
            const utilityScore = this.calculateUserUtility(generatedTimetable, preferences);
            // Store utility score for the current user
            this.utilityScores[userId] = utilityScore;
        }

        // Return utility scores for all users
        return this.utilityScores;
    }

    // Method to calculate utility score for a single user
    calculateUserUtility(generatedTimetable, preferences) {
        // Implement logic to calculate utility score for the user
        // For simplicity, let's assume utility score is based on the number of preferences accommodated
        let utilityScore = 0;
        if (generatedTimetable.includes(preferences)) {
            utilityScore += 1; // Increment utility score if user's preference is accommodated
        }
        return utilityScore;
    }
}
