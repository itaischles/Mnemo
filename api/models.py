from pydantic import BaseModel, Field
from typing import Optional


# ── Topics ────────────────────────────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str
    description: str = ""
    wikipedia_slug: str
    color: str = "#4ECDC4"


class TopicResponse(BaseModel):
    id: str
    name: str
    description: str = ""
    wikipedia_slug: str
    card_count: int = 0
    color: str = "#4ECDC4"


# ── Session ───────────────────────────────────────────────────────────────────

class AnswerSubmit(BaseModel):
    card_id: str
    user_answer: str


class AnswerResponse(BaseModel):
    score: int
    feedback: str
    understood: list[str] = []
    missing: list[str] = []
    misconception: Optional[str] = None
    next_review_in_days: int
    mastery_level: int


class SessionCard(BaseModel):
    id: str
    topic_id: str
    topic_name: str = ""
    question: str
    card_type: str
    mastery_level: int
    difficulty_seed: str = ""


class SessionSummaryResponse(BaseModel):
    cards_reviewed: int
    avg_score: float
    summary: str
    weak_areas: list[str] = []
    strength_areas: list[str] = []
    recommended_focus: str = ""


# ── Stats ─────────────────────────────────────────────────────────────────────

class TopicStats(BaseModel):
    topic_id: str
    total_cards: int
    avg_mastery: float
    cards_by_type: dict
    cards_by_mastery: dict
