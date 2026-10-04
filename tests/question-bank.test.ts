import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { questions } from "../src/lib/questions";

test("question bank has unique IDs, valid choices, hints, and timing metadata", () => {
  assert.equal(questions.length, 94);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  assert.equal(new Set(questions.map((q) => q.prompt)).size, questions.length);
  assert.equal(new Set(questions.map((q) => q.topic)).size, 18);
  for (const q of questions) {
    assert.equal(q.options.length, 4, q.id);
    assert.equal(new Set(q.options).size, 4, q.id);
    assert.ok(
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4,
      q.id,
    );
    assert.ok(
      q.explanation.trim().length > 0 &&
        q.hints.length === 2 &&
        q.hints.every((h) => h.length > 10),
      q.id,
    );
    assert.ok(q.target_seconds >= 30 && q.target_seconds <= 150, q.id);
    assert.ok(["C/P", "B/B", "P/S"].includes(q.section), q.id);
  }
});

test("expansion SQL is repeatable and preserves existing question content", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table mcat_questions(id text primary key, body jsonb not null, published boolean default true)",
    );
    for (const q of questions.filter((q) => q.id.startsWith("sample-"))) {
      await db.query("insert into mcat_questions(id,body) values($1,$2)", [
        q.id,
        JSON.stringify(q),
      ]);
    }
    const sql = readFileSync("supabase/expansion-01.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const reviewedSql = readFileSync("supabase/ollama-batch-001.sql", "utf8");
    await db.exec(reviewedSql);
    await db.exec(reviewedSql);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from mcat_questions",
        )
      ).rows[0].count,
      94,
    );
    for (const q of questions) {
      assert.deepEqual(
        (
          await db.query<{ body: unknown }>(
            "select body from mcat_questions where id=$1",
            [q.id],
          )
        ).rows[0].body,
        q,
      );
    }
  } finally {
    await db.close();
  }
});
