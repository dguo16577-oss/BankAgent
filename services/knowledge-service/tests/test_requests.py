import unittest
from pydantic import ValidationError
from app.main import SearchRequest


class RequestBoundaryTests(unittest.TestCase):
    def test_accepts_iso_timestamp_with_timezone(self):
        request = SearchRequest.model_validate({'query': '转账', 'effective_at': '2026-10-01T00:00:00+08:00'})
        self.assertIsNotNone(request.effective_at.tzinfo)

    def test_rejects_ambiguous_naive_timestamp(self):
        with self.assertRaises(ValidationError):
            SearchRequest.model_validate({'query': '转账', 'effective_at': '2026-10-01T00:00:00'})

    def test_rejects_numeric_time_and_arbitrary_url(self):
        for extra in ({'effective_at': 123456}, {'url': 'https://attacker.invalid'}):
            with self.assertRaises(ValidationError):
                SearchRequest.model_validate({'query': 'test', **extra})
