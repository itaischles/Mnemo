# Mnemo — AI-Powered Spaced Repetition App
### Full Technical Specification for Claude Code

---

## 1. Project Overview

Mnemo is a personal spaced repetition learning app with an AI twist: questions are not static flashcards but are dynamically generated, phrased, and adapted by Claude based on Wikipedia source material and the user's evolving mastery level. The app tracks progress over time, curates a daily review queue, adapts difficulty based on performance, detects misconceptions, and provides coaching feedback after each session.

**Tagline:** *Memory, made intelligent.*

---

## 2. Architecture

The system has three independent layers that communicate over HTTPS:

```
[ React PWA ]  ←→  [ FastAPI Brain ]  ←→  [ Firebase Firestore ]
  Frontend           Backend                  Database
  (any device)       (Render.com)             (Google Cloud)
                          ↕
                   Anthropic Claude API
```

### Layer Responsibilities

| Layer | Technology | Hosted On | Job |
|---|---|---|---|
| Frontend | React (PWA) | Firebase Hosting | UI, user interaction, display |
| Backend | Python / FastAPI | Render.com (free tier) | Logic, SM-2, Claude API calls |
| Database | Firebase Firestore | Google Cloud (free tier) | Data persistence, auth |
| AI | Claude claude-sonnet-4-5 | Anthropic API | Question gen, grading, summaries |

### Developer Workflow
- All code lives on the developer's PC, edited in VS Code
- Code is pushed to GitHub; Render auto-deploys on every push
- Local testing runs the FastAPI backend on localhost before pushing
- Firestore and Anthropic API keys are stored in a `.env` file, never committed

---

## 3. Tech Stack

| Component | Choice |
|---|---|
| Language | Python 3.11+ |
| Backend framework | FastAPI |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (Google sign-in) |
| Frontend | React (single JSX file, Tailwind CSS) |
| PWA | Service worker + Web App Manifest |
| AI | Anthropic Python SDK (`claude-sonnet-4-5`) |
| Content source | `wikipedia-api` Python library |
| Scheduling | APScheduler (in-process cron) |
| Deployment — backend | Render.com free tier |
| Deployment — frontend | Firebase Hosting |
| Version control | GitHub |
| Environment variables | `python-dotenv` |

---

## 4. Firestore Data Model

All data lives under `/users/{uid}/` so each user's data is private and isolated.

### Collections

```
/users/{uid}/
  topics/{topicId}
  cards/{cardId}
  sessions/{sessionId}
  reviewLogs/{logId}
```

### Topic Document
```json
{
  "id": "string",
  "name": "Antenna Theory",
  "description": "string",
  "wikipedia_slug": "Antenna_(radio)",
  "created_at": "timestamp",
  "last_refreshed": "timestamp",
  "card_count": 34,
  "color": "#4ECDC4"
}
```

### Card Document
```json
{
  "id": "string",
  "topic_id": "string",
  "question": "string",
  "answer_key": "string",
  "card_type": "recall | application | comparison | definition",
  "difficulty_seed": "string (the concept being tested)",
  "mastery_level": 0,
  "created_at": "timestamp",
  "sm2": {
    "ease_factor": 2.5,
    "interval_days": 1,
    "repetitions": 0,
    "due_date": "timestamp",
    "last_reviewed": "timestamp"
  }
}
```

Note: SM-2 state is embedded directly in the card document since they are always read together.

### ReviewLog Document (append-only)
```json
{
  "id": "string",
  "card_id": "string",
  "topic_id": "string",
  "reviewed_at": "timestamp",
  "user_answer": "string",
  "ai_score": 3,
  "ai_feedback": "string",
  "understood": ["concept A", "concept B"],
  "missing": ["concept C"],
  "misconception": "string or null",
  "interval_after": 6
}
```

### DailySession Document
```json
{
  "id": "string",
  "date": "YYYY-MM-DD",
  "cards_reviewed": 14,
  "avg_score": 3.8,
  "weak_areas": ["string"],
  "ai_summary": "string",
  "duration_minutes": 18
}
```

### Required Firestore Composite Index
Create in Firebase Console on the `cards` collection:
- `sm2.due_date` ASC
- `sm2.last_reviewed` ASC

---

## 5. SM-2 Algorithm

Standard SM-2 implementation. AI grading score (0–5) feeds directly into this algorithm after each review.

```python
def update_sm2(card: dict, score: int) -> dict:
    sm2 = card["sm2"]

    if score >= 3:
        if sm2["repetitions"] == 0:
            interval = 1
        elif sm2["repetitions"] == 1:
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

    due_date = datetime.utcnow() + timedelta(days=interval)

    sm2.update({
        "ease_factor": ease_factor,
        "interval_days": interval,
        "repetitions": repetitions,
        "due_date": due_date,
        "last_reviewed": datetime.utcnow()
    })
    return sm2
```

---

## 6. Daily Queue Logic

```python
def get_daily_queue(uid: str, max_cards: int = 20, new_cards_per_day: int = 5) -> list:
    today = datetime.utcnow().date()

    overdue   = cards where sm2.due_date < today        # highest priority
    due_today = cards where sm2.due_date == today
    new_cards = cards where sm2.repetitions == 0        # capped at new_cards_per_day

    queue = overdue + due_today + new_cards[:new_cards_per_day]
    return queue[:max_cards]
```

The cap on new cards (default 5/day, configurable in `config.py`) prevents overwhelming the user. This runs at app open — not on a background timer — so it always reflects the current state.

---

## 7. AI Integration — Claude claude-sonnet-4-5

All three Claude jobs use the same base pattern:

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

def call_claude(system_prompt: str, user_prompt: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": "Respond only in raw JSON with no markdown formatting or code fences. \n\n" + user_prompt}]
    )
    return json.loads(response.content[0].text)
```

### Job 1 — Card Generation

Triggered when a topic is added or manually refreshed.

**Process:**
1. Fetch Wikipedia article using `wikipedia-api` library
2. Split article into sections by heading (not arbitrary token splits)
3. For each section, call Claude to generate cards

**System prompt:**
```
You are an expert educator creating spaced repetition flashcards.
Generate cards that test deep conceptual understanding, not surface recall.
Always return raw JSON only — no markdown, no code fences, no preamble.
```

**User prompt:**
```
Topic: {topic_name}
Source text: {section_text}
Mastery context: Generate cards appropriate for a complete beginner.

Return a JSON array of cards, each with:
- question (string)
- answer_key (string: a complete model answer)
- card_type (one of: "definition", "recall", "application", "comparison")
- difficulty_seed (string: the specific concept being tested)
```

**Output stored** directly as Card documents in Firestore.

---

### Job 2 — Answer Grading

Triggered after every card submission. Returns structured data used by both SM-2 and the UI.

**User prompt:**
```
Question: {question}
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
{
  "score": int,
  "feedback": "2-3 sentence coaching note addressed to the user",
  "understood": ["concept the user clearly grasped"],
  "missing": ["specific concept or detail that was absent"],
  "misconception": "string describing wrong mental model, or null"
}
```

---

### Job 3 — Session Summary

Triggered once after the user completes all cards in a session.

**User prompt:**
```
User review session data:
{json.dumps(review_logs)}

Analyze this session and return JSON:
{
  "summary": "2-3 paragraph coaching summary addressed to the user",
  "weak_areas": ["concept needing more work"],
  "strength_areas": ["concepts showing mastery"],
  "recommended_focus": "one sentence suggestion for tomorrow"
}
```

---

## 8. Adaptive Difficulty System

Two mechanisms work together: SM-2 controls *when* to ask, Claude controls *how hard* to ask.

### Mastery Levels

Each card tracks `mastery_level` (0–4), updated when `sm2.interval_days` crosses thresholds:

| Level | Interval Threshold | Claude's Question Style |
|---|---|---|
| 0 — New | First review | Plain definition recall |
| 1 — Familiar | interval > 3 days | Explain the reasoning |
| 2 — Developing | interval > 10 days | Apply to a scenario |
| 3 — Strong | interval > 21 days | Connect to adjacent concepts |
| 4 — Mastered | interval > 60 days | Stress-test edge cases and assumptions |

### Dynamic Question Generation

When a card is due, Claude does **not** serve the stored `question` — it generates a **new phrasing** based on mastery level and review history:

```python
def generate_review_question(card: dict, review_history: list) -> str:
    prompt = f"""
    Concept: {card['difficulty_seed']}
    Topic: {card['topic_name']}
    Mastery level: {card['mastery_level']}/4
    Previous gaps identified: {extract_missing(review_history)}
    Previous misconception: {extract_misconception(review_history)}

    Generate a single question that:
    - Matches the mastery level (see level guide in system prompt)
    - Targets any previously identified gaps
    - Is phrased differently from: {card['question']}

    Return JSON: {{ "question": "string" }}
    """
```

### Misconception Remediation

If grading returns a non-null `misconception`, the system:
1. Generates a **remediation card** targeting that exact misconception
2. Inserts it into the queue with `due_date = today` and high priority
3. Keeps regenerating variants until the user scores 4+ twice consecutively

---

## 9. API Endpoints

All endpoints require Firebase Auth token in the `Authorization: Bearer {token}` header.

```
POST   /topics                    Add topic, trigger card generation
GET    /topics                    List all topics with mastery stats
POST   /topics/{id}/refresh       Regenerate cards for a topic

GET    /session/today             Get today's due card queue
POST   /session/answer            Submit answer → get AI grade + updated SM-2
GET    /session/summary           Get AI summary for completed session

GET    /topics/{id}/stats         Card-level progress breakdown
GET    /history                   Recent review log entries
```

### Example: POST /session/answer

**Request:**
```json
{
  "card_id": "string",
  "user_answer": "string"
}
```

**Response:**
```json
{
  "score": 4,
  "feedback": "Strong answer...",
  "understood": ["near-field reactive energy"],
  "missing": ["ka << 1 regime"],
  "misconception": null,
  "next_review_in_days": 6,
  "mastery_level": 2
}
```

---

## 10. Project File Structure

```
mnemo/
├── main.py                        # FastAPI app entry point
├── config.py                      # Settings: max_cards, new_cards_per_day, model name
├── requirements.txt
├── .env                           # ANTHROPIC_API_KEY, FIREBASE_CREDENTIALS_PATH
├── .gitignore                     # Must include .env and firebase credentials JSON
│
├── database/
│   ├── firebase_client.py         # Firestore client initialization
│   └── crud.py                    # All Firestore read/write operations
│
├── core/
│   ├── sm2.py                     # SM-2 algorithm, mastery level updates
│   ├── scheduler.py               # Daily queue builder (also notification hook)
│   └── content_fetcher.py         # Wikipedia fetch + section chunking
│
├── ai/
│   ├── client.py                  # Shared Anthropic client + base call_claude()
│   ├── question_generator.py      # Card generation + dynamic question rephrasing
│   ├── answer_grader.py           # Grading with structured output
│   └── session_summarizer.py      # End-of-session coaching summary
│
├── api/
│   ├── routes.py                  # All FastAPI route definitions
│   ├── auth.py                    # Firebase token verification middleware
│   └── models.py                  # Pydantic request/response models
│
└── frontend/
    ├── index.html                 # PWA shell
    ├── manifest.json              # PWA manifest (name, icons, theme color)
    ├── service_worker.js          # PWA offline support (stub for v1)
    └── src/
        └── App.jsx                # Full React single-page app
```

---

## 11. Frontend — React PWA

### Screens (4)

**Home / Dashboard**
- Cards due today (breakdown: overdue / due / new)
- Start Session button
- Weekly activity bar chart
- Streak counter, retention rate, total cards
- Topic list with circular mastery progress indicators

**Study (card review)**
- Progress bar (card N of M)
- Topic + difficulty + card type badges
- Question displayed prominently
- Free-text answer textarea
- Submit & Reveal button (disabled until text entered)

**Answer Reveal**
- AI score (0–5) with visual bar
- Next review interval
- AI feedback paragraph
- Model answer (revealed after submission)
- Next Card button

**Topics Library**
- Topic cards with mastery progress bars
- Add Topic button → modal with topic name + Wikipedia slug input

**Progress / Session Summary** (shown after completing daily queue)
- Session stats: cards reviewed, avg score, time, retention
- AI coach summary paragraph
- Weak areas list
- Recommended focus for tomorrow

### PWA Configuration
- `manifest.json` must set `display: standalone` and `start_url: /`
- Service worker registers on first load for offline shell caching
- User prompted to "Add to Home Screen" on first visit

---

## 12. Push Notifications (v1.1 — not in first implementation)

Leave a clean hook in `scheduler.py`:

```python
def run_daily_refresh(uid: str):
    queue = get_daily_queue(uid)
    # TODO v1.1: send_push_notification(uid, len(queue))
    return queue
```

When implemented, this will use Firebase Cloud Messaging (FCM). The service worker already registered for PWA support also handles incoming push events.

**Requirements for full implementation:**
- FCM setup in Firebase Console
- Service worker push event listener
- User permission prompt on first launch
- iOS requires PWA installed to home screen first

---

## 13. Configuration (`config.py`)

```python
MAX_CARDS_PER_DAY = 20
NEW_CARDS_PER_DAY = 5
CLAUDE_MODEL = "claude-sonnet-4-5"
CARDS_PER_SECTION = 4
MASTERY_INTERVAL_THRESHOLDS = [0, 3, 10, 21, 60]  # days → levels 0-4
MISCONCEPTION_RESOLVE_STREAK = 2  # scores >= 4 needed to clear misconception
```

---

## 14. Setup Instructions (for README)

1. Clone repo and create `.env`:
   ```
   ANTHROPIC_API_KEY=sk-...
   FIREBASE_CREDENTIALS_PATH=./firebase_credentials.json
   ```
2. Download Firebase service account JSON from Firebase Console → Project Settings → Service Accounts
3. Install dependencies: `pip install -r requirements.txt`
4. Create Firestore composite index on `cards`: `sm2.due_date ASC, sm2.last_reviewed ASC`
5. Run locally: `uvicorn main:app --reload`
6. Deploy: push to GitHub → Render auto-deploys
7. Deploy frontend: `firebase deploy --only hosting`

---

## 15. First-Run Seed Data

On first launch, automatically create 2 starter topics so the UI is not empty:
- **"Spaced Repetition"** — Wikipedia: `Spaced_repetition` (meta: learn about the system you're using)
- **"Memory and Learning"** — Wikipedia: `Memory_consolidation`

---

## 16. Key Implementation Notes

- **Never hardcode API keys** — always read from environment variables
- **JSON-only Claude responses** — system prompt must forbid markdown fences; wrap all `json.loads()` in try/except
- **Wikipedia chunking** — split by section heading, not token count; discard sections shorter than 200 characters (navboxes, references)
- **Dynamic questions** — at review time, Claude generates a fresh question variant; the stored `question` in Firestore is the seed/reference only
- **Auth on every endpoint** — verify Firebase ID token in FastAPI middleware before any database access
- **Misconception priority** — remediation cards bypass the normal queue cap and always appear in the next session
- **Offline resilience** — Firestore has a built-in local cache; SM-2 scheduling logic runs locally; only card generation and grading require live API calls
