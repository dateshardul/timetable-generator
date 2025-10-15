function submitForm() {
    var rooms = document.getElementById('rooms').value.split(', ');
    var times = document.getElementById('times').value.split(', ');
    var courses = document.getElementById('courses').value.split(', ');
    var instructors = document.getElementById('instructors').value.split(', ');

    fetch('http://127.0.0.1:3000/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({rooms, times, courses, instructors})
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('results').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    });
}