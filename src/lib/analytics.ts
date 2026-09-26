import { Attempt, Report } from "./types";
export function median(v: number[]) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
export function analyze(attempts: Attempt[]) {
  const sorted = [...attempts].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const topics = [...new Set(sorted.map((a) => a.topic))]
    .map((topic) => {
      const all = sorted.filter((a) => a.topic === topic);
      const independent = all.filter((a) => !a.repeated && !a.hints_used);
      const recent = independent.slice(-20),
        previous = independent.slice(-40, -20);
      const acc = pct(recent.filter((a) => a.correct).length, recent.length);
      const timed = recent.filter((a) => a.timing_valid);
      const status =
        recent.length < 5
          ? "Needs more evidence"
          : acc !== null && acc < 65
            ? "Priority practice"
            : acc !== null && acc >= 80
              ? "Developing strength"
              : "Building fluency";
      return {
        topic,
        attempts: all.length,
        independent: independent.length,
        accuracy: pct(all.filter((a) => a.correct).length, all.length),
        recentAccuracy: acc,
        assisted: all.filter((a) => a.hints_used > 0).length,
        repeats: all.filter((a) => a.repeated).length,
        status,
        recentSample: recent.length,
        previousAccuracy: pct(
          previous.filter((a) => a.correct).length,
          previous.length,
        ),
        previousSample: previous.length,
        lastPracticed: all.at(-1)?.created_at,
        timing: (["training", "rapid"] as const).map((mode) => {
          const t = timed.filter((a) => a.mode === mode);
          return {
            mode,
            sample: t.length,
            medianCorrectSeconds: median(
              t.filter((a) => a.correct).map((a) => a.active_ms / 1000),
            ),
            medianIncorrectSeconds: median(
              t.filter((a) => !a.correct).map((a) => a.active_ms / 1000),
            ),
            slowCorrect: t.filter(
              (a) => a.correct && a.active_ms / 1000 > a.target_seconds * 1.25,
            ).length,
            fastMisses: t.filter(
              (a) => !a.correct && a.active_ms / 1000 < a.target_seconds * 0.5,
            ).length,
          };
        }),
      };
    })
    .sort((a, b) => (a.recentAccuracy ?? 101) - (b.recentAccuracy ?? 101));
  return {
    answered: attempts.length,
    accuracy: pct(attempts.filter((a) => a.correct).length, attempts.length),
    activeMinutes:
      Math.round(attempts.reduce((n, a) => n + a.active_ms, 0) / 6000) / 10,
    medianSeconds: median(
      attempts.filter((a) => a.timing_valid).map((a) => a.active_ms / 1000),
    ),
    topics,
  };
}
export function fallbackReport(current: Attempt[], history: Attempt[]): Report {
  const s = analyze(current),
    all = analyze(history);
  const weakest = s.topics.filter(
    (t) => (t.accuracy ?? 100) < 80 || t.timing.some((m) => m.slowCorrect > 0),
  );
  return {
    session_summary: current.length
      ? `You answered ${s.answered} question${s.answered === 1 ? "" : "s"} with ${s.accuracy}% accuracy. Review accuracy together with timing and hint use below.`
      : "No answers were recorded in this session.",
    overall_summary: `Your history contains ${all.answered} answer${all.answered === 1 ? "" : "s"} across ${all.topics.length} topic${all.topics.length === 1 ? "" : "s"}. These are descriptive practice statistics, not a prediction of your MCAT score.`,
    strengths: s.topics
      .filter((t) => t.status === "Developing strength")
      .map(
        (t) =>
          `${t.topic}: ${t.recentAccuracy}% across ${t.recentSample} independent first attempts this session.`,
      ),
    weaknesses: weakest.map(
      (t) =>
        `${t.topic}: ${t.accuracy}% on ${t.attempts} question${t.attempts === 1 ? "" : "s"} this session. ${t.timing
          .filter((m) => m.slowCorrect > 0)
          .map(
            (m) =>
              `${m.slowCorrect} correct ${m.mode === "rapid" ? "rapid-fire" : "training"} answer(s) took more than 1.25 times the provisional target.`,
          )
          .join(
            " ",
          )} ${t.attempts < 5 ? "Small sample; treat this as a review suggestion." : ""}`,
    ),
    next_steps: weakest.length
      ? weakest
          .slice(0, 3)
          .map(
            (t) => `Review ${t.topic}, then try a new question without hints.`,
          )
      : ["Try a fresh mix of topics to broaden the evidence."],
    overall_strengths: all.topics
      .filter((t) => t.status === "Developing strength")
      .map(
        (t) =>
          `${t.topic}: ${t.recentAccuracy}% across ${t.recentSample} independent first attempts.`,
      ),
    overall_weaknesses: all.topics
      .filter((t) => t.status === "Priority practice")
      .map(
        (t) =>
          `${t.topic}: ${t.recentAccuracy}% across ${t.recentSample} independent first attempts. Prioritize concept review.`,
      ),
    overall_next_steps: all.topics.some((t) => t.status === "Priority practice")
      ? all.topics
          .filter((t) => t.status === "Priority practice")
          .slice(0, 3)
          .map((t) => `Try new ${t.topic} questions after a focused review.`)
      : ["Try new questions across several topics to build stronger evidence."],
    caveat:
      "Statistics-only report. Timing targets are provisional. Assisted and repeated answers are excluded from independent mastery estimates. Fewer than five independent answers is insufficient evidence.",
  };
}
