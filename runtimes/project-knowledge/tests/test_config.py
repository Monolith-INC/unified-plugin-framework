import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / 'src'))

from upf_knowledge.config import ConfigInput, StoreSelection, select_store


class SelectStoreTests(unittest.TestCase):
    def test_explicit_root_overrides_configuration_for_this_invocation(self):
        value = ConfigInput('/p', '/p/k', None, None)
        before = value

        self.assertEqual(select_store(value), StoreSelection('/p/k', 'explicit'))
        self.assertEqual(value, before)

    def test_matching_project_and_review_roots_select_project_root(self):
        value = ConfigInput('/p', None, '/p/k', '/p/k')
        before = value

        self.assertEqual(select_store(value), StoreSelection('/p/k', 'project'))
        self.assertEqual(value, before)

    def test_review_root_is_read_only_compatibility_fallback(self):
        value = ConfigInput('/p', None, None, '/p/old')
        before = value

        self.assertEqual(select_store(value), StoreSelection('/p/old', 'review'))
        self.assertEqual(value, before)

    def test_different_project_and_review_roots_conflict(self):
        value = ConfigInput('/p', None, '/p/a', '/p/b')
        before = value

        result = select_store(value)

        self.assertEqual(result.code, 'conflicting_roots')
        self.assertEqual(value, before)

    def test_missing_roots_return_error(self):
        value = ConfigInput('/p', None, None, None)
        before = value

        result = select_store(value)

        self.assertEqual(result.code, 'missing_root')
        self.assertEqual(value, before)


if __name__ == '__main__':
    unittest.main()
