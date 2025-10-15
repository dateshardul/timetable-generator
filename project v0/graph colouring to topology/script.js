// Function to submit user preferences
const submitPreferences = async (userId, preferences) => {
    try {
        const response = await fetch('/submit-preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, ...preferences })
        });
        if (!response.ok) {
            throw new Error('Failed to submit preferences');
        }
        const responseData = await response.json();
        console.log(responseData);
    } catch (error) {
        console.error(error.message);
    }
};

document.getElementById('preferencesForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const userId = document.getElementById('userId').value;
    const preferences = {
        preferredClassTimes: document.getElementById('preferredClassTimes').value,
        desiredBreaks: document.getElementById('desiredBreaks').value,
        nonOverlappingCourses: document.getElementById('nonOverlappingCourses').value,
    };
    await submitPreferences(userId, preferences);
});

// Fetch feedback data from the backend
const fetchFeedbackData = async () => {
    try {
        const response = await fetch('/submit-preferences');
        if (!response.ok) {
            throw new Error('Failed to fetch feedback data');
        }
        const feedbackData = await response.json();
        displayFeedback(feedbackData);
    } catch (error) {
        console.error(error.message);
    }
};

// Display feedback and suggestions
const displayFeedback = (feedbackData) => {
    const feedbackContainer = document.getElementById('feedback');
    const suggestionsContainer = document.getElementById('suggestions');

    for (let userId in feedbackData) {
        const feedback = feedbackData[userId];
        const feedbackElement = document.createElement('div');
        feedbackElement.textContent = `Feedback for User ${userId}: ${feedback}`;
        feedbackContainer.appendChild(feedbackElement);
    }

    // Hide suggestions if no feedback available
    if (Object.keys(feedbackData).length === 0) {
        suggestionsContainer.style.display = 'none';
    }
};

// Adjust preferences button click event
document.getElementById('adjustPreferencesBtn').addEventListener('click', () => {
    // Redirect to a page where users can adjust their preferences
    window.location.href = 'adjustPreferences.html';
});

// Fetch feedback data when the page loads
window.onload = () => {
    fetchFeedbackData();
};
