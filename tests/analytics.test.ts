import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, median } from "../src/lib/analytics";
import { Attempt } from "../src/lib/types";
const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  session_id: "s",
  question_id: crypto.randomUUID(),
  question_version: 1,
  selected: 0,
  topic: "Enzymes",
  section: "B/B",
  skill: "Reasoning",
  mode: "training",
  correct: true,
  active_ms: 60000,
  target_seconds: 60,
  hints_used: 0,
  repeated: false,
  timing_valid: true,
  points: 100,
  created_at: new Date().toISOString(),
  ...overrides,
});
test("median handles empty, even and odd samples without mutating inputs", () => {
  assert.equal(median([]), null);
  assert.equal(median([9, 1, 3]), 3);
  assert.equal(median([1, 9]), 5);
});
test("assistance and repeats do not inflate independent accuracy", () => {
  const result = analyze([
    attempt({ correct: false }),
    ...Array.from({ length: 7 }, () => attempt({ hints_used: 1 })),
    ...Array.from({ length: 7 }, () => attempt({ repeated: true })),
  ]);
  assert.equal(result.topics[0].independent, 1);
  assert.equal(result.topics[0].recentAccuracy, 0);
  assert.equal(result.topics[0].status, "Needs more evidence");
});
test("timing is separated by mode and excludes invalid observations", () => {
  const result = analyze([
    attempt({ active_ms: 30000 }),
    attempt({ mode: "rapid", active_ms: 10000 }),
    attempt({ active_ms: 900000, timing_valid: false }),
  ]);
  assert.equal(result.topics[0].timing[0].medianCorrectSeconds, 30);
  assert.equal(result.topics[0].timing[1].medianCorrectSeconds, 10);
  assert.equal(result.medianSeconds, 20);
});
test("recent accuracy uses last twenty independent first attempts", () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    attempt({
      correct: i >= 20,
      created_at: new Date(2026, 0, i + 1).toISOString(),
    }),
  );
  const t = analyze(rows.reverse()).topics[0];
  assert.equal(t.recentAccuracy, 100);
  assert.equal(t.previousAccuracy, 0);
  assert.equal(t.previousSample, 20);
  assert.equal(t.status, "Developing strength");
});
test("slow misses and fast misses are not treated as equivalent", () => {
  const t = analyze([
    attempt({ correct: false, active_ms: 10000 }),
    attempt({ correct: false, active_ms: 100000 }),
    attempt({ active_ms: 90000 }),
  ]).topics[0];
  assert.equal(t.timing[0].fastMisses, 1);
  assert.equal(t.timing[0].slowCorrect, 1);
});
