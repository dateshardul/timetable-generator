from flask import Flask, render_template, request, jsonify
import asyncio
import networkx as nx
import numpy as np
import json
import random

app = Flask(__name__)

# Mock function to simulate strategic choices based on Nash Equilibrium
def nash_equilibrium(priorities):
    # Randomly select an option from provided choices to simulate Nash Equilibrium for simplicity
    total_priority = [0] * len(priorities[0])
    for player_priorities in priorities:
        for choice, priority in enumerate(player_priorities):
            total_priority[choice] += priority
    
    # Find the choice with the highest total priority
    max_priority = max(total_priority)
    choices_with_max_priority = [i for i, priority in enumerate(total_priority) if priority == max_priority]
    
    # If there's only one choice with maximum priority, return it
    if len(choices_with_max_priority) == 1:
        return choices_with_max_priority[0]
    else:
        # If there are multiple choices with maximum priority, randomly choose one
        return random.choice(choices_with_max_priority)

# Asynchronous function to create and initialize the timetable graph
async def create_timetable_graph(users_data):
    G = nx.DiGraph()
    preferences = {}

    # Construct the graph with user inputs
    for user_data in users_data:
        user = user_data['user']
        for course in user_data['courses']:
            course_name = course['name']
            preferred_room = course['preferred_room']
            preferred_time = course['preferred_time']
            key = (course_name, preferred_room, preferred_time)
            if key not in preferences:
                preferences[key] = []
            preferences[key].append(user)
            preferences[(course_name, preferred_room, preferred_time)] = preferences.get((course_name, preferred_room, preferred_time), []) + [user]
            G.add_node(course_name, type='course')
            G.add_node(preferred_room, type='room')
            G.add_node(preferred_time, type='time')
            G.add_edge(course_name, preferred_time, room=preferred_room, type='request')

    # Apply game theory to resolve conflicts and produce a schedule
    schedule = {}
    for (course, room, time), users in preferences.items():
        if nash_equilibrium(users) == users[0]:  # Simplified example of conflict resolution
            schedule[course] = (room, time)

    await asyncio.sleep(1)  # Simulate asynchronous behavior for processing
    return schedule

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/submit', methods=['POST'])
async def submit():
    data = request.get_json()
    schedule = await create_timetable_graph(data)
    return jsonify(schedule)

if __name__ == "__main__":
    app.run(debug=True, threaded=True)
