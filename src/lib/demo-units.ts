import { demoData, demoSave } from './demo';
import { questions } from './questions';
import { pilotQuestions } from './pilot-questions';
import { currentUnit } from './practice-units';
import type { PracticeUnit, UnitFeedback } from './types';
const bank = [...questions,...pilotQuestions];

export function demoUnitCurrent(id:string): PracticeUnit {
  const d=demoData(), s=d.sessions.find(s=>s.id===id);
  if(!s) throw new Error('Session not found');
  if(!d.started && !s.completed_at) { d.started=Date.now(); demoSave(d); }
  const unit=s.completed_at?[]:currentUnit(bank,s.question_ids,s.cursor);
  const safe=unit.map(({answer,explanation,hints,...q})=>q);
  return {session:s,question:safe[0]||null,questions:safe,hints:Object.fromEntries(unit.map(q=>[q.id,q.hints.slice(0,d.unitHints?.[q.id] || 0)]))};
}
export function demoUnitHint(id:string,qid:string) {
  const c=demoUnitCurrent(id),d=demoData();
  if(c.session.mode!=='training' || !c.questions.some(q=>q.id===qid)) throw new Error('Hint unavailable');
  d.unitHints={...d.unitHints,[qid]:Math.min(2,(d.unitHints?.[qid]||0)+1)};
  demoSave(d); return demoUnitCurrent(id);
}
export function demoUnitAnswer(id:string,answers:{id:string;selected:number}[],ms:number,valid:boolean):UnitFeedback {
  const d=demoData(),s=d.sessions.find(s=>s.id===id);
  if(!s) throw new Error('Session not found');
  const old=d.attempts.filter(a=>a.session_id===id && answers.some(q=>q.id===a.question_id));
  if(answers.length && new Set(answers.map(a=>a.id)).size===answers.length && old.length===answers.length) {
    if(old.some(a=>answers.find(q=>q.id===a.question_id)?.selected!==a.selected)) throw new Error('Answers already saved');
    return Object.fromEntries(old.map(a=>{const q=bank.find(q=>q.id===a.question_id)!;return [q.id,{correct:a.correct,points:a.points,answer:q.answer,explanation:q.explanation}];}));
  }
  const unit=currentUnit(bank,s.question_ids,s.cursor);
  if(s.completed_at || !d.started || !unit.length || answers.length!==unit.length || answers.some((a,i)=>a.id!==unit[i].id || !Number.isInteger(a.selected) || a.selected<0 || a.selected>3) || !Number.isInteger(ms) || ms<0 || ms>86400000) throw new Error('Answer every question in the current passage');
  const feedback:UnitFeedback={},target=unit.reduce((sum,q)=>sum+q.target_seconds,0),wall=Date.now()-d.started;
  unit.forEach((q,i)=>{
    const correct=answers[i].selected===q.answer,repeated=d.attempts.some(a=>a.question_id===q.id);
    const points=correct&&!repeated?100+(s.mode==='rapid'?Math.max(0,Math.round(50*(1-Math.min(1,wall/1000/target)))):0):0;
    d.attempts.push({session_id:id,question_id:q.id,question_version:q.version,topic:q.topic,section:q.section,skill:q.skill,mode:s.mode,selected:answers[i].selected,correct,repeated,points,active_ms:Math.floor(ms/unit.length)+(i<ms%unit.length?1:0),target_seconds:q.target_seconds,hints_used:d.unitHints?.[q.id]||0,timing_valid:unit.length===1&&valid&&ms>=1000&&ms<=wall+3000,created_at:new Date().toISOString()});
    s.score+=points; feedback[q.id]={correct,answer:q.answer,explanation:q.explanation,points};
  });
  s.cursor+=unit.length;
  if(s.cursor>=s.question_ids.length)s.completed_at=new Date().toISOString();
  d.unitHints={};d.hints=0;d.started=0;demoSave(d);return feedback;
}
