# Mnemo — AI-Powered Spaced Repetition App

*Memory, made intelligent.*

Mnemo is a personal learning app that uses spaced repetition (SM-2 algorithm) and Google Gemini AI to dynamically generate, rephrase, and grade flashcard questions from Wikipedia source material.

---

## Architecture

```
[ React PWA ]  ←→  [ FastAPI Backend ]  ←→  [ Firebase Firestore ]
  Frontend           (Render.com)              (Google Cloud)
  Firebase Hosting        ↕
                   Google Gemini API
```

---

## Prerequisites

- Python 3.11+
- Node.js (optional, only if you want to run Firebase CLI)
- Firebase project with Firestore and Authentication (Google sign-in) enabled
- Google Gemini API key
- Render.com account (for backend deployment)
- Firebase Hosting enabled (for frontend deployment)

---

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/itaischles/Mnemo.git
cd Mnemo
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env`:
```
GEMINI_API_KEY=your-gemini-api-key-here
FIREBASE_CREDENTIALS_PATH=./firebase_credentials.json
```

### 3. Add Firebase credentials

Download your Firebase service account JSON:
- Firebase Console → Project Settings → Service Accounts → Generate new private key
- Save as `firebase_credentials.json` in the project root

> `firebase_credentials.json` and `.env` are in `.gitignore` — never commit them.

### 4. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 5. Create Firestore composite index

In the Firebase Console:
- Firestore → Indexes → Composite → Add index
- Collection: `cards` (under your user subcollection path)
- Fields: `sm2.due_date` ASC, `sm2.last_reviewed` ASC

### 6. Run locally

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

### 7. Update the frontend API URL

Edit `frontend/src/App.jsx`, line 9:
```js
const API_BASE = "http://localhost:8000";  // for local testing
```

Open `frontend/index.html` in your browser or serve with:
```bash
cd frontend
python -m http.server 3000
```

---

## Deployment

### Backend → Render.com

1. Push to GitHub
2. In Render.com: New → Web Service → connect your GitHub repo
3. Set:
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in Render dashboard:
   - `GEMINI_API_KEY` = your key
   - `FIREBASE_CREDENTIALS_PATH` = `/etc/secrets/firebase_credentials.json`
5. Add `firebase_credentials.json` as a Secret File at the path above
6. Note your Render URL (e.g. `https://mnemo-backend.onrender.com`)

### Frontend → Firebase Hosting

1. Update `frontend/src/App.jsx`:
   ```js
   const API_BASE = "https://mnemo-backend.onrender.com";
   ```

2. Install Firebase CLI (if not already):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. Initialize Firebase Hosting (first time only):
   ```bash
   firebase init hosting
   # Public directory: frontend
   # Single-page app: Yes
   # Overwrite index.html: No
   ```

4. Deploy:
   ```bash
   firebase deploy --only hosting
   ```

---

## Project Structure

```
Mnemo/
├── main.py                    # FastAPI app entry point
├── config.py                  # Settings: max_cards, model, thresholds
├── requirements.txt
├── .env.example
├── .gitignore
│
├── database/
│   ├── firebase_client.py     # Firestore client initialization
│   └── crud.py                # All Firestore read/write operations
│
├── core/
│   ├── sm2.py                 # SM-2 algorithm + mastery level updates
│   ├── scheduler.py           # Daily queue builder
│   └── content_fetcher.py     # Wikipedia fetch + section chunking
│
├── ai/
│   ├── client.py              # Gemini client + base call_gemini()
│   ├── question_generator.py  # Card generation + dynamic question rephrasing
│   ├── answer_grader.py       # Grading with structured output
│   └── session_summarizer.py  # End-of-session coaching summary
│
├── api/
│   ├── routes.py              # All FastAPI route definitions
│   ├── auth.py                # Firebase token verification middleware
│   └── models.py              # Pydantic request/response models
│
└── frontend/
    ├── index.html             # PWA shell
    ├── manifest.json          # PWA manifest
    ├── service_worker.js      # PWA offline support
    └── src/
        └── App.jsx            # Full React SPA (5 screens)
```

---

## API Endpoints

All endpoints require `Authorization: Bearer <firebase-id-token>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/topics` | Add topic, trigger card generation |
| `GET` | `/topics` | List all topics with mastery stats |
| `POST` | `/topics/{id}/refresh` | Regenerate cards for a topic |
| `GET` | `/topics/{id}/stats` | Card-level progress breakdown |
| `GET` | `/session/today` | Get today's due card queue |
| `POST` | `/session/answer` | Submit answer → AI grade + SM-2 update |
| `GET` | `/session/summary` | AI coaching summary for today's session |
| `GET` | `/history` | Recent review log entries |
| `GET` | `/health` | Health check |

---

## Configuration (`config.py`)

| Setting | Default | Description |
|---|---|---|
| `MAX_CARDS_PER_DAY` | 20 | Hard cap on daily queue size |
| `NEW_CARDS_PER_DAY` | 5 | Max new (unseen) cards per day |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model for all AI jobs |
| `CARDS_PER_SECTION` | 4 | Cards generated per Wikipedia section |
| `MASTERY_INTERVAL_THRESHOLDS` | [0,3,10,21,60] | Days → mastery levels 0–4 |
| `MISCONCEPTION_RESOLVE_STREAK` | 2 | Consecutive scores ≥4 to clear misconception |
