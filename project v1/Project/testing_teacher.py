import unittest
from teacher import Teacher

class TestTeacher(unittest.TestCase):
    def setUp(self):
        self.teacher = Teacher('T1', {'courses': ['Math', 'Science'], 'availability': ['9-11', '1-3']})

    def test_init(self):
        self.assertEqual(self.teacher.teacher_id, 'T1')
        self.assertEqual(self.teacher.preferences, {'courses': ['Math', 'Science'], 'availability': ['9-11', '1-3']})

    def test_select_courses(self):
        selected_courses = self.teacher.select_courses(['Math', 'English'])
        self.assertEqual(selected_courses, ['Math'])

    def test_indicate_availability(self):
        self.teacher.indicate_availability(['10-12', '2-4'])
        self.assertEqual(self.teacher.preferences['availability'], ['10-12', '2-4'])

    def test_negotiate(self):
        # As the negotiate method doesn't return anything or change any state, 
        # we can only test that it doesn't raise an exception when called.
        try:
            self.teacher.negotiate({'negotiation_details': 'details'})
        except Exception as e:
            self.fail(f'negotiate method raised an exception: {e}')

if __name__ == '__main__':
    unittest.main()