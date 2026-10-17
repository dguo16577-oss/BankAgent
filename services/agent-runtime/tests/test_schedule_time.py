from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from app.agent_v2.schedule_time import validate_scheduled_at


class ScheduleTimeTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 7, 12, 0, tzinfo=timezone(timedelta(hours=8)))
        self.horizon = timedelta(days=365)

    def test_accepts_explicit_offset_and_horizon_boundary(self):
        self.assertEqual(
            validate_scheduled_at("2026-10-08T15:00:00+08:00", now=self.now,
                                  max_horizon=self.horizon).hour,
            15,
        )
        boundary = (self.now + self.horizon).isoformat()
        self.assertEqual(validate_scheduled_at(boundary, now=self.now,
                                               max_horizon=self.horizon), self.now + self.horizon)
        self.assertEqual(
            validate_scheduled_at("2026-10-07T04:30:00Z", now=self.now,
                                  max_horizon=self.horizon).utcoffset(), timedelta(0))

    def test_rejects_naive_past_and_excessive_timestamps(self):
        for value in (
            "2026-10-08T15:00:00",
            "2026-10-07T12:00:00+08:00",
            "2026-10-06T15:00:00+08:00",
            "2026-10-07T03:59:59Z",
            (self.now + self.horizon + timedelta(seconds=1)).isoformat(),
            "2026-10-08 15:00:00+08:00",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_scheduled_at(value, now=self.now, max_horizon=self.horizon)

    def test_clock_and_horizon_must_be_valid(self):
        with self.assertRaisesRegex(ValueError, "clock"):
            validate_scheduled_at("2026-10-08T15:00:00+08:00",
                                  now=self.now.replace(tzinfo=None), max_horizon=self.horizon)
        with self.assertRaisesRegex(ValueError, "horizon"):
            validate_scheduled_at("2026-10-08T15:00:00+08:00",
                                  now=self.now, max_horizon=timedelta(0))


if __name__ == "__main__":
    unittest.main()
