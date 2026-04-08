from ai.client import call_gemini

_GRADER_SYSTEM = """You are a strict but encouraging tutor grading open-ended answers.
Score answers 0-5 based on conceptual correctness and completeness.
Always return raw JSON only — no markdown, no code fences, no preamble."""


def grade_answer(question: str, answer_key: str, user_answer: str, mastery_level: int) -> dict:
    """
    Grade the user's answer and return structured feedback.

    Returns a dict with: score, feedback, understood, missing, misconception
    """
    user_prompt = f"""Question: {question}
Model answer: {answer_key}
User's answer: {user_answer}
User's mastery level for this concept: {mastery_level}/4

Score the answer 0-5 using these criteria:
  5 = Complete, precise, correct mental model
  4 = Mostly correct, minor gap
  3 = Core idea present, significant detail missing
  2 = Partial understanding, notable misconception or gap
  1 = Minimal correct content
  0 = Incorrect or blank

Return JSON:
{{
  "score": int,
  "feedback": "2-3 sentence coaching note addressed to the user",
  "understood": ["concept the user clearly grasped"],
  "missing": ["specific concept or detail that was absent"],
  "misconception": "string describing wrong mental model, or null"
}}"""

    try:
        result = call_gemini(_GRADER_SYSTEM, user_prompt)
        # Validate and sanitize
        return {
            "score": int(result.get("score", 0)),
            "feedback": str(result.get("feedback", "")),
            "understood": list(result.get("understood", [])),
            "missing": list(result.get("missing", [])),
            "misconception": result.get("misconception") or None,
        }
    except (ValueError, RuntimeError, KeyError, TypeError):
        return {
            "score": 0,
            "feedback": "Could not grade your answer. Please try again.",
            "understood": [],
            "missing": [],
            "misconception": None,
        }
