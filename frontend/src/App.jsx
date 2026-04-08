// Mnemo — AI-Powered Spaced Repetition App
// Single-file React SPA (no build step required)

const { useState, useEffect, useCallback, useRef } = React;

// ── Config ────────────────────────────────────────────────────────────────────
// Replace with your actual Render.com backend URL after deploying
const API_BASE = "https://mnemo-backend.onrender.com";

// ── API helpers ───────────────────────────────────────────────────────────────
async function getToken() {
  return window.__mnemoGetToken?.() ?? null;
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

// ── Utility components ────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Badge({ label, color = "bg-slate-700 text-slate-300" }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
  );
}

function ScoreBar({ score }) {
  const pct = (score / 5) * 100;
  const color =
    score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
      <div
        className={`h-3 rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MasteryRing({ level, size = 40 }) {
  const pct = (level / 4) * 100;
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = ["#64748b", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981"][level] ?? "#64748b";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={12} fill={color} fontWeight="bold">
        {level}
      </text>
    </svg>
  );
}

const CARD_TYPE_COLORS = {
  definition: "bg-blue-900 text-blue-300",
  recall: "bg-purple-900 text-purple-300",
  application: "bg-amber-900 text-amber-300",
  comparison: "bg-teal-900 text-teal-300",
};

const MASTERY_LABELS = ["New", "Familiar", "Developing", "Strong", "Mastered"];

// ── Screen: Auth ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await window.__mnemoSignIn();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-500/30">
          <span className="text-4xl">🧠</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">Mnemo</h1>
        <p className="text-slate-400 mb-10">Memory, made intelligent.</p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-800 font-semibold py-3 px-6 rounded-xl hover:bg-slate-100 transition disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? "Signing in…" : "Continue with Google"}
        </button>

        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}

// ── Screen: Dashboard ─────────────────────────────────────────────────────────
function Dashboard({ onStartSession, onGoToTopics, onGoToHistory }) {
  const [data, setData] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionData, topicsData] = await Promise.all([
        apiFetch("/session/today"),
        apiFetch("/topics"),
      ]);
      setData(sessionData);
      setTopics(topicsData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  const total = data?.total ?? 0;
  const overdue = data?.cards?.filter(c => c.mastery_level === 0).length ?? 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Good day! 👋</h1>
          <p className="text-slate-400 text-sm">Your learning dashboard</p>
        </div>
        <button
          onClick={() => window.__mnemoSignOut()}
          className="text-slate-500 hover:text-slate-300 text-sm"
        >
          Sign out
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
          <button onClick={load} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Due today card */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-900 rounded-2xl p-6 shadow-lg">
        <p className="text-brand-100 text-sm mb-1">Cards due today</p>
        <p className="text-5xl font-bold text-white mb-4">{total}</p>
        <div className="flex gap-3 text-xs mb-5">
          <span className="bg-red-500/30 text-red-300 px-2 py-1 rounded-full">
            {overdue} overdue
          </span>
          <span className="bg-white/10 text-white px-2 py-1 rounded-full">
            {total - overdue} due / new
          </span>
        </div>
        <button
          onClick={onStartSession}
          disabled={total === 0}
          className="w-full bg-white text-brand-700 font-bold py-3 rounded-xl hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {total === 0 ? "All caught up! 🎉" : "Start Session →"}
        </button>
      </div>

      {/* Topics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Topics</h2>
          <button onClick={onGoToTopics} className="text-brand-400 text-sm hover:text-brand-300">
            Manage →
          </button>
        </div>
        {topics.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-6 text-center text-slate-400">
            <p className="mb-3">No topics yet.</p>
            <button
              onClick={onGoToTopics}
              className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-600"
            >
              Add your first topic
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map(topic => (
              <div key={topic.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
                <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: topic.color || "#6366f1" }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{topic.name}</p>
                  <p className="text-xs text-slate-400">{topic.card_count} cards</p>
                  <div className="mt-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-brand-500 transition-all"
                      style={{ width: `${((topic.avg_mastery ?? 0) / 4) * 100}%` }}
                    />
                  </div>
                </div>
                <MasteryRing level={Math.round(topic.avg_mastery ?? 0)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History link */}
      <button
        onClick={onGoToHistory}
        className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-slate-300 text-sm transition"
      >
        View review history →
      </button>
    </div>
  );
}

// ── Screen: Study ─────────────────────────────────────────────────────────────
function StudyScreen({ onSessionComplete, onBack }) {
  const [cards, setCards] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionStartTime] = useState(Date.now());
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    apiFetch("/session/today")
      .then(data => {
        setCards(data.cards || []);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  async function handleSubmit() {
    const card = cards[currentIdx];
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch("/session/answer", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, user_answer: answer }),
      });
      setGrading(result);
      setShowReveal(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= cards.length) {
      const duration = Math.round((Date.now() - sessionStartTime) / 60000);
      onSessionComplete(duration);
    } else {
      setCurrentIdx(nextIdx);
      setAnswer("");
      setGrading(null);
      setShowReveal(false);
    }
  }

  if (loading) return <Spinner />;

  if (cards.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold text-white mb-2">All done!</h2>
        <p className="text-slate-400 mb-6">No cards due right now.</p>
        <button onClick={onBack} className="bg-brand-500 text-white px-6 py-3 rounded-xl">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const card = cards[currentIdx];
  const progress = ((currentIdx) / cards.length) * 100;

  if (showReveal && grading) {
    return <AnswerReveal card={card} grading={grading} onNext={handleNext} isLast={currentIdx === cards.length - 1} />;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white">←</button>
        <div className="flex-1 bg-slate-700 rounded-full h-2">
          <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-slate-400 text-sm">{currentIdx + 1}/{cards.length}</span>
      </div>

      {/* Badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge label={card.topic_name} color="bg-slate-700 text-slate-300" />
        <Badge
          label={card.card_type}
          color={CARD_TYPE_COLORS[card.card_type] || "bg-slate-700 text-slate-300"}
        />
        <Badge
          label={MASTERY_LABELS[card.mastery_level] || "New"}
          color="bg-slate-700 text-slate-400"
        />
      </div>

      {/* Question */}
      <div className="bg-slate-800 rounded-2xl p-6">
        <p className="text-slate-400 text-xs mb-3 uppercase tracking-wider">Question</p>
        <p className="text-white text-lg leading-relaxed">{card.question}</p>
      </div>

      {/* Answer textarea */}
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        placeholder="Type your answer here…"
        rows={5}
        className="w-full bg-slate-800 border border-slate-600 focus:border-brand-500 rounded-2xl p-4 text-white placeholder-slate-500 outline-none resize-none transition"
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!answer.trim() || submitting}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Grading…" : "Submit & Reveal"}
      </button>
    </div>
  );
}

// ── Screen: Answer Reveal ─────────────────────────────────────────────────────
function AnswerReveal({ card, grading, onNext, isLast }) {
  const scoreColor =
    grading.score >= 4 ? "text-emerald-400" : grading.score >= 3 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Score */}
      <div className="bg-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400 text-sm">AI Score</p>
          <span className={`text-3xl font-bold ${scoreColor}`}>{grading.score}/5</span>
        </div>
        <ScoreBar score={grading.score} />
        <p className="text-slate-400 text-xs mt-2">
          Next review in <span className="text-white font-medium">{grading.next_review_in_days} days</span>
          {" · "}Mastery: <span className="text-white font-medium">{MASTERY_LABELS[grading.mastery_level]}</span>
        </p>
      </div>

      {/* AI feedback */}
      <div className="bg-slate-800 rounded-2xl p-5">
        <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Feedback</p>
        <p className="text-white leading-relaxed">{grading.feedback}</p>
      </div>

      {/* Understood / Missing */}
      {(grading.understood?.length > 0 || grading.missing?.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {grading.understood?.length > 0 && (
            <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4">
              <p className="text-emerald-400 text-xs font-semibold mb-2">✓ Understood</p>
              <ul className="space-y-1">
                {grading.understood.map((u, i) => (
                  <li key={i} className="text-emerald-300 text-xs">{u}</li>
                ))}
              </ul>
            </div>
          )}
          {grading.missing?.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-4">
              <p className="text-amber-400 text-xs font-semibold mb-2">△ Missing</p>
              <ul className="space-y-1">
                {grading.missing.map((m, i) => (
                  <li key={i} className="text-amber-300 text-xs">{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Misconception warning */}
      {grading.misconception && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-4">
          <p className="text-red-400 text-xs font-semibold mb-1">⚠ Misconception detected</p>
          <p className="text-red-300 text-sm">{grading.misconception}</p>
          <p className="text-red-400/60 text-xs mt-1">A remediation card has been added to your queue.</p>
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl transition"
      >
        {isLast ? "Finish Session →" : "Next Card →"}
      </button>
    </div>
  );
}

// ── Screen: Session Summary ───────────────────────────────────────────────────
function SessionSummary({ durationMinutes, onBack }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/session/summary")
      .then(data => { setSummary(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="text-center py-4">
        <p className="text-5xl mb-2">🏆</p>
        <h2 className="text-2xl font-bold text-white">Session Complete!</h2>
        <p className="text-slate-400 text-sm">{durationMinutes} min · {summary?.cards_reviewed ?? 0} cards · avg {summary?.avg_score?.toFixed(1) ?? "—"}/5</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {summary && (
        <>
          {/* AI Summary */}
          <div className="bg-slate-800 rounded-2xl p-5">
            <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Coach Summary</p>
            <p className="text-white leading-relaxed text-sm">{summary.summary}</p>
          </div>

          {/* Areas */}
          <div className="grid grid-cols-2 gap-3">
            {summary.strength_areas?.length > 0 && (
              <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4">
                <p className="text-emerald-400 text-xs font-semibold mb-2">💪 Strengths</p>
                <ul className="space-y-1">
                  {summary.strength_areas.map((s, i) => (
                    <li key={i} className="text-emerald-300 text-xs">{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.weak_areas?.length > 0 && (
              <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-4">
                <p className="text-amber-400 text-xs font-semibold mb-2">📚 Work on</p>
                <ul className="space-y-1">
                  {summary.weak_areas.map((w, i) => (
                    <li key={i} className="text-amber-300 text-xs">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommended focus */}
          {summary.recommended_focus && (
            <div className="bg-brand-900/40 border border-brand-700/40 rounded-xl p-4">
              <p className="text-brand-400 text-xs font-semibold mb-1">🎯 Tomorrow's focus</p>
              <p className="text-brand-200 text-sm">{summary.recommended_focus}</p>
            </div>
          )}
        </>
      )}

      <button
        onClick={onBack}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl transition"
      >
        Back to Dashboard
      </button>
    </div>
  );
}

// ── Screen: Topics Library ────────────────────────────────────────────────────
const TOPIC_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

function TopicsLibrary({ onBack }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", wikipedia_slug: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/topics");
      setTopics(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const color = TOPIC_COLORS[topics.length % TOPIC_COLORS.length];
      await apiFetch("/topics", {
        method: "POST",
        body: JSON.stringify({ ...form, color }),
      });
      setShowModal(false);
      setForm({ name: "", wikipedia_slug: "", description: "" });
      await loadTopics();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRefresh(topicId) {
    setRefreshingId(topicId);
    try {
      await apiFetch(`/topics/${topicId}/refresh`, { method: "POST" });
      await loadTopics();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white">←</button>
          <h2 className="text-xl font-bold text-white">Topics Library</h2>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          + Add Topic
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {topics.length === 0 && (
            <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-400">
              No topics yet. Add one to get started!
            </div>
          )}
          {topics.map(topic => (
            <div key={topic.id} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-full min-h-12 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: topic.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white truncate">{topic.name}</p>
                    <button
                      onClick={() => handleRefresh(topic.id)}
                      disabled={refreshingId === topic.id}
                      className="text-slate-400 hover:text-brand-400 text-xs flex-shrink-0 transition"
                      title="Regenerate cards"
                    >
                      {refreshingId === topic.id ? "⟳ …" : "⟳ Refresh"}
                    </button>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {topic.wikipedia_slug} · {topic.card_count} cards
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${((topic.avg_mastery ?? 0) / 4) * 100}%`,
                          backgroundColor: topic.color,
                        }}
                      />
                    </div>
                    <span className="text-slate-400 text-xs">
                      {MASTERY_LABELS[Math.round(topic.avg_mastery ?? 0)]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Topic Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Add New Topic</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm block mb-1">Topic Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="e.g. Quantum Mechanics"
                  className="w-full bg-slate-700 border border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 text-sm block mb-1">Wikipedia Slug</label>
                <input
                  value={form.wikipedia_slug}
                  onChange={e => setForm(f => ({ ...f, wikipedia_slug: e.target.value }))}
                  required
                  placeholder="e.g. Quantum_mechanics"
                  className="w-full bg-slate-700 border border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none"
                />
                <p className="text-slate-500 text-xs mt-1">
                  The last part of the Wikipedia URL: en.wikipedia.org/wiki/<em>Quantum_mechanics</em>
                </p>
              </div>
              <div>
                <label className="text-slate-400 text-sm block mb-1">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this topic about?"
                  className="w-full bg-slate-700 border border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="flex-1 bg-slate-700 text-slate-300 py-3 rounded-xl hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 bg-brand-500 text-white font-semibold py-3 rounded-xl hover:bg-brand-600 transition disabled:opacity-50"
                >
                  {adding ? "Adding…" : "Add Topic"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Screen: History ───────────────────────────────────────────────────────────
function HistoryScreen({ onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/history")
      .then(data => { setLogs(data.logs || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const scoreColor = (score) =>
    score >= 4 ? "text-emerald-400" : score >= 3 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white">←</button>
        <h2 className="text-xl font-bold text-white">Review History</h2>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading ? <Spinner /> : (
        <>
          {logs.length === 0 && (
            <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-400">
              No reviews yet. Start a session!
            </div>
          )}
          <div className="space-y-3">
            {[...logs].reverse().map(log => (
              <div key={log.id} className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white text-sm leading-snug line-clamp-2 flex-1">{log.question}</p>
                  <span className={`text-lg font-bold flex-shrink-0 ${scoreColor(log.ai_score)}`}>
                    {log.ai_score}/5
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-2 line-clamp-2">{log.ai_feedback}</p>
                <p className="text-slate-600 text-xs mt-1">
                  {log.reviewed_at?.seconds
                    ? new Date(log.reviewed_at.seconds * 1000).toLocaleDateString()
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
const SCREENS = {
  DASHBOARD: "dashboard",
  STUDY: "study",
  SUMMARY: "summary",
  TOPICS: "topics",
  HISTORY: "history",
};

function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [screen, setScreen] = useState(SCREENS.DASHBOARD);
  const [sessionDuration, setSessionDuration] = useState(0);

  useEffect(() => {
    // Wait for Firebase Auth to be ready
    const unsubscribe = window.__mnemoOnAuthStateChanged?.((u) => setUser(u ?? null));
    return () => unsubscribe?.();
  }, []);

  // Loading state while auth resolves
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const nav = (s) => setScreen(s);

  return (
    <div className="min-h-screen pb-8">
      {/* Bottom nav bar */}
      {screen === SCREENS.DASHBOARD && (
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex z-40">
          <button
            onClick={() => nav(SCREENS.DASHBOARD)}
            className="flex-1 flex flex-col items-center py-3 text-brand-400"
          >
            <span className="text-lg">🏠</span>
            <span className="text-xs">Home</span>
          </button>
          <button
            onClick={() => nav(SCREENS.TOPICS)}
            className="flex-1 flex flex-col items-center py-3 text-slate-400 hover:text-white"
          >
            <span className="text-lg">📚</span>
            <span className="text-xs">Topics</span>
          </button>
          <button
            onClick={() => nav(SCREENS.HISTORY)}
            className="flex-1 flex flex-col items-center py-3 text-slate-400 hover:text-white"
          >
            <span className="text-lg">📈</span>
            <span className="text-xs">History</span>
          </button>
        </nav>
      )}

      {/* Screen router */}
      <div className={screen === SCREENS.DASHBOARD ? "pb-20" : ""}>
        {screen === SCREENS.DASHBOARD && (
          <Dashboard
            onStartSession={() => nav(SCREENS.STUDY)}
            onGoToTopics={() => nav(SCREENS.TOPICS)}
            onGoToHistory={() => nav(SCREENS.HISTORY)}
          />
        )}
        {screen === SCREENS.STUDY && (
          <StudyScreen
            onSessionComplete={(duration) => {
              setSessionDuration(duration);
              nav(SCREENS.SUMMARY);
            }}
            onBack={() => nav(SCREENS.DASHBOARD)}
          />
        )}
        {screen === SCREENS.SUMMARY && (
          <SessionSummary
            durationMinutes={sessionDuration}
            onBack={() => nav(SCREENS.DASHBOARD)}
          />
        )}
        {screen === SCREENS.TOPICS && (
          <TopicsLibrary onBack={() => nav(SCREENS.DASHBOARD)} />
        )}
        {screen === SCREENS.HISTORY && (
          <HistoryScreen onBack={() => nav(SCREENS.DASHBOARD)} />
        )}
      </div>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
