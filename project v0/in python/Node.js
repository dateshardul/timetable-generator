const express = require('express');
const bodyParser = require('body-parser');
const { Graph } = require('graphlib');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const random = require('random');

const app = express();

// Mock function to simulate strategic choices based on Nash Equilibrium
function nashEquilibrium(priorities) {
    const totalPriority = new Array(priorities[0].length).fill(0);
    for (const playerPriorities of priorities) {
        for (const [choice, priority] of playerPriorities.entries()) {
            totalPriority[choice] += priority;
        }
    }
    const maxPriority = Math.max(...totalPriority);
    const choicesWithMaxPriority = totalPriority.reduce((acc, priority, index) => {
        if (priority === maxPriority) {
            acc.push(index);
        }
        return acc;
    }, []);

    if (choicesWithMaxPriority.length === 1) {
        return choicesWithMaxPriority[0];
    } else {
        return random.choice(choicesWithMaxPriority);
    }
}

// Asynchronous function to create and initialize the timetable graph
async function createTimetableGraph(usersData) {
    const G = new Graph();
    const preferences = {};

    // Construct the graph with user inputs
    for (const userData of usersData) {
        const user = userData.user;
        for (const course of userData.courses) {
            const courseName = course.name;
            const preferredRoom = course.preferredRoom;
            const preferredTime = course.preferredTime;
            const key = `${courseName}-${preferredRoom}-${preferredTime}`;
            preferences[key] = preferences[key] || [];
            preferences[key].push(user);
            G.setNode(courseName, { type: 'course' });
            G.setNode(preferredRoom, { type: 'room' });
            G.setNode(preferredTime, { type: 'time' });
            G.setEdge(courseName, preferredTime, { room: preferredRoom, type: 'request' });
        }
    }

    // Apply game theory to resolve conflicts and produce a schedule
    const schedule = {};
    for (const [key, users] of Object.entries(preferences)) {
        const [course, room, time] = key.split('-');
        if (nashEquilibrium(users) === users[0]) { // Simplified example of conflict resolution
            schedule[course] = { room, time };
        }
    }

    await sleep(1000); // Simulate asynchronous behavior for processing
    return schedule;
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('index.html'); // Assuming you have an HTML file named index.html
});

app.post('/submit', async (req, res) => {
    try {
        const data = req.body;
        const schedule = await createTimetableGraph(data);
        res.json(schedule);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
