"use client";
import { useMemo, useState } from "react";
import {
  taxonomy,
  groups,
  sections,
  searchTopics,
  targetLabel,
  type Annotation,
} from "@/lib/canonical-topics";
import {
  summarizeTarget,
  type EvidenceAttempt,
} from "@/lib/canonical-performance";
export function TopicHeatmap({
  attempts,
  bank,
  sessionId,
  completedSessionIds,
  ready = true,
  unanswered = 0,
}: {
  attempts: EvidenceAttempt[];
  bank: Annotation[];
  sessionId?: string;
  completedSessionIds?: string[];
  ready?: boolean;
  unanswered?: number;
}) {
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [openTopics, setOpenTopics] = useState<string[]>([]);
  const [section, setSection] = useState(""),
    [query, setQuery] = useState(""),
    [window, setWindow] = useState("all"),
    [integrated, setIntegrated] = useState(false),
    [selected, setSelected] = useState(""),
    [mode, setMode] = useState(""),
    [onlyAvailable, setOnlyAvailable] = useState(false);
  const since =
    window === "30"
      ? new Date(Date.now() - 30 * 86400000).toISOString()
      : undefined;
  const options = {
    section,
    since,
    integrated,
    sessionId,
    completedSessionIds,
    mode,
  };
  const cache = useMemo(
    () => new Map<string, ReturnType<typeof summarizeTarget>>(),
    [
      attempts,
      bank,
      section,
      window,
      integrated,
      sessionId,
      completedSessionIds,
      mode,
    ],
  );
  const stats = (id: string) => {
    let v = cache.get(id);
    if (!v) {
      v = summarizeTarget(attempts, bank, id, options);
      cache.set(id, v);
    }
    return v;
  };
  const matches = searchTopics(query, section).filter(
    (t) => !onlyAvailable || stats(t.id).available || stats(t.id).count,
  );
  const active = selected ? stats(selected) : null;
  const label = (s: ReturnType<typeof stats>) =>
    s.state === "unavailable"
      ? "No questions available yet"
      : s.state === "unattempted"
        ? "Not yet attempted"
        : s.limited
          ? "Limited evidence"
          : "First-exposure accuracy";
  const tile = (id: string) => (
    <button
      key={id}
      className={"heatmap-tile " + stats(id).state}
      aria-pressed={selected === id}
      onClick={() => setSelected(id)}
    >
      <span className="heatmap-name">{targetLabel(id)}</span>
      <strong>
        {stats(id).accuracy === null
          ? "—"
          : Math.round(stats(id).accuracy!) + "%"}
      </strong>
      <span>{label(stats(id))}</span>
      <span>
        {stats(id).correct}/{stats(id).count} correct · {stats(id).contexts}{" "}
        contexts
      </span>
      <span>{stats(id).available} available</span>
    </button>
  );
  const held = attempts.filter((a) => {
    const tag =
      a.annotation ||
      bank.find(
        (b) =>
          b.question_id === a.question_id &&
          b.content_version === a.question_version,
      );
    return !tag || tag.review_status === "needs-review";
  }).length;
  const skillBank = bank.map((a) => ({
    ...a,
    primary: a.skill,
    secondary: a.secondary_skills,
  }));
  const skillAttempts = attempts.map((a) => ({
    ...a,
    annotation: a.annotation
      ? {
          ...a.annotation,
          primary: a.annotation.skill,
          secondary: a.annotation.secondary_skills,
        }
      : a.annotation,
  }));
  if (!ready)
    return (
      <section className="card topic-card">
        <h2>Topic heat map</h2>
        <p>
          Sign in or use the demo to load question availability and your
          history. If already signed in, the topic catalog is temporarily
          unavailable.
        </p>
      </section>
    );
  return (
    <section className="card topic-card topic-map">
      <h2>{sessionId ? "Session topic heat map" : "Topic heat map"}</h2>
      <p>Performance on questions targeting this topic.</p>
      <div className="map-controls">
        <label>
          Section
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Combined canonical topics</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Find a topic
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search labels, aliases, or concepts"
          />
        </label>
        <label>
          Time window
          <select value={window} onChange={(e) => setWindow(e.target.value)}>
            <option value="all">All time</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">Timed & untimed</option>
            <option value="rapid">Timed (rapid fire)</option>
            <option value="training">Untimed (training)</option>
          </select>
        </label>
      </div>
      <div className="canonical-options">
        <label>
          <input
            type="checkbox"
            checked={integrated}
            onChange={(e) => setIntegrated(e.target.checked)}
          />{" "}
          Include essential secondary targets
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />{" "}
          Available or attempted topics only
        </label>
      </div>
      <p>
        {integrated
          ? "Questions involving this topic; a miss does not identify which required concept caused it."
          : "Primary targets only."}{" "}
        {window === "30" ? "Last 30 days ending today." : "All-time history."}{" "}
        {sessionId
          ? "Filtered to this session; first exposure is still determined over lifetime history."
          : ""}
      </p>
      <div className="heatmap-legend">
        <span className="low">Below 65%</span>
        <span className="mid">65–79%</span>
        <span className="high">80–100%</span>
        <span>Limited evidence: fewer than 10 questions or 3 contexts</span>
      </div>
      {active && (
        <div className="topic-detail" role="region" aria-label="Topic evidence">
          <h3>{targetLabel(selected)}</h3>
          <p>
            {label(active)} ·{" "}
            {active.accuracy === null
              ? "No eligible accuracy"
              : Math.round(active.accuracy) + "%"}{" "}
            · {active.correct}/{active.count} eligible unique questions ·{" "}
            {active.contexts} independent contexts.
          </p>
          <p>
            Learning / retries: {active.learningCorrect}/{active.learning}{" "}
            correct; {active.improved} correct retries after a wrong first
            response. {active.assisted} assisted or previously answer-exposed
            responses. {active.unknown} responses have unknown historical
            exposure and are excluded from fresh accuracy.
          </p>
          <p>
            Difficulty composition:{" "}
            {Object.entries(active.difficulty)
              .map(([k, v]) => k + ": " + v)
              .join("; ") || "No eligible evidence"}
            . {active.priorPassage} eligible questions followed prior passage
            exposure; reading times are not independent.
          </p>
          <p>
            {active.available} available questions. Counts across overlapping
            topics must not be added together.
          </p>
          <button className="text-button" onClick={() => setSelected("")}>
            Close details
          </button>
        </div>
      )}
      <div className="canonical-map-groups">
        {groups.map((g) => {
          const ts = matches.filter((t) => t.group_id === g.id);
          if (!ts.length) return null;
          return (
            <details
              key={g.id}
              open={!!query.trim() || openGroups.includes(g.id)}
            >
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  setQuery("");
                  setOpenGroups(
                    openGroups.includes(g.id)
                      ? openGroups.filter((id) => id !== g.id)
                      : [...openGroups, g.id],
                  );
                }}
              >
                {g.label} <span>{ts.length} topics</span>
              </summary>
              {(!!query.trim() || openGroups.includes(g.id)) && (
                <div className="heatmap-grid">
                  {ts.map((t) => (
                    <div key={t.id}>
                      {tile(t.id)}
                      <details
                        className="canonical-drilldown"
                        open={openTopics.includes(t.id)}
                      >
                        <summary
                          onClick={(e) => {
                            e.preventDefault();
                            setOpenTopics(
                              openTopics.includes(t.id)
                                ? openTopics.filter((id) => id !== t.id)
                                : [...openTopics, t.id],
                            );
                          }}
                        >
                          Subtopic evidence
                        </summary>
                        {openTopics.includes(t.id) &&
                          t.selectable_subtopics.map((s) => tile(s.id))}
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </details>
          );
        })}
      </div>
      {!matches.length && <p>No topics match this view.</p>}
      <details className="canonical-skills">
        <summary>Official reasoning-skill performance</summary>
        <p>
          Separate from content targets. CARS passage subjects are context only.
        </p>
        <div className="heatmap-grid">
          {[...taxonomy.science_skills, ...taxonomy.cars_skills]
            .filter(
              (s) =>
                !section ||
                (section === "CARS"
                  ? s.id.startsWith("CARS")
                  : !s.id.startsWith("CARS")),
            )
            .map((s) => {
              const v = summarizeTarget(skillAttempts, skillBank, s.id, {
                ...options,
                integrated: false,
              });
              return (
                <div key={s.id}>
                  <strong>{s.label}</strong>
                  <p>
                    {v.correct}/{v.count} first-exposure correct · {v.contexts}{" "}
                    contexts ·{" "}
                    {v.limited
                      ? "Limited evidence"
                      : v.count
                        ? "Observed accuracy"
                        : "No eligible evidence"}
                  </p>
                  <p>
                    Learning/retries: {v.learningCorrect}/{v.learning}
                  </p>
                </div>
              );
            })}
        </div>
      </details>
      <p className="heatmap-help">
        {held} historical answers are unclassified or awaiting tagging review
        and remain preserved outside topic totals. {unanswered} unanswered
        questions in completed sessions are tracked separately, not scored as
        wrong. Difficulty is estimated, not measured; raw topic percentages are
        not directly comparable ability estimates. The 10-question/3-context
        color threshold is provisional.
      </p>
    </section>
  );
}
