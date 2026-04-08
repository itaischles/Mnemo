from datetime import datetime, timezone
from ai.client import call_gemini
from config import CARDS_PER_SECTION

_CARD_GEN_SYSTEM = """You are an expert educator creating spaced repetition flashcards.
Generate cards that test deep conceptual understanding, not surface recall.
Always return raw JSON only — no markdown, no code fences, no preamble."""

_REVIEW_QUESTION_SYSTEM = """You are an adaptive tutor rephrasing review questions based on the learner's mastery level.
Level 0: plain definition recall.
Level 1: explain the reasoning behind the concept.
Level 2: apply the concept to a concrete scenario.
Level 3: connect the concept to adjacent ideas.
Level 4: stress-test edge cases and hidden assumptions.
Always return raw JSON only — no markdown, no code fences, no preamble."""


def generate_cards_for_section(topic_name: str, section_text: str) -> list[dict]:
    """Call Gemini to generate up to CARDS_PER_SECTION cards for one Wikipedia section."""
    user_prompt = f"""Topic: {topic_name}
Source text: {section_text}
Mastery context: Generate cards appropriate for a complete beginner.
Generate up to {CARDS_PER_SECTION} cards.

Return a JSON array of card objects, each with:
- question (string)
- answer_key (string: a complete model answer)
- card_type (one of: "definition", "recall", "application", "comparison")
- difficulty_seed (string: the specific concept being tested)"""

    try:
        result = call_gemini(_CARD_GEN_SYSTEM, user_prompt)
        if isinstance(result, list):
            return result
        # Some models wrap in {"cards": [...]}
        if isinstance(result, dict):
            for key in ("cards", "flashcards", "items"):
                if key in result and isinstance(result[key], list):
                    return result[key]
        return []
    except (ValueError, RuntimeError):
        return []


def generate_review_question(card: dict, review_history: list) -> str:
    """Generate a fresh question variant adapted to the card's current mastery level."""
    missing = _extract_missing(review_history)
    misconception = _extract_misconception(review_history)

    user_prompt = f"""Concept: {card.get('difficulty_seed', '')}
Topic: {card.get('topic_name', '')}
Mastery level: {card.get('mastery_level', 0)}/4
Previous gaps identified: {missing}
Previous misconception: {misconception}

Generate a single question that:
- Matches the mastery level (see level guide in system prompt)
- Targets any previously identified gaps
- Is phrased differently from the original: {card.get('question', '')}

Return JSON: {{"question": "string"}}"""

    try:
        result = call_gemini(_REVIEW_QUESTION_SYSTEM, user_prompt)
        return result.get("question", card.get("question", ""))
    except (ValueError, RuntimeError):
        return card.get("question", "")


def generate_remediation_card(concept: str, misconception: str, topic_id: str) -> dict:
    """Create a targeted remediation card for a detected misconception."""
    user_prompt = f"""A learner has the following misconception:
Concept: {concept}
Misconception: {misconception}

Create ONE flashcard specifically designed to correct this misconception.
Return a single JSON object (not an array) with:
- question (string: directly targets the misconception)
- answer_key (string: correct explanation that explicitly addresses the misconception)
- card_type ("recall")
- difficulty_seed (string)"""

    system = (
        "You are an expert tutor creating targeted remediation flashcards. "
        "Always return raw JSON only — no markdown, no code fences, no preamble."
    )

    try:
        result = call_gemini(system, user_prompt)
        if isinstance(result, dict) and "question" in result:
            now = datetime.now(timezone.utc)
            result.update({
                "topic_id": topic_id,
                "mastery_level": 0,
                "is_remediation": True,
                "sm2": {
                    "ease_factor": 2.5,
                    "interval_days": 1,
                    "repetitions": 0,
                    "due_date": now,
                    "last_reviewed": None,
                },
            })
            return result
        return {}
    except (ValueError, RuntimeError):
        return {}


# ── helpers ───────────────────────────────────────────────────────────────────

def _extract_missing(review_history: list) -> list:
    missing = []
    for log in review_history:
        missing.extend(log.get("missing", []))
    return list(set(missing))


def _extract_misconception(review_history: list):
    for log in reversed(review_history):
        m = log.get("misconception")
        if m:
            return m
    return None
