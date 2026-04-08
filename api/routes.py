import logging
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from api.auth import get_current_uid
from api.models import (
    TopicCreate, AnswerSubmit, AnswerResponse, SessionCard,
    SessionSummaryResponse, TopicStats,
)
from database import crud
from core.scheduler import get_daily_queue
from core.sm2 import update_sm2, compute_mastery_level
from core.content_fetcher import fetch_wikipedia_sections
from ai.question_generator import (
    generate_cards_for_section,
    generate_review_question,
    generate_remediation_card,
)
from ai.answer_grader import grade_answer
from ai.session_summarizer import summarize_session
from config import MISCONCEPTION_RESOLVE_STREAK

router = APIRouter()


# ── Topics ────────────────────────────────────────────────────────────────────

@router.post("/topics", status_code=201)
async def add_topic(
    body: TopicCreate,
    background_tasks: BackgroundTasks,
    uid: str = Depends(get_current_uid),
):
    topic_data = body.model_dump()
    topic = crud.create_topic(uid, topic_data)
    background_tasks.add_task(_generate_cards_for_topic, uid, topic)
    return topic


@router.get("/topics")
async def list_topics(uid: str = Depends(get_current_uid)):
    topics = crud.get_topics(uid)
    result = []
    for topic in topics:
        cards = crud.get_cards_for_topic(uid, topic["id"])
        total = len(cards)
        avg_mastery = (
            round(sum(c.get("mastery_level", 0) for c in cards) / total, 2) if total else 0.0
        )
        result.append({**topic, "avg_mastery": avg_mastery})
    return result


@router.post("/topics/{topic_id}/refresh", status_code=202)
async def refresh_topic(
    topic_id: str,
    background_tasks: BackgroundTasks,
    uid: str = Depends(get_current_uid),
):
    topic = crud.get_topic(uid, topic_id)
    if not topic:
        raise HTTPException(404, "Topic not found")
    # Delete old cards and regenerate
    crud.delete_cards_for_topic(uid, topic_id)
    crud.update_topic(uid, topic_id, {"card_count": 0, "last_refreshed": datetime.now(timezone.utc)})
    background_tasks.add_task(_generate_cards_for_topic, uid, topic)
    return {"status": "refresh_started"}


@router.get("/topics/{topic_id}/stats")
async def topic_stats(topic_id: str, uid: str = Depends(get_current_uid)):
    topic = crud.get_topic(uid, topic_id)
    if not topic:
        raise HTTPException(404, "Topic not found")
    cards = crud.get_cards_for_topic(uid, topic_id)
    total = len(cards)
    avg_mastery = round(sum(c.get("mastery_level", 0) for c in cards) / total, 2) if total else 0.0
    by_type: dict = {}
    by_mastery: dict = {str(i): 0 for i in range(5)}
    for card in cards:
        ct = card.get("card_type", "unknown")
        by_type[ct] = by_type.get(ct, 0) + 1
        ml = str(card.get("mastery_level", 0))
        by_mastery[ml] = by_mastery.get(ml, 0) + 1
    return TopicStats(
        topic_id=topic_id,
        total_cards=total,
        avg_mastery=avg_mastery,
        cards_by_type=by_type,
        cards_by_mastery=by_mastery,
    )


# ── Session ───────────────────────────────────────────────────────────────────

@router.get("/session/today")
async def get_today_session(uid: str = Depends(get_current_uid)):
    queue = get_daily_queue(uid)
    topics_cache: dict[str, str] = {}
    cards_out: list[dict] = []

    for card in queue:
        topic_id = card.get("topic_id", "")
        if topic_id not in topics_cache:
            topic = crud.get_topic(uid, topic_id)
            topics_cache[topic_id] = topic["name"] if topic else ""

        topic_name = topics_cache[topic_id]

        # Fetch recent review history for dynamic question generation
        history = crud.get_review_logs_for_card(uid, card["id"], limit=5)

        # Generate a fresh question variant adapted to mastery level
        dynamic_question = generate_review_question(
            {**card, "topic_name": topic_name},
            history,
        )

        cards_out.append({
            "id": card["id"],
            "topic_id": topic_id,
            "topic_name": topic_name,
            "question": dynamic_question,
            "card_type": card.get("card_type", "recall"),
            "mastery_level": card.get("mastery_level", 0),
            "difficulty_seed": card.get("difficulty_seed", ""),
        })

    return {"cards": cards_out, "total": len(cards_out)}


@router.post("/session/answer")
async def submit_answer(
    body: AnswerSubmit,
    background_tasks: BackgroundTasks,
    uid: str = Depends(get_current_uid),
):
    card = crud.get_card(uid, body.card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    # Grade the answer
    grading = grade_answer(
        question=card.get("question", ""),
        answer_key=card.get("answer_key", ""),
        user_answer=body.user_answer,
        mastery_level=card.get("mastery_level", 0),
    )
    score = grading["score"]

    # Update SM-2
    new_sm2 = update_sm2(card, score)
    new_mastery = compute_mastery_level(new_sm2["interval_days"])

    crud.update_card(uid, body.card_id, {
        "sm2": new_sm2,
        "mastery_level": new_mastery,
    })

    # Save review log
    topic = crud.get_topic(uid, card.get("topic_id", ""))
    log_data = {
        "card_id": body.card_id,
        "topic_id": card.get("topic_id", ""),
        "user_answer": body.user_answer,
        "question": card.get("question", ""),
        "ai_score": score,
        "ai_feedback": grading["feedback"],
        "understood": grading["understood"],
        "missing": grading["missing"],
        "misconception": grading["misconception"],
        "interval_after": new_sm2["interval_days"],
    }
    crud.create_review_log(uid, log_data)

    # Handle misconception → spawn remediation card in background
    if grading["misconception"]:
        background_tasks.add_task(
            _maybe_insert_remediation,
            uid,
            card,
            grading["misconception"],
        )

    return AnswerResponse(
        score=score,
        feedback=grading["feedback"],
        understood=grading["understood"],
        missing=grading["missing"],
        misconception=grading["misconception"],
        next_review_in_days=new_sm2["interval_days"],
        mastery_level=new_mastery,
    )


@router.get("/session/summary")
async def session_summary(uid: str = Depends(get_current_uid)):
    logs = crud.get_today_review_logs(uid)
    if not logs:
        return SessionSummaryResponse(
            cards_reviewed=0,
            avg_score=0.0,
            summary="No cards reviewed today yet.",
            weak_areas=[],
            strength_areas=[],
            recommended_focus="Start your first session!",
        )

    scores = [log.get("ai_score", 0) for log in logs]
    avg = round(sum(scores) / len(scores), 2)
    ai = summarize_session(logs)

    return SessionSummaryResponse(
        cards_reviewed=len(logs),
        avg_score=avg,
        summary=ai["summary"],
        weak_areas=ai["weak_areas"],
        strength_areas=ai["strength_areas"],
        recommended_focus=ai["recommended_focus"],
    )


@router.get("/history")
async def get_history(uid: str = Depends(get_current_uid)):
    logs = crud.get_recent_review_logs(uid, limit=50)
    return {"logs": logs, "total": len(logs)}


# ── Background tasks ──────────────────────────────────────────────────────────

def _generate_cards_for_topic(uid: str, topic: dict):
    """Fetch Wikipedia sections and generate cards for each section."""
    logger.info(f"Starting card generation for topic '{topic['name']}' (slug: {topic['wikipedia_slug']})")
    try:
        sections = fetch_wikipedia_sections(topic["wikipedia_slug"])
    except Exception as e:
        logger.error(f"Wikipedia fetch failed for '{topic['wikipedia_slug']}': {e}")
        return

    sections = sections[:10]  # cap at 10 sections to stay within free API quota
    logger.info(f"Processing {len(sections)} sections from Wikipedia")

    count = 0
    for section in sections:
        try:
            cards = generate_cards_for_section(topic["name"], section["text"])
            logger.info(f"Section '{section['title']}': generated {len(cards)} cards")
        except Exception as e:
            logger.error(f"Card generation failed for section '{section['title']}': {e}")
            continue
        time.sleep(4)  # stay under 15 req/min free tier limit
        for card_data in cards:
            try:
                now = datetime.now(timezone.utc)
                card_data.update({
                    "topic_id": topic["id"],
                    "sm2": {
                        "ease_factor": 2.5,
                        "interval_days": 1,
                        "repetitions": 0,
                        "due_date": now,
                        "last_reviewed": None,
                    },
                })
                crud.create_card(uid, card_data)
                count += 1
            except Exception as e:
                logger.error(f"Failed to save card to Firestore: {e}")

    logger.info(f"Card generation complete for topic '{topic['name']}': {count} cards saved")
    crud.update_topic(uid, topic["id"], {"card_count": count})


def _maybe_insert_remediation(uid: str, card: dict, misconception: str):
    """
    Check recent scores on this card. If the user hasn't resolved the
    misconception (< MISCONCEPTION_RESOLVE_STREAK consecutive scores >= 4),
    insert a remediation card due today.
    """
    recent_logs = crud.get_review_logs_for_card(uid, card["id"], limit=MISCONCEPTION_RESOLVE_STREAK)
    resolved = len(recent_logs) >= MISCONCEPTION_RESOLVE_STREAK and all(
        log.get("ai_score", 0) >= 4 for log in recent_logs[-MISCONCEPTION_RESOLVE_STREAK:]
    )
    if resolved:
        return

    remediation = generate_remediation_card(
        concept=card.get("difficulty_seed", ""),
        misconception=misconception,
        topic_id=card.get("topic_id", ""),
    )
    if remediation:
        crud.create_card(uid, remediation)
