import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pilotQuestions } from '../src/lib/pilot-questions';
import { chooseUnits } from '../src/lib/practice-units';
import { demoUnitCurrent, demoUnitAnswer, demoUnitHint } from '../src/lib/demo-units';
import { demoStart, demoData } from '../src/lib/demo';

test('figures exist and topic filters keep whole passages',()=>{
  assert.equal(pilotQuestions.length,50);
  assert.equal(pilotQuestions.filter(q=>q.figures?.length).length,15);
  for(const q of pilotQuestions) for(const f of q.figures||[]) assert.ok(existsSync(`public${f.src}`));
  const chosen=chooseUnits(pilotQuestions,[],'Ion trapping');
  assert.equal(chosen.length,5);
  assert.equal(new Set(chosen.map(q=>q.passage_id)).size,1);
  for(let i=0;i<20;i++) {
    const selected=chooseUnits(pilotQuestions,[],null);
    assert.ok(selected.length>=10 && selected.length<=15);
    for(const q of selected.filter(q=>q.passage_id)) assert.equal(selected.filter(p=>p.passage_id===q.passage_id).length,pilotQuestions.filter(p=>p.passage_id===q.passage_id).length);
  }
});

test('demo submits a complete passage, with hints, once and preserves total time',()=>{
  const memory=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v)}});
  const id=demoStart('training','Ion trapping');
  let c=demoUnitCurrent(id);
  assert.equal(c.questions.length,5);
  assert.ok(c.questions.every(q=>!('answer' in q)&&!('explanation' in q)&&!('hints' in q)));
  c=demoUnitHint(id,c.questions[2].id);
  assert.equal(c.hints[c.questions[2].id].length,1);
  const answers=c.questions.map(q=>({id:q.id,selected:pilotQuestions.find(p=>p.id===q.id)!.answer}));
  assert.throws(()=>demoUnitAnswer(id,answers.slice(1),50003,true));
  assert.equal(demoData().attempts.length,0);
  const f=demoUnitAnswer(id,answers,50003,true);
  assert.equal(Object.values(f).filter(f=>f.correct).length,5);
  assert.deepEqual(demoUnitAnswer(id,answers,50003,true),f);
  assert.equal(demoData().attempts.length,5);
  assert.equal(demoData().attempts.reduce((s,a)=>s+a.active_ms,0),50003);
  assert.ok(demoData().attempts.every(a=>!a.timing_valid));
  assert.ok(demoUnitCurrent(id).session.completed_at);
});

test('database grouped submissions are atomic, private, idempotent and backward compatible',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const path of ['schema','training-review','passage-units']) await db.exec(readFileSync(`supabase/${path}.sql`,'utf8'));
  // Migration can safely be rerun.
  await db.exec(readFileSync('supabase/passage-units.sql','utf8'));
  for(const q of pilotQuestions) await db.query('insert into mcat_questions(id,body) values($1,$2)',[q.id,JSON.stringify(q)]);
  const u1='11111111-1111-4111-8111-111111111111',u2='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values($1),($2)',[u1,u2]);
  await db.exec(`set role anon`);
  await assert.rejects(db.query("select mcat_start_units('training')"),/permission denied/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${u1}';`);
  const sid=(await db.query<{id:string}>("select mcat_start_units('training','Ion trapping') as id")).rows[0].id;
  let c=(await db.query<{v:any}>('select mcat_unit_current($1) as v',[sid])).rows[0].v;
  assert.equal(c.questions.length,5);
  assert.ok(c.questions.every((q:any)=>!('answer' in q)&&!('hints' in q)&&!('explanation' in q)));
  c=(await db.query<{v:any}>('select mcat_unit_hint($1,$2) as v',[sid,c.questions[2].id])).rows[0].v;
  assert.equal(c.hints[c.questions[2].id].length,1);
  const answers=c.questions.map((q:any)=>({id:q.id,selected:pilotQuestions.find(p=>p.id===q.id)!.answer}));
  await assert.rejects(db.query('select mcat_unit_answer($1,$2,50003,true)',[sid,JSON.stringify(answers.slice(1))]),/every question/);
  await assert.rejects(db.query('select mcat_unit_answer($1,$2,50003,true)',[sid,JSON.stringify(answers.map((a:any,i:number)=>i===4?{...a,selected:4}:a))]),/Choose an answer/);
  assert.equal((await db.query('select * from mcat_attempts')).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${u2}';`);
  for(const sql of ['select mcat_unit_current($1)','select mcat_unit_answer($1,$2,50003,true)']) await assert.rejects(db.query(sql,sql.includes('$2')?[sid,JSON.stringify(answers)]:[sid]),/Session not found/);
  await db.exec(`set request.jwt.claim.sub='${u1}';`);
  const f=(await db.query<{v:any}>('select mcat_unit_answer($1,$2,50003,true) as v',[sid,JSON.stringify(answers)])).rows[0].v;
  assert.equal(Object.keys(f).length,5);
  assert.deepEqual((await db.query<{v:any}>('select mcat_unit_answer($1,$2,50003,true) as v',[sid,JSON.stringify(answers)])).rows[0].v,f);
  const attempts=(await db.query<{active_ms:number;timing_valid:boolean;hints_used:number;points:number}>('select * from mcat_attempts')).rows;
  assert.equal(attempts.length,5);
  assert.equal(attempts.reduce((s,a)=>s+a.active_ms,0),50003);
  assert.equal(attempts.reduce((s,a)=>s+a.hints_used,0),1);
  assert.ok(attempts.every(a=>!a.timing_valid&&a.points===100));
  assert.ok((await db.query<{v:any}>('select mcat_unit_current($1) as v',[sid])).rows[0].v.session.completed_at);
  // Legacy endpoints still operate for existing clients, and repeat scoring remains zero.
  const legacy=(await db.query<{id:string}>("select mcat_start('rapid','Ion trapping') as id")).rows[0].id;
  const lc=(await db.query<{v:any}>('select mcat_current($1) as v',[legacy])).rows[0].v;
  assert.equal(lc.question.answer,undefined);
  const lf=(await db.query<{v:any}>('select mcat_answer($1,$2,$3,1000,true) as v',[legacy,lc.question.id,pilotQuestions.find(q=>q.id===lc.question.id)!.answer])).rows[0].v;
  assert.equal(lf.points,0);
 } finally {await db.close();}
});
