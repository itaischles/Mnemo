from datetime import datetime, timezone
from typing import Optional
from google.cloud.firestore_v1 import FieldFilter
from database.firebase_client import get_db


# ── helpers ──────────────────────────────────────────────────────────────────

def _user_ref(uid: str):
    return get_db().collection("users").document(uid)


def _topics(uid: str):
    return _user_ref(uid).collection("topics")


def _cards(uid: str):
    return _user_ref(uid).collection("cards")


def _sessions(uid: str):
    return _user_ref(uid).collection("sessions")


def _review_logs(uid: str):
    return _user_ref(uid).collection("reviewLogs")


# ── Topics ────────────────────────────────────────────────────────────────────

def create_topic(uid: str, data: dict) -> dict:
    ref = _topics(uid).document()
    data["id"] = ref.id
    data["created_at"] = datetime.now(timezone.utc)
    data["last_refreshed"] = datetime.now(timezone.utc)
    data["card_count"] = 0
    ref.set(data)
    return data


def get_topics(uid: str) -> list[dict]:
    docs = _topics(uid).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_topic(uid: str, topic_id: str) -> Optional[dict]:
    doc = _topics(uid).document(topic_id).get()
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}


def update_topic(uid: str, topic_id: str, data: dict):
    _topics(uid).document(topic_id).update(data)


def delete_topic(uid: str, topic_id: str):
    _topics(uid).document(topic_id).delete()


# ── Cards ─────────────────────────────────────────────────────────────────────

def create_card(uid: str, data: dict) -> dict:
    ref = _cards(uid).document()
    data["id"] = ref.id
    data["created_at"] = datetime.now(timezone.utc)
    data["mastery_level"] = 0
    ref.set(data)
    return data


def get_cards_for_topic(uid: str, topic_id: str) -> list[dict]:
    docs = _cards(uid).where(filter=FieldFilter("topic_id", "==", topic_id)).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_card(uid: str, card_id: str) -> Optional[dict]:
    doc = _cards(uid).document(card_id).get()
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}


def update_card(uid: str, card_id: str, data: dict):
    _cards(uid).document(card_id).update(data)


def delete_cards_for_topic(uid: str, topic_id: str):
    docs = _cards(uid).where(filter=FieldFilter("topic_id", "==", topic_id)).stream()
    for doc in docs:
        doc.reference.delete()


def get_due_cards(uid: str) -> list[dict]:
    """Return all cards with a due_date that is a real timestamp (has been reviewed at least once or seeded)."""
    now = datetime.now(timezone.utc)
    docs = (
        _cards(uid)
        .where(filter=FieldFilter("sm2.due_date", "<=", now))
        .order_by("sm2.due_date")
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_new_cards(uid: str, limit: int) -> list[dict]:
    """Return cards that have never been reviewed (repetitions == 0)."""
    docs = (
        _cards(uid)
        .where(filter=FieldFilter("sm2.repetitions", "==", 0))
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Review Logs ───────────────────────────────────────────────────────────────

def create_review_log(uid: str, data: dict) -> dict:
    ref = _review_logs(uid).document()
    data["id"] = ref.id
    data["reviewed_at"] = datetime.now(timezone.utc)
    ref.set(data)
    return data


def get_review_logs_for_card(uid: str, card_id: str, limit: int = 10) -> list[dict]:
    docs = (
        _review_logs(uid)
        .where(filter=FieldFilter("card_id", "==", card_id))
        .order_by("reviewed_at")
        .limit_to_last(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_recent_review_logs(uid: str, limit: int = 50) -> list[dict]:
    docs = (
        _review_logs(uid)
        .order_by("reviewed_at")
        .limit_to_last(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_today_review_logs(uid: str) -> list[dict]:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    docs = (
        _review_logs(uid)
        .where(filter=FieldFilter("reviewed_at", ">=", today_start))
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Sessions ──────────────────────────────────────────────────────────────────

def create_session(uid: str, data: dict) -> dict:
    ref = _sessions(uid).document()
    data["id"] = ref.id
    ref.set(data)
    return data


def get_sessions(uid: str, limit: int = 30) -> list[dict]:
    docs = (
        _sessions(uid)
        .order_by("date")
        .limit_to_last(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def get_today_session(uid: str) -> Optional[dict]:
    today = datetime.now(timezone.utc).date().isoformat()
    docs = (
        _sessions(uid)
        .where(filter=FieldFilter("date", "==", today))
        .limit(1)
        .stream()
    )
    results = list(docs)
    if results:
        return {"id": results[0].id, **results[0].to_dict()}
    return None
