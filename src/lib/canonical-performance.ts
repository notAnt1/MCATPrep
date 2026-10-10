import type { Attempt } from "./types";
import { annotationMatches, type Annotation } from "./canonical-topics";
export type EvidenceAttempt = Attempt & {
  family_id?: string;
  passage_id?: string | null;
  exposure_known?: boolean;
  prior_hint?: boolean;
  prior_answer?: boolean;
  prior_solution?: boolean;
  prior_item?: boolean;
  prior_passage?: boolean;
  annotation?: Annotation | null;
  difficulty?: string;
  difficulty_status?: string;
};
export type PerformanceOptions = {
  section?: string;
  since?: string;
  until?: string;
  sessionId?: string;
  completedSessionIds?: string[];
  integrated?: boolean;
  mode?: string;
};
export function summarizeTarget(
  history: EvidenceAttempt[],
  bank: Annotation[],
  target: string,
  options: PerformanceOptions = {},
) {
  const annotations = new Map(bank.map((a) => [a.question_id, a]));
  const sorted = [...history].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      (a.id || "").localeCompare(b.id || ""),
  );
  const seen = new Set<string>();
  const fresh: EvidenceAttempt[] = [];
  const learning: EvidenceAttempt[] = [];
  let unknown = 0,
    assisted = 0,
    improved = 0;
  const firstOutcome = new Map<string, boolean>();
  for (const a of sorted) {
    const tag = a.annotation || annotations.get(a.question_id);
    const family = a.family_id || tag?.family_id || a.question_id;
    const first = !seen.has(family);
    seen.add(family);
    if (first) firstOutcome.set(family, a.correct);
    // Lifetime eligibility is settled BEFORE date, section or session filtering.
    const eligible =
      first &&
      a.exposure_known === true &&
      !a.repeated &&
      !a.hints_used &&
      !a.prior_hint &&
      !a.prior_answer &&
      !a.prior_solution &&
      !a.prior_item;
    if (
      !tag ||
      (!a.annotation && a.question_version !== tag.content_version) ||
      !annotationMatches(tag, target, options.integrated) ||
      (options.completedSessionIds &&
        !options.completedSessionIds.includes(a.session_id)) ||
      (options.section && a.section !== options.section) ||
      (options.mode && a.mode !== options.mode) ||
      (options.since && a.created_at < options.since) ||
      (options.until && a.created_at > options.until) ||
      (options.sessionId && a.session_id !== options.sessionId)
    )
      continue;
    if (eligible) fresh.push(a);
    else {
      learning.push(a);
      if (!a.exposure_known) unknown++;
      if (a.hints_used || a.prior_hint || a.prior_answer || a.prior_solution)
        assisted++;
      if (!first && a.correct && firstOutcome.get(family) === false) improved++;
    }
  }
  const correct = fresh.filter((a) => a.correct).length,
    count = fresh.length;
  const contexts = new Set(
    fresh.map(
      (a) =>
        a.passage_id ||
        a.annotation?.passage_id ||
        annotations.get(a.question_id)?.passage_id ||
        a.family_id ||
        a.question_id,
    ),
  ).size;
  const available = new Set(
    bank
      .filter(
        (a) =>
          a.published !== false &&
          (!options.section || a.section === options.section) &&
          annotationMatches(a, target, options.integrated),
      )
      .map((a) => a.family_id),
  ).size;
  const accuracy = count ? (correct / count) * 100 : null;
  const limited = count > 0 && (count < 10 || contexts < 3);
  const difficulty: Record<string, number> = {};
  for (const a of fresh) {
    const tag = a.annotation || annotations.get(a.question_id);
    const key = `${a.difficulty || tag?.difficulty || "Unknown"} (${a.difficulty_status || tag?.difficulty_status || "unknown"})`;
    difficulty[key] = (difficulty[key] || 0) + 1;
  }
  return {
    target,
    available,
    count,
    correct,
    contexts,
    accuracy,
    limited,
    state: count
      ? limited
        ? "limited"
        : accuracy! < 65
          ? "low"
          : accuracy! < 80
            ? "mid"
            : "high"
      : available
        ? "unattempted"
        : "unavailable",
    learning: learning.length,
    learningCorrect: learning.filter((a) => a.correct).length,
    unknown,
    assisted,
    improved,
    difficulty,
    priorPassage: fresh.filter((a) => a.prior_passage).length,
  };
}
