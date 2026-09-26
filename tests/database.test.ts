import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { questions } from "../src/lib/questions";
test("database workflow, scoring, report limits, and account isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(readFileSync("supabase/schema.sql", "utf8"));
    for (const q of questions)
      await db.query("insert into mcat_questions(id,body) values($1,$2)", [
        q.id,
        JSON.stringify(q),
      ]);
    const u1 = "11111111-1111-4111-8111-111111111111",
      u2 = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users values($1),($2)", [u1, u2]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${u1}';`);
    await assert.rejects(
      db.query("select * from mcat_questions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into mcat_attempts(user_id) values($1)", [u1]),
      /permission denied/,
    );
    const sid = (
      await db.query<{ id: string }>(
        "select mcat_start('training','Dilution') as id",
      )
    ).rows[0].id;
    assert.equal(
      (await db.query<{ id: string }>("select mcat_start('rapid') as id"))
        .rows[0].id,
      sid,
    );
    let c = (await db.query<{ v: any }>("select mcat_current($1) as v", [sid]))
      .rows[0].v;
    assert.equal(c.question.answer, undefined);
    assert.equal(c.question.explanation, undefined);
    assert.equal(c.question.hints, undefined);
    const firstId = c.question.id;
    await db.query("select mcat_hint($1,$2)", [sid, firstId]);
    const q = questions.find((q) => q.id === firstId)!;
    await db.query("select mcat_answer($1,$2,$3,2000,true)", [
      sid,
      firstId,
      q.answer,
    ]);
    await db.query("select mcat_answer($1,$2,$3,2000,true)", [
      sid,
      firstId,
      q.answer,
    ]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from mcat_attempts",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ hints_used: number }>(
          "select hints_used from mcat_attempts",
        )
      ).rows[0].hints_used,
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${u2}';`);
    assert.equal(
      (await db.query("select * from mcat_attempts")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from mcat_sessions")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select mcat_current($1)", [sid]),
      /Session not found/,
    );
    await assert.rejects(
      db.query("select mcat_answer($1,$2,0,1000,true)", [sid, firstId]),
      /Session not found/,
    );
    await db.exec(`set request.jwt.claim.sub='${u1}';`);
    for (
      let i = 1;
      i < questions.filter((q) => q.topic === "Dilution").length;
      i++
    ) {
      c = (await db.query<{ v: any }>("select mcat_current($1) as v", [sid]))
        .rows[0].v;
      await db.query("select mcat_answer($1,$2,$3,2000,true)", [
        sid,
        c.question.id,
        questions.find((q) => q.id === c.question.id)!.answer,
      ]);
    }
    c = (await db.query<{ v: any }>("select mcat_current($1) as v", [sid]))
      .rows[0].v;
    assert.ok(c.session.completed_at);
    assert.equal(c.question, null);
    assert.equal(
      (
        await db.query<{ v: boolean }>("select mcat_claim_report($1) as v", [
          sid,
        ])
      ).rows[0].v,
      true,
    );
    assert.equal(
      (
        await db.query<{ v: boolean }>("select mcat_claim_report($1) as v", [
          sid,
        ])
      ).rows[0].v,
      false,
    );
    await db.query("select mcat_save_report($1,$2)", [
      sid,
      JSON.stringify({ session_summary: "test" }),
    ]);
    const repeat = (
      await db.query<{ id: string }>(
        "select mcat_start('rapid','Dilution') as id",
      )
    ).rows[0].id;
    for (
      let i = 0;
      i < questions.filter((q) => q.topic === "Dilution").length;
      i++
    ) {
      c = (await db.query<{ v: any }>("select mcat_current($1) as v", [repeat]))
        .rows[0].v;
      await assert.rejects(
        db.query("select mcat_hint($1,$2)", [repeat, c.question.id]),
        /training/,
      );
      await db.query("select mcat_answer($1,$2,$3,2000,true)", [
        repeat,
        c.question.id,
        questions.find((q) => q.id === c.question.id)!.answer,
      ]);
    }
    assert.equal(
      (
        await db.query<{ score: number }>(
          "select score from mcat_sessions where id=$1",
          [repeat],
        )
      ).rows[0].score,
      0,
    );
    assert.equal(
      (await db.query("select * from mcat_leaderboard()")).rows.length,
      0,
    );
    await db.query("insert into mcat_profiles values($1,$2,true)", [
      u1,
      "Test learner",
    ]);
    assert.equal(
      (await db.query("select * from mcat_leaderboard()")).rows.length,
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${u2}';`);
    assert.equal((await db.query("select * from mcat_reports")).rows.length, 0);
    assert.equal(
      (await db.query("select * from mcat_profiles")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select mcat_save_report($1,$2)", [sid, "{}"]),
      /Report not requested/,
    );
  } finally {
    await db.close();
  }
});
