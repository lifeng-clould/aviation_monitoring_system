from __future__ import annotations

from datetime import date, datetime
from typing import Optional


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
)

_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
)


def _clean(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return None
    return text


def parse_datetime(value) -> Optional[datetime]:
    text = _clean(value)
    if not text:
        return None

    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    normalized = text.replace("/", "-")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue

    return None


def parse_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()

    text = _clean(value)
    if not text:
        return None

    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    normalized = text.replace("/", "-")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    try:
        return datetime.strptime(normalized, "%Y-%m-%d").date()
    except ValueError:
        return None


def normalize_date_str(value) -> Optional[str]:
    parsed = parse_date(value)
    return parsed.isoformat() if parsed else None
