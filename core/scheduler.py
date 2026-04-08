from datetime import datetime, timezone
from config import MAX_CARDS_PER_DAY, NEW_CARDS_PER_DAY
from database.crud import get_due_cards, get_new_cards


def get_daily_queue(uid: str, max_cards: int = MAX_CARDS_PER_DAY, new_cards_per_day: int = NEW_CARDS_PER_DAY) -> list[dict]:
    """
    Build today's review queue. Priority order:
      1. Overdue cards (due_date < today)
      2. Cards due today
      3. New cards (never reviewed), capped at new_cards_per_day
    Total capped at max_cards.
    """
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    due_cards = get_due_cards(uid)  # already ordered by due_date ASC, includes overdue + today

    overdue = [c for c in due_cards if _to_datetime(c["sm2"]["due_date"]) < today]
    due_today = [c for c in due_cards if _to_datetime(c["sm2"]["due_date"]) >= today]

    # New cards = repetitions == 0 but NOT already in due queue
    due_ids = {c["id"] for c in due_cards}
    new_cards_raw = get_new_cards(uid, limit=new_cards_per_day * 3)
    new_cards = [c for c in new_cards_raw if c["id"] not in due_ids][:new_cards_per_day]

    queue = overdue + due_today + new_cards

    # run_daily_refresh hook (v1.1: push notifications go here)
    return queue[:max_cards]


def run_daily_refresh(uid: str) -> list[dict]:
    queue = get_daily_queue(uid)
    # TODO v1.1: send_push_notification(uid, len(queue))
    return queue


def _to_datetime(value) -> datetime:
    """Normalize Firestore Timestamp or datetime to UTC-aware datetime."""
    if hasattr(value, "replace"):
        # already a datetime
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    # Firestore DatetimeWithNanoseconds / Timestamp
    return value.astimezone(timezone.utc)
