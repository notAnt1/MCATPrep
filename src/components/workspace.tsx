"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Pause,
  Play,
  Settings2,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getBrowserDb } from "@/lib/supabase";
import { analyze, fallbackReport } from "@/lib/analytics";
import {
  demoAnswer,
  demoCurrent,
  demoData,
  demoFinish,
  demoHint,
  demoStart,
} from "@/lib/demo";
import type {
  Attempt,
  Feedback,
  Mode,
  Question,
  Report,
  StudySession,
} from "@/lib/types";

type View = "overview" | "analysis" | "history" | "leaderboard" | "settings";
type Current = {
  session: StudySession;
  question: Question | null;
  hints_used: number;
  revealed_hints: string[];
};
const topics = [
  "Dilution",
  "Stoichiometry",
  "Enzyme kinetics",
  "Membrane transport",
  "Circuits",
  "Learning & memory",
];
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const seconds = (s: number | null) => (s === null ? "—" : `${Math.round(s)}s`);
const time = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const label = (mode: Mode) => (mode === "rapid" ? "Rapid fire" : "Training");
function friendly(message: string) {
  return /mcat_|schema cache|relation .*does not exist/i.test(message)
    ? "Database setup is pending. Run supabase/schema.sql and supabase/seed.sql in your Supabase SQL Editor, then refresh."
    : message;
}

export default function Workspace() {
  const [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(false),
    [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("overview"),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [sessions, setSessions] = useState<StudySession[]>([]);
  const [reports, setReports] = useState<Record<string, Report>>({}),
    [current, setCurrent] = useState<Current | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reportSession, setReportSession] = useState<StudySession | null>(null),
    [busy, setBusy] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [error, setError] = useState(""),
    [aiError, setAiError] = useState("");
  const [authOpen, setAuthOpen] = useState(false),
    [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState("");
  const [topic, setTopic] = useState(""),
    [paused, setPaused] = useState(false),
    [hidden, setHidden] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const [displayName, setDisplayName] = useState(""),
    [optIn, setOptIn] = useState(false),
    [leaders, setLeaders] = useState<
      { display_name: string; score: number; rounds: number }[]
    >([]);
  const timer = useRef({ ms: 0, last: 0, valid: true }),
    timerKey = useRef(""),
    lock = useRef(false),
    reportLock = useRef(false);
  const signedIn = !!user || demo;
  const owner = demo ? "demo" : user?.id || "guest";
  const all = analyze(attempts),
    finished = sessions.filter((s) => s.completed_at);
  const latest = finished.find((s) => reports[s.id]);
  const latestReport = latest
    ? reports[latest.id]
    : demo && attempts.length
      ? fallbackReport([], attempts)
      : null;
  const active = sessions.find((s) => !s.completed_at);

  useEffect(() => {
    try {
      const db = getBrowserDb();
      db.auth.getSession().then(({ data, error }) => {
        if (error) setError(error.message);
        setUser(data.session?.user || null);
        setReady(true);
      });
      const { data } = db.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
        if (session) setDemo(false);
      });
      return () => data.subscription.unsubscribe();
    } catch {
      setReady(true);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (demo) {
      const d = demoData();
      setAttempts(d.attempts);
      setSessions(d.sessions);
      return;
    }
    if (!user) {
      setAttempts([]);
      setSessions([]);
      setReports({});
      return;
    }
    const db = getBrowserDb();
    const fetched: Attempt[] = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error } = await db
        .from("mcat_attempts")
        .select("*")
        .order("created_at")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(friendly(error.message));
      fetched.push(...(data as Attempt[]));
      if (data.length < 1000) break;
    }
    const [ss, rr, pp] = await Promise.all([
      db
        .from("mcat_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("mcat_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      db.from("mcat_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    if (ss.error || rr.error || pp.error)
      throw new Error(friendly((ss.error || rr.error || pp.error)!.message));
    setAttempts(fetched);
    setSessions(ss.data as StudySession[]);
    setReports(
      Object.fromEntries(rr.data!.map((r) => [r.session_id, r.report])),
    );
    if (pp.data) {
      setDisplayName(pp.data.display_name);
      setOptIn(pp.data.leaderboard_opt_in);
    }
  }, [demo, user]);
  useEffect(() => {
    setCurrent(null);
    setReportSession(null);
    setError("");
    setReports({});
    setDisplayName("");
    setOptIn(false);
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (view === "leaderboard" && user && !demo) {
      getBrowserDb()
        .rpc("mcat_leaderboard")
        .then(({ data, error }) => {
          if (error) setError(friendly(error.message));
          else setLeaders(data || []);
        });
    }
  }, [view, user, demo]);

  useEffect(() => {
    const onVisibility = () => {
      setHidden(document.hidden);
      if (document.hidden) {
        timer.current.last = 0;
        if (timerKey.current)
          sessionStorage.setItem(
            timerKey.current,
            JSON.stringify({
              ms: timer.current.ms,
              valid: timer.current.valid,
            }),
          );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!current?.question || feedback || paused || hidden) {
      timer.current.last = 0;
      return;
    }
    timer.current.last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(),
        delta = now - timer.current.last;
      timer.current.last = now;
      if (delta > 2500) {
        timer.current.valid = false;
      } else timer.current.ms += delta;
      setElapsed(timer.current.ms);
      if (timerKey.current)
        sessionStorage.setItem(
          timerKey.current,
          JSON.stringify({ ms: timer.current.ms, valid: timer.current.valid }),
        );
    }, 200);
    return () => clearInterval(id);
  }, [current?.question?.id, feedback, paused, hidden]);

  async function work(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        friendly(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please retry.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await getBrowserDb().rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async function loadCurrent(id: string) {
    const c: Current = demo
      ? demoCurrent(id)
      : await rpc("mcat_current", { p_session: id });
    setCurrent(c);
    setFeedback(null);
    setSelected(null);
    setPaused(false);
    timerKey.current = `mcat-clock:${owner}:${id}:${c.question?.id}`;
    let saved = { ms: 0, valid: true };
    try {
      saved =
        JSON.parse(sessionStorage.getItem(timerKey.current) || "null") || saved;
    } catch {
      /* A missing local clock does not erase saved answers. */
    }
    timer.current = { ...saved, last: 0 };
    setElapsed(saved.ms);
    if (!c.question) {
      setCurrent(null);
      setReportSession(c.session);
      await refresh();
    }
  }
  function start(mode: Mode) {
    if (!signedIn) {
      setAuthOpen(true);
      return;
    }
    work(async () => {
      setReportSession(null);
      setAiError("");
      const id = demo
        ? demoStart(mode, topic || null)
        : await rpc("mcat_start", { p_mode: mode, p_topic: topic || null });
      await loadCurrent(id);
      await refresh();
    });
  }
  async function generateReport(s: StudySession) {
    if (demo || reports[s.id] || reportLock.current) return;
    reportLock.current = true;
    setAiBusy(true);
    setAiError("");
    try {
      const { data } = await getBrowserDb().auth.getSession();
      const r = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ sessionId: s.id }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Report unavailable");
      setReports((prev) => ({ ...prev, [s.id]: body.report }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Unable to generate report.");
    } finally {
      reportLock.current = false;
      setAiBusy(false);
    }
  }
  function submit() {
    if (selected === null || !current?.question) return;
    work(async () => {
      const now = performance.now();
      if (timer.current.last && now - timer.current.last < 2500)
        timer.current.ms += now - timer.current.last;
      timer.current.last = 0;
      const ms = Math.round(timer.current.ms),
        q = current.question!;
      const f: Feedback = demo
        ? demoAnswer(
            current.session.id,
            q.id,
            selected,
            ms,
            timer.current.valid,
          )
        : await rpc("mcat_answer", {
            p_session: current.session.id,
            p_question: q.id,
            p_selected: selected,
            p_active_ms: ms,
            p_timing_valid: timer.current.valid,
          });
      setFeedback(f);
      setElapsed(ms);
      sessionStorage.removeItem(timerKey.current);
      await refresh();
    });
  }
  function next() {
    if (!current) return;
    work(async () => {
      const id = current.session.id;
      const c: Current = demo
        ? demoCurrent(id)
        : await rpc("mcat_current", { p_session: id });
      if (c.session.completed_at) {
        setCurrent(null);
        setReportSession(c.session);
        await refresh();
        void generateReport(c.session);
      } else await loadCurrent(id);
    });
  }
  function finish() {
    if (!current) return;
    work(async () => {
      const id = current.session.id;
      if (demo) demoFinish(id);
      else await rpc("mcat_finish", { p_session: id });
      const c: Current = demo
        ? demoCurrent(id)
        : await rpc("mcat_current", { p_session: id });
      setCurrent(null);
      setReportSession(c.session);
      await refresh();
      if (c.session.cursor) void generateReport(c.session);
    });
  }
  function hint() {
    if (!current?.question) return;
    work(async () => {
      const c: Current = demo
        ? demoHint(current.session.id)
        : await rpc("mcat_hint", {
            p_session: current.session.id,
            p_question: current.question!.id,
          });
      setCurrent(c);
    });
  }
  function navigate(v: View) {
    setView(v);
    setReportSession(null);
    setAiError("");
  }
  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    await work(async () => {
      const db = getBrowserDb();
      const result = signup
        ? await db.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setNotice("Check your email to confirm your account, then sign in.");
      else {
        setAuthOpen(false);
        setNotice("");
        setPassword("");
      }
    });
  }
  function signOut() {
    work(async () => {
      if (!demo) {
        const { error } = await getBrowserDb().auth.signOut();
        if (error) throw error;
      }
      setDemo(false);
      setUser(null);
      setCurrent(null);
      setReportSession(null);
      setReports({});
      setView("overview");
    });
  }
  const currentAttempts = reportSession
    ? attempts.filter((a) => a.session_id === reportSession.id)
    : [];
  const sessionStats = analyze(currentAttempts);
  const shownReport = reportSession
    ? reports[reportSession.id] ||
      fallbackReport(
        currentAttempts,
        attempts.filter(
          (a) => a.created_at <= (reportSession.completed_at || ""),
        ),
      )
    : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("overview")}>
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            MCAT<span className="brand-light">prep</span>
            <small>MAKE PROGRESS PERSONAL</small>
          </span>
        </button>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "overview", title: "Overview", icon: LayoutDashboard },
              { id: "analysis", title: "My analysis", icon: BarChart3 },
              { id: "history", title: "Session history", icon: History },
              { id: "leaderboard", title: "Leaderboard", icon: Trophy },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              disabled={!!current}
              className={`nav-item ${view === n.id && !reportSession ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.title}
              {n.id === "analysis" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-icon">
            <Sparkles size={19} />
          </span>
          <h3>Every answer tells a story.</h3>
          <p>Find your patterns. Focus your practice. Build understanding.</p>
          <div className="line-art">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            disabled={!!current}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            Profile & settings
          </button>
          <div className="identity">
            <span className="avatar">
              {demo ? "D" : user ? user.email?.charAt(0).toUpperCase() : "G"}
            </span>
            <div>
              <strong>
                {demo
                  ? "Demo learner"
                  : displayName ||
                    (user ? "Your workspace" : "Guest workspace")}
              </strong>
              <small>
                {demo
                  ? "Saved on this device"
                  : user
                    ? "Personal study space"
                    : "Explore at your pace"}
              </small>
            </div>
            {signedIn && (
              <button
                className="icon-button"
                title="Sign out"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            {current
              ? "Practice session"
              : reportSession
                ? "Session report"
                : {
                    overview: "Overview",
                    analysis: "My analysis",
                    history: "Session history",
                    leaderboard: "Leaderboard",
                    settings: "Profile & settings",
                  }[view]}
          </span>
          <div>
            <span className="private-badge">
              <span />
              {demo
                ? "Local demo"
                : user
                  ? "Private workspace"
                  : "Personal beta"}
            </span>
            {!signedIn && (
              <button
                className="button small"
                onClick={() => setAuthOpen(true)}
              >
                Sign in <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {demo && (
            <div className="demo-banner">
              <CircleHelp size={16} />
              <span>
                Demo mode · practice is saved only in this browser. Reports use
                statistics; sign in for cloud history and AI.
              </span>
              <button
                onClick={() => {
                  setAuthOpen(true);
                }}
              >
                Sign in
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="empty">Opening your workspace…</div>
          ) : current?.question ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {label(current.session.mode)} / {current.question.section}
                  </p>
                  <h1>A little focus. A step forward.</h1>
                </div>
                <button
                  className="button secondary"
                  onClick={finish}
                  disabled={busy}
                >
                  Finish session
                </button>
              </div>
              <div className="quiz-layout">
                <section className="card quiz-card">
                  <div className="quiz-top">
                    <span className="pill">{current.question.topic}</span>
                    <span>
                      Question {current.session.cursor + 1} of{" "}
                      {current.session.question_ids.length}
                    </span>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${(current.session.cursor / current.session.question_ids.length) * 100}%`,
                      }}
                    />
                  </div>
                  {paused || hidden ? (
                    <div className="paused">
                      <Pause size={32} />
                      <h2>Take your time.</h2>
                      <p>
                        Active timing is paused. In rapid fire, the speed bonus
                        still uses elapsed wall time.
                      </p>
                      <button
                        className="button"
                        onClick={() => setPaused(false)}
                      >
                        Resume <Play size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {current.question.passage && (
                        <div className="passage">
                          {current.question.passage}
                        </div>
                      )}
                      <h2 className="question-text">
                        {current.question.prompt}
                      </h2>
                      <div className="answers">
                        {current.question.options.map((o, i) => (
                          <button
                            key={i}
                            disabled={!!feedback || busy}
                            className={`answer ${selected === i ? "selected" : ""} ${feedback?.answer === i ? "correct" : ""} ${feedback && selected === i && !feedback.correct ? "incorrect" : ""}`}
                            onClick={() => setSelected(i)}
                          >
                            <span>{String.fromCharCode(65 + i)}</span>
                            <div>{o}</div>
                            {feedback?.answer === i && <Check size={19} />}
                          </button>
                        ))}
                      </div>
                      {feedback ? (
                        <div
                          className={`feedback ${feedback.correct ? "success" : ""}`}
                          aria-live="polite"
                        >
                          <strong>
                            {feedback.correct
                              ? "Correct. Nicely reasoned."
                              : "A useful one to revisit."}
                          </strong>
                          <p>{feedback.explanation}</p>
                          <small>
                            {feedback.points} points · {seconds(elapsed / 1000)}{" "}
                            active time
                          </small>
                        </div>
                      ) : current.revealed_hints.length > 0 ? (
                        <div className="hint-box">
                          <strong>Think it through</strong>
                          {current.revealed_hints.map((h, i) => (
                            <p key={i}>
                              {i + 1}. {h}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="quiz-actions">
                        {!feedback && current.session.mode === "training" ? (
                          <button
                            className="text-button"
                            onClick={hint}
                            disabled={busy || current.hints_used >= 2}
                          >
                            <CircleHelp size={17} />
                            {current.hints_used === 0
                              ? "Give me a hint"
                              : current.hints_used === 1
                                ? "Walk me through it"
                                : "Both hints revealed"}
                          </button>
                        ) : (
                          <span />
                        )}
                        {feedback ? (
                          <button
                            className="button"
                            onClick={next}
                            disabled={busy}
                          >
                            {current.session.cursor + 1 ===
                            current.session.question_ids.length
                              ? "See my report"
                              : "Next question"}
                            <ArrowRight size={17} />
                          </button>
                        ) : (
                          <button
                            className="button"
                            onClick={submit}
                            disabled={selected === null || busy}
                          >
                            {busy ? "Saving…" : "Check answer"}
                            <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  <p className="fine-print">{current.question.source}</p>
                </section>
                <aside className="quiz-aside">
                  <div className="card timer-card">
                    <Clock3 size={22} />
                    <span>ACTIVE ANSWERING TIME</span>
                    <strong>{time(elapsed)}</strong>
                    <p>
                      {current.session.mode === "rapid"
                        ? `Provisional target: ${current.question.target_seconds}s. Accuracy comes first.`
                        : "No deadline. We track time to understand your patterns."}
                    </p>
                    <button
                      className="button secondary"
                      disabled={!!feedback}
                      onClick={() => setPaused(!paused)}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
                      {paused ? "Resume" : "Pause"}
                    </button>
                  </div>
                  <div className="card note-card">
                    <Sparkles size={20} />
                    <h3>More than right or wrong</h3>
                    <p>
                      Your report considers timing, hints, and first attempts. A
                      slower correct answer can be progress, too.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : reportSession && shownReport ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    SESSION COMPLETE · {label(reportSession.mode)}
                  </p>
                  <h1>Here’s what you learned.</h1>
                  <p>
                    {date(reportSession.created_at)} · {currentAttempts.length}{" "}
                    questions answered
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setReportSession(null);
                    setView("analysis");
                  }}
                >
                  My overall analysis <ArrowRight size={16} />
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  title="Accuracy"
                  value={
                    sessionStats.accuracy === null
                      ? "—"
                      : `${sessionStats.accuracy}%`
                  }
                  note="This session"
                  icon={<Target />}
                />
                <Stat
                  title="Typical answer time"
                  value={seconds(sessionStats.medianSeconds)}
                  note="Median valid active time"
                  icon={<Clock3 />}
                />
                <Stat
                  title="Session points"
                  value={`${reportSession.score}`}
                  note="Repeat questions earn no points"
                  icon={<Zap />}
                />
              </div>
              <ReportPanel
                report={shownReport}
                ai={!!reports[reportSession.id]}
                loading={aiBusy}
              />
              {aiError && (
                <p className="alert" role="alert">
                  {aiError}
                </p>
              )}
              {!demo &&
                !reports[reportSession.id] &&
                currentAttempts.length > 0 && (
                  <button
                    className="button secondary"
                    disabled={aiBusy}
                    onClick={() => generateReport(reportSession)}
                  >
                    <Sparkles size={16} />
                    {aiBusy
                      ? "Preparing your analysis…"
                      : "Generate / retry AI report"}
                  </button>
                )}
              <TopicTable attempts={currentAttempts} session />
              <section className="card answer-review">
                <h2>Answer review</h2>
                <p>Your first answers, timing, and assistance.</p>
                {currentAttempts.map((a, i) => (
                  <div className="review-row" key={a.question_id}>
                    <span
                      className={`review-icon ${a.correct ? "good" : "bad"}`}
                    >
                      {a.correct ? <Check size={15} /> : <X size={15} />}
                    </span>
                    <strong>
                      {i + 1}. {a.topic}
                    </strong>
                    <span>
                      {a.hints_used
                        ? "Assisted"
                        : a.repeated
                          ? "Repeated"
                          : "Independent"}
                    </span>
                    <span>
                      {seconds(a.active_ms / 1000)}
                      {!a.timing_valid ? " · excluded" : ""}
                    </span>
                  </div>
                ))}
              </section>
            </>
          ) : view === "overview" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">SMALL STEPS. CLEARER PROGRESS.</p>
                  <h1>
                    Your next breakthrough
                    <br />
                    starts with a question.
                  </h1>
                  <p>
                    Practice with purpose. Understand your patterns. Make the
                    next session count.
                  </p>
                </div>
                <div className="date-tag">
                  <span>YOUR MCAT JOURNEY</span>
                  <strong>One session at a time.</strong>
                  <span className="tiny-line" />
                </div>
              </div>
              <div className="stats-grid">
                <Stat
                  title="Questions answered"
                  value={`${all.answered}`}
                  note={
                    all.answered
                      ? "Every attempt is a learning signal"
                      : "Your first session starts the story"
                  }
                  icon={<BookOpen />}
                />
                <Stat
                  title="Overall accuracy"
                  value={all.accuracy === null ? "—" : `${all.accuracy}%`}
                  note="Includes assisted and repeat answers"
                  icon={<Target />}
                />
                <Stat
                  title="Focused practice"
                  value={`${all.activeMinutes} min`}
                  note={`${finished.length} completed sessions`}
                  icon={<Clock3 />}
                />
              </div>
              <div className="section-heading">
                <h2>Find your focus</h2>
                <label className="topic-select">
                  Practice topic{" "}
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    <option value="">A balanced mix</option>
                    {topics.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mode-grid">
                <button
                  className="mode-card training"
                  disabled={busy}
                  onClick={() => start("training")}
                >
                  <span className="mode-icon">
                    <BookOpen size={25} />
                  </span>
                  <span className="mode-kicker">BUILD UNDERSTANDING</span>
                  <h2>Training</h2>
                  <p>
                    Room to think. Hints when you need them.
                    <br />
                    Understand the why behind every answer.
                  </p>
                  <div className="mode-tags">
                    <span>No time limit</span>
                    <span>Guided hints</span>
                  </div>
                  <div className="mode-footer">
                    <strong>
                      {active ? "Resume practice" : "Start training"}
                    </strong>
                    <span>
                      <ArrowRight size={21} />
                    </span>
                  </div>
                </button>
                <button
                  className="mode-card rapid"
                  disabled={busy}
                  onClick={() => start("rapid")}
                >
                  <span className="mode-icon">
                    <Zap size={25} />
                  </span>
                  <span className="mode-kicker">BUILD CONFIDENCE & PACE</span>
                  <h2>Rapid fire</h2>
                  <p>
                    Quick decisions. Clear feedback.
                    <br />
                    Find the balance between speed and accuracy.
                  </p>
                  <div className="mode-tags">
                    <span>Speed bonus</span>
                    <span>Up to 10 questions</span>
                  </div>
                  <div className="mode-footer">
                    <strong>
                      {active ? "Resume practice" : "Take the challenge"}
                    </strong>
                    <span>
                      <ArrowRight size={21} />
                    </span>
                  </div>
                </button>
              </div>
              {active && (
                <div className="resume-banner">
                  <Play size={17} />
                  <span>
                    You have an unfinished {label(active.mode).toLowerCase()}{" "}
                    session. Starting practice resumes it.
                  </span>
                  <button onClick={() => work(() => loadCurrent(active.id))}>
                    Resume <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="bottom-grid">
                <section className="card insight-card">
                  <div className="section-heading">
                    <h2>
                      <Sparkles size={19} /> Your learning signal
                    </h2>
                    <span className="pill">PERSONAL INSIGHTS</span>
                  </div>
                  <h3>
                    {latestReport
                      ? "Your progress, in perspective."
                      : all.answered
                        ? "Your patterns are taking shape."
                        : "A clearer picture begins here."}
                  </h3>
                  <p>
                    {latestReport?.overall_summary ||
                      "After a session, see where accuracy and timing line up—and where a little focused practice could help. Your profile grows with your history."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("analysis")}
                  >
                    Explore my analysis <ArrowRight size={17} />
                  </button>
                </section>
                <section className="card recent-card">
                  <div className="section-heading">
                    <h2>Recent sessions</h2>
                    <button
                      className="icon-button"
                      aria-label="View all sessions"
                      onClick={() => navigate("history")}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                  {finished.length ? (
                    finished.slice(0, 3).map((s) => (
                      <button
                        className="session-link"
                        key={s.id}
                        onClick={() => {
                          setReportSession(s);
                          setAiError("");
                        }}
                      >
                        <span className={`session-icon ${s.mode}`}>
                          {s.mode === "training" ? (
                            <BookOpen size={18} />
                          ) : (
                            <Zap size={18} />
                          )}
                        </span>
                        <span>
                          <strong>{label(s.mode)}</strong>
                          <small>
                            {date(s.created_at)} · {s.cursor} answers
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-small">
                      <History size={27} />
                      <strong>A fresh start.</strong>
                      <p>Your completed sessions will appear here.</p>
                    </div>
                  )}
                </section>
              </div>
              {!signedIn && (
                <div className="guest-cta">
                  <span>Want to try the experience first?</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDemo(true);
                      setError("");
                    }}
                  >
                    Explore a local demo <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <p className="fine-print">
                Starter bank: 36 original foundational questions across six
                topics. Not a full MCAT simulation; CARS and passage-based
                practice are not yet included.
              </p>
            </>
          ) : view === "analysis" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR PERSISTENT LEARNING PROFILE</p>
                  <h1>Understand your patterns.</h1>
                  <p>
                    Accuracy is one signal. Timing, assistance, and fresh
                    attempts complete the picture.
                  </p>
                </div>
                <span className="pill">
                  {all.answered} ANSWERS IN YOUR HISTORY
                </span>
              </div>
              {latestReport ? (
                <>
                  <ReportPanel report={latestReport} ai={!demo} overall />
                  <p className="fine-print">
                    {demo
                      ? "Demo profile calculated from this browser’s history."
                      : `AI profile updated after the ${date(latest!.created_at)} session.`}{" "}
                    The topic table below always reflects your loaded history.
                  </p>
                </>
              ) : (
                <section className="card empty">
                  <Sparkles size={32} />
                  <h2>
                    {all.answered
                      ? "Your statistics are ready."
                      : "Your profile starts with practice."}
                  </h2>
                  <p>
                    {all.answered
                      ? "Open a completed session to generate its AI report."
                      : "Complete a session to begin discovering your strengths and practice priorities."}
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      all.answered ? navigate("history") : start("training")
                    }
                  >
                    {all.answered ? "View sessions" : "Start training"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              )}
              <TopicTable attempts={attempts} />
              <section className="card methodology">
                <h3>How to read your profile</h3>
                <div>
                  <p>
                    <strong>Fresh evidence.</strong> Topic assessments use up to
                    20 recent, independent first attempts. Repeats and hinted
                    answers stay in your history, but do not inflate these
                    estimates.
                  </p>
                  <p>
                    <strong>Timing in context.</strong> Training and rapid-fire
                    times are listed separately. Targets are provisional; pauses
                    and hidden tabs are excluded. Interrupted timing is flagged.
                  </p>
                  <p>
                    <strong>Room for uncertainty.</strong> Fewer than five
                    independent answers means “needs more evidence.” These are
                    practice patterns, never a predicted MCAT score.
                  </p>
                </div>
              </section>
            </>
          ) : view === "history" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR PRACTICE LOG</p>
                  <h1>Every session builds on the last.</h1>
                  <p>
                    Revisit your results and the thinking behind your next
                    steps.
                  </p>
                </div>
              </div>
              <section className="card history-list">
                {sessions.length ? (
                  sessions.map((s) => (
                    <button
                      className="session-link"
                      key={s.id}
                      onClick={() =>
                        s.completed_at
                          ? (setReportSession(s), setAiError(""))
                          : work(() => loadCurrent(s.id))
                      }
                    >
                      <span className={`session-icon ${s.mode}`}>
                        {s.mode === "training" ? <BookOpen /> : <Zap />}
                      </span>
                      <span>
                        <strong>{label(s.mode)}</strong>
                        <small>
                          {date(s.created_at)} · {s.cursor}/
                          {s.question_ids.length} answers
                        </small>
                      </span>
                      <span className="history-status">
                        {s.completed_at ? `${s.score} points` : "In progress"}
                      </span>
                      <span className="pill">
                        {reports[s.id]
                          ? "AI report"
                          : s.completed_at
                            ? "View results"
                            : "Resume"}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="A clean slate."
                    text="Finish your first session and it will appear here."
                  />
                )}
              </section>
            </>
          ) : view === "leaderboard" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">A LITTLE FRIENDLY MOMENTUM</p>
                  <h1>The weekly leaderboard.</h1>
                  <p>
                    Rapid-fire points from completed rounds. Fresh questions
                    count; repeat answers earn zero.
                  </p>
                </div>
                <Trophy size={40} className="muted" />
              </div>
              <section className="card">
                {!user || demo ? (
                  <Empty
                    title="Join with your account."
                    text="The leaderboard is shared by signed-in learners who opt in. Demo scores stay on this device."
                  />
                ) : leaders.length ? (
                  leaders.map((l, i) => (
                    <div className="leader-row" key={i}>
                      <strong className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </strong>
                      <strong>{l.display_name}</strong>
                      <span>{l.rounds} rounds</span>
                      <b>{l.score} pts</b>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="The week is wide open."
                    text="Opt in from your profile, then complete a rapid-fire round to get started."
                  />
                )}
              </section>
              <p className="fine-print">
                Week begins Monday UTC. Rankings are a casual game, not a
                measure of MCAT readiness. Different topic selections are not
                difficulty-calibrated.
              </p>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR SPACE, YOUR PREFERENCES</p>
                  <h1>Profile & settings.</h1>
                </div>
              </div>
              <section className="card settings-card">
                <h2>Your public nickname</h2>
                <p>
                  Your email and learning reports are never shown on the
                  leaderboard.
                </p>
                <label>
                  Display name
                  <input
                    maxLength={30}
                    placeholder="Choose a nickname"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                  />
                  Show my nickname and rapid-fire scores on the leaderboard
                </label>
                <button
                  className="button"
                  disabled={!user || demo || busy || !displayName.trim()}
                  onClick={() =>
                    work(async () => {
                      const { error } = await getBrowserDb()
                        .from("mcat_profiles")
                        .upsert({
                          user_id: user!.id,
                          display_name: displayName.trim(),
                          leaderboard_opt_in: optIn,
                        });
                      if (error) throw error;
                      setNotice("Profile saved.");
                    })
                  }
                >
                  Save profile <Check size={17} />
                </button>
                {notice && <p role="status">{notice}</p>}
                {!user && (
                  <p className="fine-print">Sign in to save a profile.</p>
                )}
              </section>
              <section className="card methodology">
                <h3>About this beta</h3>
                <p>
                  Original AI-authored starter questions; no official
                  affiliation. Core accuracy and timing metrics are calculated
                  by the app. AI interprets those metrics after completed
                  sessions. Summaries can be wrong; check the evidence table.
                </p>
                <p>
                  AI reports send topic-level performance statistics to OpenAI,
                  without your email or nickname. Live tutoring and automatic
                  book ingestion are not enabled in this first version.
                </p>
              </section>
            </>
          )}
          <footer>
            <span>
              <Activity size={14} /> MCATprep
            </span>
            <span>A little more understanding, every day.</span>
            <span>PERSONAL BETA · 01</span>
          </footer>
        </div>
      </main>
      {authOpen && (
        <div className="modal-overlay" onClick={() => setAuthOpen(false)}>
          <section
            className="auth-modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              aria-label="Close sign in"
              onClick={() => setAuthOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="brand-mark">
              <GraduationCap size={25} />
            </span>
            <p className="eyebrow">YOUR PROGRESS BELONGS HERE</p>
            <h2 id="auth-title">
              {signup ? "Start your study space." : "Welcome back."}
            </h2>
            <p>
              Save your sessions and build a clearer picture of your learning.
            </p>
            <form onSubmit={authenticate}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  minLength={8}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="button" disabled={busy}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
            {notice && <p role="status">{notice}</p>}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setNotice("");
              }}
            >
              {signup
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
            <p className="fine-print">
              Your detailed practice history is private. Leaderboard
              participation is optional.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="stat card">
      <div>
        <span>{title}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <BookOpen size={29} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function ReportPanel({
  report,
  ai,
  loading = false,
  overall = false,
}: {
  report: Report;
  ai: boolean;
  loading?: boolean;
  overall?: boolean;
}) {
  const strengths = overall ? report.overall_strengths : report.strengths,
    weaknesses = overall ? report.overall_weaknesses : report.weaknesses,
    steps = overall ? report.overall_next_steps : report.next_steps;
  return (
    <section className="card report-panel">
      <div className="section-heading">
        <h2>
          <Sparkles size={20} />
          {overall ? "Your learning profile" : "Your session, understood"}
        </h2>
        <span className="pill">
          {loading
            ? "ANALYZING…"
            : ai
              ? "AI + YOUR EVIDENCE"
              : "STATISTICS SUMMARY"}
        </span>
      </div>
      <p className="report-intro">
        {overall ? report.overall_summary : report.session_summary}
      </p>
      <div className="report-columns">
        <div>
          <span className="eyebrow green">STRENGTHS TO BUILD ON</span>
          {strengths.length ? (
            strengths.map((s, i) => <p key={i}>{s}</p>)
          ) : (
            <p>
              More independent practice will help identify reliable strengths.
            </p>
          )}
        </div>
        <div>
          <span className="eyebrow amber">WHERE TO FOCUS</span>
          {weaknesses.length ? (
            weaknesses.map((s, i) => <p key={i}>{s}</p>)
          ) : (
            <p>
              No clear priority emerged from this sample. Keep broadening your
              practice.
            </p>
          )}
        </div>
      </div>
      <div className="next-steps">
        <h3>Your next steps</h3>
        {steps.map((s, i) => (
          <p key={i}>
            <span>{i + 1}</span>
            {s}
          </p>
        ))}
      </div>
      <p className="fine-print">{report.caveat}</p>
    </section>
  );
}
function TopicTable({
  attempts,
  session = false,
}: {
  attempts: Attempt[];
  session?: boolean;
}) {
  const stats = analyze(attempts);
  return (
    <section className="card topic-card">
      <div className="section-heading">
        <div>
          <h2>{session ? "This session by topic" : "Your topic map"}</h2>
          <p>
            {session
              ? "All first submissions, including assisted answers."
              : "Recent accuracy uses up to 20 independent first attempts per topic."}
          </p>
        </div>
        <BarChart3 size={20} className="muted" />
      </div>
      {!stats.topics.length ? (
        <div className="empty-small">
          <p>Topic-level evidence will appear after your first answers.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>TOPIC</th>
                <th>{session ? "ACCURACY" : "RECENT ACCURACY"}</th>
                <th>EVIDENCE</th>
                <th>MEDIAN TIME · CORRECT</th>
                <th>{session ? "TIMING SIGNALS" : "ASSESSMENT"}</th>
              </tr>
            </thead>
            <tbody>
              {stats.topics.map((t) => (
                <tr key={t.topic}>
                  <td>
                    <strong>{t.topic}</strong>
                    <small>
                      {t.assisted} assisted · {t.repeats} repeated
                    </small>
                  </td>
                  <td>
                    <div className="accuracy">
                      <strong>
                        {(session ? t.accuracy : t.recentAccuracy) === null
                          ? "—"
                          : `${session ? t.accuracy : t.recentAccuracy}%`}
                      </strong>
                      <span>
                        <i
                          style={{
                            width: `${(session ? t.accuracy : t.recentAccuracy) || 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td>
                    {session ? t.attempts : t.recentSample}
                    <small>
                      {session ? "answers" : "independent first attempts"}
                    </small>
                  </td>
                  <td>
                    {t.timing
                      .filter((m) => m.sample)
                      .map((m) => (
                        <small className="timing-line" key={m.mode}>
                          {label(m.mode)}: {seconds(m.medianCorrectSeconds)}{" "}
                          <span>({m.sample} timed)</span>
                        </small>
                      ))}
                    {t.timing.every((m) => !m.sample) && "—"}
                  </td>
                  <td>
                    {session ? (
                      <small>
                        {t.timing.reduce((n, m) => n + m.slowCorrect, 0)} slow
                        correct
                        <br />
                        {t.timing.reduce((n, m) => n + m.fastMisses, 0)} fast
                        misses
                      </small>
                    ) : (
                      <span
                        className={`status ${t.status === "Priority practice" ? "amber" : t.status === "Developing strength" ? "green" : ""}`}
                      >
                        {t.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine-print">
        Provisional timing targets, not population norms. Statistics are
        descriptive; small samples cannot establish mastery.
      </p>
    </section>
  );
}
