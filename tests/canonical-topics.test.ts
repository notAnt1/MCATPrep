import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  taxonomy,
  annotationMatches,
  availableItems,
  parentId,
  searchTopics,
  type Annotation,
} from "../src/lib/canonical-topics";
import {
  summarizeTarget,
  type EvidenceAttempt,
} from "../src/lib/canonical-performance";
import inventory from "../data/reviewed/canonical-inventory.json";
import { pilotQuestions } from "../src/lib/pilot-questions";
const ann = (
  id: string,
  primary = "membrane-transport.passive-transport",
  secondary: string[] = [],
): Annotation => ({
  question_id: id,
  family_id: id,
  content_version: 1,
  taxonomy_version: "1.0.0",
  tagging_version: "1",
  section: "B/B",
  primary,
  secondary,
  context: ["Insulin"],
  categories: ["2A"],
  skill: "S2",
  secondary_skills: [],
  rationale: "Solution requires passive transport, not endocrine knowledge.",
  uncertainty: "",
  reviewer: "test",
  review_status: "ai-reviewed",
  passage_id: null,
  difficulty: "medium",
  difficulty_status: "estimated",
  published: true,
});
const attempt = (
  a: Annotation,
  correct: boolean,
  extra: Partial<EvidenceAttempt> = {},
): EvidenceAttempt => ({
  question_id: a.question_id,
  family_id: a.family_id,
  annotation: a,
  exposure_known: true,
  section: a.section,
  topic: "legacy",
  skill: "legacy",
  question_version: 1,
  correct,
  session_id: "s1",
  created_at: "2026-01-01",
  mode: "training",
  hints_used: 0,
  repeated: false,
  active_ms: 1000,
  target_seconds: 60,
  timing_valid: true,
  selected: 0,
  points: 0,
  ...extra,
});
test("canonical vocabulary is intact; search resolves aliases and coverage without adding cells", () => {
  assert.equal(taxonomy.topics.length, 128);
  assert.equal(
    taxonomy.topics.flatMap((t) => t.selectable_subtopics).length,
    525,
  );
  const ids = taxonomy.topics.flatMap((t) => [
    t.id,
    ...t.selectable_subtopics.map((s) => s.id),
  ]);
  assert.equal(new Set(ids).size, 653);
  assert.ok(searchTopics("NMR").some((t) => t.id === "spectroscopy"));
  for (const a of inventory)
    for (const id of [a.primary, ...a.secondary]) assert.ok(parentId(id), id);
  assert.equal(
    inventory.filter((a) => a.review_status === "needs-review").length,
    5,
  );
});
test("passive transport in an insulin passage does not count endocrine or active transport; primary vs integrated stays explicit", () => {
  const a = ann("a", "membrane-transport.passive-transport", ["acid-base"]);
  assert.ok(annotationMatches(a, "membrane-transport"));
  assert.ok(!annotationMatches(a, "endocrine", true));
  assert.ok(!annotationMatches(a, "membrane-transport.active-transport", true));
  assert.ok(!annotationMatches(a, "acid-base"));
  assert.ok(annotationMatches(a, "acid-base", true));
});
test("parent is union of families; two correct plus one incorrect gives 2/3 regardless of multiple child tags", () => {
  const bank = [
    ann("a", "membrane-transport.passive-transport", [
      "membrane-transport.active-transport",
    ]),
    ann("b"),
    ann("c"),
  ];
  const v = summarizeTarget(
    bank.map((a, i) => attempt(a, i < 2)),
    bank,
    "membrane-transport",
    { integrated: true },
  );
  assert.equal(v.count, 3);
  assert.equal(v.correct, 2);
  assert.ok(Math.abs(v.accuracy! - 200 / 3) < 1e-10);
  assert.equal(v.contexts, 3);
});
test("wrong first + correct retry does not change fresh metric, including new windows and content revisions", () => {
  const a = ann("a"),
    revised = { ...a, question_id: "revision", content_version: 2 };
  const history = [
    attempt(a, false),
    attempt(revised, true, { created_at: "2026-02-01", question_version: 2 }),
  ];
  const v = summarizeTarget(history, [a, revised], "membrane-transport");
  assert.equal(v.count, 1);
  assert.equal(v.correct, 0);
  assert.equal(v.improved, 1);
  const recent = summarizeTarget(history, [a, revised], "membrane-transport", {
    since: "2026-02-01",
  });
  assert.equal(recent.count, 0);
  assert.equal(recent.learningCorrect, 1);
});
test("hint, answer, solution, prior item and unknown legacy exposure cannot become fresh on retry", () => {
  const a = ann("a");
  for (const exclusion of [
    { prior_hint: true },
    { prior_answer: true },
    { prior_solution: true },
    { prior_item: true },
    { hints_used: 1 },
    { exposure_known: false },
  ]) {
    const v = summarizeTarget(
      [
        attempt(a, false, exclusion),
        attempt(a, true, { created_at: "2026-02-01" }),
      ],
      [a],
      "membrane-transport",
    );
    assert.equal(v.count, 0);
    assert.equal(v.learning, 2);
  }
});
test("unattempted, unavailable, true zero and sparse/context-limited evidence are distinct", () => {
  const a = ann("a");
  assert.equal(
    summarizeTarget([], [], "membrane-transport").state,
    "unavailable",
  );
  assert.equal(
    summarizeTarget([], [a], "membrane-transport").state,
    "unattempted",
  );
  const zero = summarizeTarget([attempt(a, false)], [a], "membrane-transport");
  assert.equal(zero.accuracy, 0);
  assert.equal(zero.state, "limited");
  const bank = Array.from({ length: 10 }, (_, i) => ({
    ...ann("q" + i),
    passage_id: "same-passage",
  }));
  const v = summarizeTarget(
    bank.map((a) => attempt(a, true)),
    bank,
    "membrane-transport",
  );
  assert.equal(v.contexts, 1);
  assert.equal(v.state, "limited");
});
test("CARS novel subjects remain context only; distant main-idea/tone integration can be RWT", () => {
  for (const primary of [
    "cars-context.tone-and-attitude",
    "cars-main-idea.central-claim",
  ]) {
    const a = {
      ...ann("a", primary),
      section: "CARS",
      skill: "CARS-RWT",
      context: ["Novel discipline"],
    };
    assert.ok(annotationMatches(a, parentId(primary)!));
    assert.ok(!annotationMatches(a, "Novel discipline"));
    assert.equal(
      summarizeTarget([attempt(a, true)], [a], parentId(primary)!, {
        section: "CARS",
      }).count,
      1,
    );
  }
});
test("cross-section canonical topic keeps actual section, difficulty, contexts, and lifetime eligibility", () => {
  const a = ann("a"),
    b = { ...ann("b"), section: "C/P", difficulty: "hard" };
  const hist = [attempt(a, true), attempt(b, false)];
  assert.equal(summarizeTarget(hist, [a, b], "membrane-transport").count, 2);
  const v = summarizeTarget(hist, [a, b], "membrane-transport", {
    section: "C/P",
  });
  assert.equal(v.count, 1);
  assert.equal(v.difficulty["hard (estimated)"], 1);
  assert.equal(availableItems([a, b], "membrane-transport", "C/P").length, 1);
});
test("database migration is additive/idempotent, topic selection keeps passages, inventory hides rationale, and exposures persist", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$$$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;".replaceAll(
        "$$",
        () => "$",
      ),
    );
    for (const f of [
      "schema",
      "passage-units",
      "seed",
      "canonical-topics",
      "canonical-topics",
    ])
      await db.exec(readFileSync("supabase/" + f + ".sql", "utf8"));
    assert.equal(
      (await db.query("select * from mcat_questions")).rows.length,
      50,
    );
    const user = "11111111-1111-4111-8111-111111111111";
    await db.exec(
      "insert into auth.users values('" + user + "');set role anon;",
    );
    await assert.rejects(
      db.query("select mcat_topic_inventory()"),
      /permission denied/,
    );
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='" + user + "';",
    );
    const items = (
      await db.query<{ v: any }>("select mcat_topic_inventory() v")
    ).rows[0].v;
    assert.equal(items.length, 50);
    assert.ok(items.every((a: any) => !a.rationale));
    const id = (
      await db.query<{ id: string }>(
        "select mcat_start_topics('training','membrane-transport.active-transport','B/B') id",
      )
    ).rows[0].id;
    const c = (
      await db.query<{ v: any }>("select mcat_unit_current($1) v", [id])
    ).rows[0].v;
    assert.equal(c.questions.length, 5);
    await db.query("select mcat_unit_hint($1,$2)", [id, c.questions[0].id]);
    const answers = c.questions.map((q: any) => ({
      id: q.id,
      selected: pilotQuestions.find((p) => p.id === q.id)!.answer,
    }));
    await db.query("select mcat_unit_answer($1,$2,10000,true)", [
      id,
      JSON.stringify(answers),
    ]);
    const evidence = (await db.query<any>("select * from mcat_attempts")).rows;
    assert.equal(evidence.length, 5);
    assert.ok(
      evidence.every(
        (a: any) => a.exposure_known && a.family_id && a.annotation,
      ),
    );
    assert.equal(
      evidence.find((a: any) => a.question_id === c.questions[0].id).prior_hint,
      true,
    );
    assert.ok(evidence.every((a: any) => !a.prior_answer));
    const retry = (
      await db.query<{ id: string }>(
        "select mcat_start_topics('training','membrane-transport.active-transport','B/B') id",
      )
    ).rows[0].id;
    await db.query("select mcat_unit_current($1)", [retry]);
    await db.query("select mcat_unit_answer($1,$2,10000,true)", [
      retry,
      JSON.stringify(answers),
    ]);
    const repeated = (
      await db.query<any>("select * from mcat_attempts where session_id=$1", [
        retry,
      ])
    ).rows;
    assert.ok(
      repeated.every(
        (a: any) =>
          a.prior_answer && a.prior_solution && a.prior_item && a.prior_passage,
      ),
    );
    await db.exec("reset role");
    const e = (
      await db.query<{ hint_seen: boolean }>(
        "select hint_seen from mcat_exposures where family_id=$1",
        [c.questions[0].id],
      )
    ).rows[0];
    assert.equal(e.hint_seen, true);
    const before = (await db.query("select * from mcat_sessions")).rows;
    await db.exec(readFileSync("supabase/canonical-topics.sql", "utf8"));
    assert.deepEqual(
      (await db.query("select * from mcat_sessions")).rows,
      before,
    );
  } finally {
    await db.close();
  }
});
