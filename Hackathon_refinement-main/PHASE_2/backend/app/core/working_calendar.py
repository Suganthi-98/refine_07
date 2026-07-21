"""
Working-day calendar utilities.

Scope: the three fixed-date Indian national/gazetted holidays that apply
company-wide with no opt-out --
    - Republic Day     (26 Jan)
    - Independence Day (15 Aug)
    - Gandhi Jayanti    (2 Oct)

Deliberately excludes restricted/festival holidays (Diwali, Holi, Eid, etc.).
Per Bosch policy those are optional -- employees can choose to work or take
leave -- so they don't reliably shift the team's committed capacity the way
a mandatory national holiday does. If that policy ever changes, add the
movable dates to a per-year override rather than hardcoding them here (they
don't fall on fixed month/day pairs).

Weekends are NOT treated specially by this module's `count_holidays_between`
helper on purpose -- see the usage note in forecast_engine.py for why: the
forecast's velocity is computed empirically from historical sprints that
already contained their own recurring Saturdays/Sundays, so that weekly
pattern is implicitly priced into the day-rate already. Only irregular,
non-recurring non-working days (like a specific year's Independence Day)
need to be added explicitly on top.
"""
from datetime import date, datetime, timedelta
from typing import Union
import bisect

DateLike = Union[date, datetime]

# (month, day) pairs -- fixed every year, unlike movable festival holidays,
# so they can be generated without a lunar/religious calendar.
FIXED_NATIONAL_HOLIDAYS = [
    (1, 26),   # Republic Day
    (8, 15),   # Independence Day
    (10, 2),   # Gandhi Jayanti
]


def _as_date(d: DateLike) -> date:
    return d.date() if isinstance(d, datetime) else d


def national_holidays_for_year(year: int) -> set:
    return {date(year, m, d) for m, d in FIXED_NATIONAL_HOLIDAYS}


def is_weekend(d: DateLike) -> bool:
    return _as_date(d).weekday() >= 5  # Saturday=5, Sunday=6


def is_national_holiday(d: DateLike) -> bool:
    d = _as_date(d)
    return d in national_holidays_for_year(d.year)


def is_working_day(d: DateLike) -> bool:
    """True if this date is a normal working day: not a weekend, not a
    mandatory national holiday."""
    return not is_weekend(d) and not is_national_holiday(d)


def count_holidays_between(start: DateLike, end: DateLike) -> int:
    """Count mandatory national holidays strictly within [start, end) that
    land on what would otherwise have been a working day.

    A holiday that falls on a Saturday/Sunday costs the schedule nothing
    extra -- that day was already non-working -- so it's excluded here to
    avoid padding the forecast for a holiday nobody would have worked
    anyway.
    """
    start, end = _as_date(start), _as_date(end)
    if end <= start:
        return 0
    count = 0
    cursor = start
    while cursor < end:
        if is_national_holiday(cursor) and not is_weekend(cursor):
            count += 1
        cursor += timedelta(days=1)
    return count


class HolidayIndex:
    """Precomputed, sorted list of working-day national holidays covering a
    date range, queried via bisect. Building this once and reusing it is ~1000x
    faster than re-walking day-by-day, which matters for Monte Carlo callers
    that recompute a holiday-padded finish date on every one of ~10,000
    simulation draws."""

    __slots__ = ("_sorted_dates",)

    def __init__(self, range_start: DateLike, range_end: DateLike):
        range_start, range_end = _as_date(range_start), _as_date(range_end)
        dates = []
        cursor = range_start
        while cursor <= range_end:
            if is_national_holiday(cursor) and not is_weekend(cursor):
                dates.append(cursor)
            cursor += timedelta(days=1)
        self._sorted_dates = dates

    def count_between(self, start: DateLike, end: DateLike) -> int:
        """Count indexed holidays within [start, end)."""
        start, end = _as_date(start), _as_date(end)
        if end <= start:
            return 0
        lo = bisect.bisect_left(self._sorted_dates, start)
        hi = bisect.bisect_left(self._sorted_dates, end)
        return max(0, hi - lo)

    @classmethod
    def covering(cls, anchor: DateLike, padding_years: int = 2) -> "HolidayIndex":
        """Build an index spanning from one year before `anchor` to
        `padding_years` after, generous enough to cover any realistic
        remaining-schedule window without needing to be rebuilt mid-loop."""
        anchor = _as_date(anchor)
        start = date(anchor.year - 1, 1, 1)
        end = date(anchor.year + padding_years, 12, 31)
        return cls(start, end)
