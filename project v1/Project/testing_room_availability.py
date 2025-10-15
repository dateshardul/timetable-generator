import unittest
from room_availability import RoomAvailability

class TestRoomAvailability(unittest.TestCase):
    def setUp(self):
        self.rooms = {
            'Room1': {'capacity': 50},
            'Room2': {'capacity': 30},
            'Room3': {'capacity': 20},
        }
        self.ra = RoomAvailability(self.rooms)

    def test_allocate_room_with_preferred_room(self):
        course = {'students': 40}
        preferred_room = 'Room1'
        result = self.ra.allocate_room(course, preferred_room)
        self.assertEqual(result, 'Room1')

    def test_allocate_room_without_preferred_room(self):
        course = {'students': 40}
        result = self.ra.allocate_room(course)
        self.assertIn(result, ['Room1', 'Room2'])

    def test_allocate_room_no_suitable_room(self):
        course = {'students': 60}
        result = self.ra.allocate_room(course)
        self.assertIsNone(result)

if __name__ == '__main__':
    unittest.main()