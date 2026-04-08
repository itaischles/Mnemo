from datetime import datetime, timedelta, timezone
from config import MASTERY_INTERVAL_THRESHOLDS


def update_sm2(card: dict, score: int) -> dict:
    """Run one SM-2 iteration and return the updated sm2 sub-dict."""
    sm2 = dict(card["sm2"])  # shallow copy — don't mutate caller's dict

    if score >= 3:
        reps = sm2["repetitions"]
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(sm2["interval_days"] * sm2["ease_factor"])

        ease_factor = sm2["ease_factor"] + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02))
        ease_factor = max(1.3, ease_factor)
        repetitions = sm2["repetitions"] + 1
    else:
        interval = 1
        ease_factor = sm2["ease_factor"]
        repetitions = 0

    now = datetime.now(timezone.utc)
    sm2.update({
        "ease_factor": round(ease_factor, 4),
        "interval_days": interval,
        "repetitions": repetitions,
        "due_date": now + timedelta(days=interval),
        "last_reviewed": now,
    })
    return sm2


def compute_mastery_level(interval_days: int) -> int:
    """Map an SM-2 interval (days) to a mastery level 0–4."""
    thresholds = MASTERY_INTERVAL_THRESHOLDS  # [0, 3, 10, 21, 60]
    level = 0
    for i, threshold in enumerate(thresholds):
        if interval_days > threshold:
            level = i
    return level
