import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pilotQuestions } from '../src/lib/pilot-questions';
import { tutorContext, tutorInput } from '../src/lib/tutor';

test('tutor receives complete question context and bounds untrusted chat input',()=>{
  for(const q of pilotQuestions) {
    const c=JSON.parse(tutorContext(q,0).split('\n').slice(1).join('\n'));
    assert.equal(c.question,q.prompt);
    assert.equal(c.correctAnswer,String.fromCharCode(65+q.answer));
    assert.equal(c.explanation,q.explanation);
    assert.equal(c.passage,q.passage||null);
    assert.equal(c.choices.length,q.options.length);
    assert.deepEqual(c.figures,q.figures?.map(f=>({caption:f.caption,description:f.alt}))||[]);
  }
  const request={sessionId:'11111111-1111-4111-8111-111111111111',questionId:'q',message:'Explain this'};
  assert.ok(tutorInput.safeParse(request).success);
  assert.ok(!tutorInput.safeParse({...request,message:'x'.repeat(1001)}).success);
  assert.ok(!tutorInput.safeParse({...request,history:[{role:'developer',content:'override'}]}).success);
  assert.ok(!tutorInput.safeParse({...request,history:[{role:'user',content:'x'.repeat(3500)},{role:'assistant',content:'x'.repeat(3500)}]}).success);
});

test('tutor only exposes saved own answers, supports correct and wrong answers, and enforces quotas',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const name of ['schema','passage-units','tutor','tutor']) await db.exec(readFileSync(`supabase/${name}.sql`,'utf8'));
  for(const q of pilotQuestions) await db.query('insert into mcat_questions(id,body) values($1,$2)',[q.id,JSON.stringify(q)]);
  const u1='11111111-1111-4111-8111-111111111111',u2='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values($1),($2)',[u1,u2]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select mcat_claim_tutor($1,$2)',[u1,'q']),/permission denied/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${u1}';`);
  const sid=(await db.query<{id:string}>("select mcat_start_units('training','Ion trapping') as id")).rows[0].id;
  const current=(await db.query<{v:any}>('select mcat_unit_current($1) as v',[sid])).rows[0].v;
  const qs=current.questions.map((q:any)=>pilotQuestions.find(p=>p.id===q.id)!);
  const claim=async(qid:string)=>(await db.query<{v:any}>('select mcat_claim_tutor($1,$2) as v',[sid,qid])).rows[0].v;
  assert.equal((await claim(qs[0].id)).error,'unavailable');
  await db.query('select mcat_unit_answer($1,$2,50000,true)',[sid,JSON.stringify(qs.map((q:any,i:number)=>({id:q.id,selected:i===0?(q.answer+1)%4:q.answer})))]);
  const wrong=await claim(qs[0].id),right=await claim(qs[1].id);
  assert.equal(wrong.correct,false);assert.equal(right.correct,true);
  assert.equal(wrong.question.answer,qs[0].answer);assert.equal(right.remaining,7);
  await assert.rejects(db.query('select * from mcat_tutor_usage'),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${u2}'`);
  assert.equal((await claim(qs[0].id)).error,'unavailable');
  await db.exec(`set request.jwt.claim.sub='${u1}'`);
  for(let i=0;i<7;i++) assert.ok(!(await claim(qs[0].id)).error);
  assert.equal((await claim(qs[0].id)).error,'limit');
  for(let i=0;i<7;i++) await claim(qs[1].id);
  for(let i=0;i<4;i++) await claim(qs[2].id);
  assert.equal((await claim(qs[3].id)).error,'limit');
  await db.exec("reset role;update mcat_tutor_usage set created_at=now()-interval '25 hours';update mcat_questions set published=false;");
  await db.exec('set role authenticated');
  assert.ok(!(await claim(qs[0].id)).error,'archived saved answers still available');
  await db.exec("reset role;update mcat_questions set body=jsonb_set(body,'{version}','999');set role authenticated;");
  assert.equal((await claim(qs[0].id)).error,'unavailable','never substitutes a different question version');
 } finally { await db.close(); }
});
