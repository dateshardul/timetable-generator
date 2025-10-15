document.getElementById('preferences-form').addEventListener('submit', function(event) {
    // Prevent the form from being submitted to the server
    event.preventDefault();

    // Get the selected options
    var userid = document.getElementById('userid').value;
    var subject = document.getElementById('subject').value;
    var classroom = document.getElementById('classroom').value;
    var timeslot = document.getElementById('timeslot').value;

    // Check if any preference is set to "Please select", if so, set it to NULL
    userid = (userid === "Please select") ? "NULL" : userid;
    subject = (subject === "Please select") ? "NULL" : subject;
    classroom = (classroom === "Please select") ? "NULL" : classroom;
    timeslot = (timeslot === "Please select") ? "NULL" : timeslot;

    // Create a new table element
    var table = document.createElement('table');

    // Create rows for each selection and append them to the table
    table.innerHTML = '<tr><th>UserID</th><td>' + userid + '</td></tr>' +
                      '<tr><th>Preferred Subject</th><td>' + subject + '</td></tr>' +
                      '<tr><th>Preferred Classroom</th><td>' + classroom + '</td></tr>' +
                      '<tr><th>Preferred Timeslot</th><td>' + timeslot + '</td></tr>';

    // Append the table to the body of the document
    document.body.appendChild(table);
});