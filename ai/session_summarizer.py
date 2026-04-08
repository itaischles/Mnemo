import json
from ai.client import call_gemini

_SUMMARIZER_SYSTEM = """You are an encouraging learning coach analyzing a student's study session.
Provide honest, specific, and motivating feedback.
Always return raw JSON only — no markdown, no code fences, no preamble."""


def summarize_session(review_logs: list[dict]) -> dict:
    """
    Analyze a completed session's review logs and return coaching feedback.

    Returns a dict with: summary, weak_areas, strength_areas, recommended_focus
    """
    if not review_logs:
        return {
            "summary": "No cards were reviewed in this session.",
            "weak_areas": [],
            "strength_areas": [],
            "recommended_focus": "Try completing at least one card tomorrow.",
        }

    # Slim down logs to avoid huge prompts
    slim_logs = [
        {
            "question": log.get("question", ""),
            "score": log.get("ai_score", 0),
            "feedback": log.get("ai_feedback", ""),
            "understood": log.get("understood", []),
            "missing": log.get("missing", []),
            "misconception": log.get("misconception"),
        }
        for log in review_logs
    ]

    user_prompt = f"""User review session data:
{json.dumps(slim_logs, indent=2)}

Analyze this session and return JSON:
{{
  "summary": "2-3 paragraph coaching summary addressed to the user",
  "weak_areas": ["concept needing more work"],
  "strength_areas": ["concepts showing mastery"],
  "recommended_focus": "one sentence suggestion for tomorrow"
}}"""

    try:
        result = call_gemini(_SUMMARIZER_SYSTEM, user_prompt)
        return {
            "summary": str(result.get("summary", "")),
            "weak_areas": list(result.get("weak_areas", [])),
            "strength_areas": list(result.get("strength_areas", [])),
            "recommended_focus": str(result.get("recommended_focus", "")),
        }
    except (ValueError, RuntimeError, KeyError):
        return {
            "summary": "Session complete! Keep up the consistent practice.",
            "weak_areas": [],
            "strength_areas": [],
            "recommended_focus": "Review the cards you struggled with.",
        }
