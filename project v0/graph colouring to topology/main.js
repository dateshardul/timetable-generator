// Import required modules
import express from 'express';
import { json } from 'body-parser';
import { TimetableGraph } from './TimetableGraph.js';
import { TimetableGenerator } from './TimetableGenerator.js';

// Create an Express application
const app = express();
const port = 3000;

// Use bodyParser middleware to parse JSON requests
app.use(json());

// Data structure to store user inputs
let userPreferences = {};

// Define endpoint for users to submit preferences
// Define endpoint for users to submit preferences
app.post('/submit-preferences', (req, res) => {
    // Assuming each user sends their preferences in the request body
    const userId = req.body.userId;
    const preferences = {
        preferredClassTimes: req.body.preferredClassTimes, // e.g., ['9:00-10:00', '14:00-15:00']
        desiredBreaks: req.body.desiredBreaks, // e.g., ['12:00-13:00']
        nonOverlappingCourses: req.body.nonOverlappingCourses, // e.g., ['Math', 'Physics']
    };

    // Validate the preferences here (e.g., check that times are valid, courses don't overlap, etc.)

    
    // Store the preferences in the data structure
    userPreferences[userId] = preferences;

    console.log(`Preferences submitted by user ${userId}:`, preferences);

    res.status(200).send('Preferences submitted successfully');

    // You can also call the timetable generation function here if needed
    const generatedTimetable = generator.generateTimetable(userPreferences, timetable);
    const feedbackData = feedbackSystem.provideFeedback(generatedTimetable, utilityScores, userPreferences);
    res.json(feedbackData);

});

// Insert your new endpoint here
app.get('/submit-preferences', (req, res) => {
    // You can fetch feedback data from a database or another data source here
    res.json(feedbackData);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});