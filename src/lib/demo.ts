import { questions } from "./questions";
import { Attempt, Feedback, Mode, StudySession } from "./types";
type DemoData = {
  sessions: StudySession[];
  attempts: Attempt[];
  hints: number;
  started: number;
};
const key = "mcat-demo-v1";
export function demoData(): DemoData {
  try {
    return (
      JSON.parse(localStorage.getItem(key) || "null") || {
        sessions: [],
        attempts: [],
        hints: 0,
        started: 0,
      }
    );
  } catch {
    return { sessions: [], attempts: [], hints: 0, started: 0 };
  }
}
const save = (d: DemoData) => localStorage.setItem(key, JSON.stringify(d));
export function demoStart(mode: Mode, topic: string | null) {
  const d = demoData(),
    active = d.sessions.find((s) => !s.completed_at);
  if (active) return active.id;
  const q = questions
    .filter((q) => !topic || q.topic === topic)
    .map((q) => ({
      q,
      seen: d.attempts.filter((a) => a.question_id === q.id).length,
      rand: Math.random(),
    }))
    .sort((a, b) => a.seen - b.seen || a.rand - b.rand)
    .slice(0, 10);
  const s: StudySession = {
    id: crypto.randomUUID(),
    mode,
    question_ids: q.map((x) => x.q.id),
    cursor: 0,
    score: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  d.sessions.unshift(s);
  d.hints = 0;
  d.started = 0;
  save(d);
  return s.id;
}
export function demoCurrent(id: string) {
  const d = demoData(),
    s = d.sessions.find((s) => s.id === id)!;
  if (!d.started) {
    d.started = Date.now();
    save(d);
  }
  const q = s.completed_at
    ? null
    : questions.find((q) => q.id === s.question_ids[s.cursor])!;
  return {
    session: s,
    question: q,
    hints_used: d.hints,
    revealed_hints: q?.hints.slice(0, d.hints) || [],
  };
}
export function demoHint(id: string) {
  const d = demoData();
  d.hints = Math.min(2, d.hints + 1);
  save(d);
  return demoCurrent(id);
}
export function demoAnswer(
  id: string,
  qid: string,
  selected: number,
  ms: number,
  valid: boolean,
): Feedback {
  const d = demoData(),
    s = d.sessions.find((s) => s.id === id)!,
    q = questions.find((q) => q.id === qid)!;
  const previous = d.attempts.find(
    (a) => a.session_id === id && a.question_id === qid,
  );
  if (previous)
    return {
      correct: previous.correct,
      answer: q.answer,
      explanation: q.explanation,
      points: previous.points,
    };
  const repeated = d.attempts.some((a) => a.question_id === qid),
    correct = selected === q.answer;
  const points =
    correct && !repeated
      ? 100 +
        (s.mode === "rapid"
          ? Math.max(
              0,
              Math.round(
                50 *
                  (1 -
                    Math.min(
                      1,
                      (Date.now() - d.started) / 1000 / q.target_seconds,
                    )),
              ),
            )
          : 0)
      : 0;
  d.attempts.push({
    session_id: id,
    question_id: qid,
    question_version: q.version,
    selected,
    topic: q.topic,
    section: q.section,
    skill: q.skill,
    mode: s.mode,
    correct,
    active_ms: ms,
    target_seconds: q.target_seconds,
    hints_used: d.hints,
    repeated,
    timing_valid: valid && ms >= 1000,
    points,
    created_at: new Date().toISOString(),
  });
  s.cursor++;
  s.score += points;
  if (s.cursor === s.question_ids.length)
    s.completed_at = new Date().toISOString();
  d.hints = 0;
  d.started = 0;
  save(d);
  return { correct, answer: q.answer, explanation: q.explanation, points };
}
export function demoFinish(id: string) {
  const d = demoData(),
    s = d.sessions.find((s) => s.id === id)!;
  s.completed_at ||= new Date().toISOString();
  save(d);
}
