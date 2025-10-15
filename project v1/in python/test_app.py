# FILEPATH: /c:/Users/shard/OneDrive/Desktop/IITJ/SY/Sem 4/DSA/actual project/in python/test_app.py
import pytest
import asyncio
from flask import Flask, jsonify
from flask.testing import FlaskClient
from app import app, nash_equilibrium, create_timetable_graph

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_nash_equilibrium():
    assert nash_equilibrium([[1, 2], [2, 1]]) == 1
    assert nash_equilibrium([[3, 2], [2, 3]]) == 0
    assert nash_equilibrium([[1, 2, 3], [2, 3, 1], [3, 1, 2]]) in [0, 1, 2]

@pytest.mark.asyncio

def test_create_timetable_graph():
    users_data = [
        {
            'user': 'user1',
            'courses': [
                {
                    'name': 'course1',
                    'preferred_room': 'room1',
                    'preferred_time': 'time1'
                }
            ]
        },
        {
            'user': 'user2',
            'courses': [
                {
                    'name': 'course2',
                    'preferred_room': 'room2',
                    'preferred_time': 'time2'
                }
            ]
        }
    ]
    schedule = asyncio.run(create_timetable_graph(users_data))
    assert schedule == {'course1': ('room1', 'time1'), 'course2': ('room2', 'time2')}
def test_index(client: FlaskClient):
    response = client.get('/')
    assert response.status_code == 200

def test_submit(client: FlaskClient):
    data = [
        {
            'user': 'user1',
            'courses': [
                {
                    'name': 'course1',
                    'preferred_room': 'room1',
                    'preferred_time': 'time1'
                }
            ]
        },
        {
            'user': 'user2',
            'courses': [
                {
                    'name': 'course2',
                    'preferred_room': 'room2',
                    'preferred_time': 'time2'
                }
            ]
        }
    ]
    response = client.post('/submit', json=data)
    assert response.status_code == 200
    assert response.get_json() == {'course1': ['room1', 'time1'], 'course2': ['room2', 'time2']}