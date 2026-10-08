import { QuestionTutor } from './question-tutor';
import { Passage } from './passage';
import type { PracticeUnit, UnitFeedback } from '@/lib/types';

export function UnitQuestions({ unit, choices, feedback, busy, demo=false, owner, choose, hint, submit, next }: {
  demo?: boolean; owner: string;
  unit: PracticeUnit; choices: Record<string,number>; feedback: UnitFeedback | null; busy: boolean;
  choose: (id:string, choice:number)=>void; hint:(id:string)=>void; submit:()=>void; next:()=>void;
}) {
  const grouped = unit.questions.length > 1;
  return <>
    <Passage question={unit.questions[0]} />
    {grouped && <p className="unit-instructions">Answer all {unit.questions.length} questions below, then submit the passage together. You can change any choice before submitting.</p>}
    {unit.questions.map((q,index) => {
      const f = feedback?.[q.id];
      const hints = unit.hints[q.id] || [];
      return <section className="unit-question" key={q.id} aria-labelledby={`prompt-${q.id}`}>
        <h2 id={`prompt-${q.id}`} className="question-text">{grouped ? `${index+1}. ` : ''}{q.prompt}</h2>
        <div className="answers" role="radiogroup" aria-labelledby={`prompt-${q.id}`}>
          {q.options.map((option,i) => <button key={i} role="radio" aria-checked={choices[q.id]===i}
            disabled={!!feedback || busy}
            className={`answer ${choices[q.id]===i?'selected':''} ${f?.answer===i?'correct':''} ${f && choices[q.id]===i && !f.correct?'incorrect':''}`}
            onClick={()=>choose(q.id,i)}><span>{'ABCD'[i]}</span><div>{option}</div></button>)}
        </div>
        {f ? <div className={`feedback ${f.correct?'success':''}`}><strong>{f.correct?'Correct':'Incorrect'} · {f.points} points</strong><p>{f.explanation}</p></div>
        : <>{hints.length>0 && <div className="hint-box">{hints.map((h,i)=><p key={i}>{h}</p>)}</div>}
          {unit.session.mode==='training' && <button className="text-button" disabled={busy || hints.length>=2} onClick={()=>hint(q.id)}>{hints.length>=2?'Both hints revealed':`Hint for question ${index+1}`}</button>}</>}
        {f && <QuestionTutor key={`${owner}:${unit.session.id}:${q.id}`} sessionId={unit.session.id} questionId={q.id} demo={demo} />}
      </section>;
    })}
    <div className="quiz-actions unit-submit" aria-live="polite">
      <span>{feedback ? `${Object.values(feedback).filter(f=>f.correct).length} of ${unit.questions.length} correct` : `${unit.questions.filter(q=>choices[q.id]!==undefined).length} of ${unit.questions.length} answered`}</span>
      {feedback ? <button className="button" disabled={busy} onClick={next}>{unit.session.cursor+unit.questions.length>=unit.session.question_ids.length?'See my report':'Continue'}</button>
      : <button className="button" disabled={busy || unit.questions.some(q=>choices[q.id]===undefined)} onClick={submit}>{busy?'Saving…':grouped?'Submit passage answers':'Check answer'}</button>}
    </div>
  </>;
}
