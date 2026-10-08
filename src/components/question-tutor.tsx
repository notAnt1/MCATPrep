'use client';
import { useId, useRef, useState } from 'react';
import { getBrowserDb } from '@/lib/supabase';

type Message = {role:'user'|'assistant';content:string};
export function QuestionTutor({sessionId,questionId,demo=false}:{sessionId:string;questionId:string;demo?:boolean}) {
  const id=useId();
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState<number|null>(null);
  const sending=useRef(false);
  async function send() {
    if(sending.current || demo || !draft.trim()) return;
    sending.current=true;setBusy(true);setError('');
    const message=draft.trim();
    try {
      const {data}=await getBrowserDb().auth.getSession();
      if(!data.session) throw new Error('Sign in to use the AI tutor.');
      let history=messages.slice(-6);
      while(history.reduce((n,m)=>n+m.content.length,0)>6000) history=history.slice(2);
      const result=await fetch('/api/tutor',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({sessionId,questionId,message,history}),signal:AbortSignal.timeout(30000)});
      const body=await result.json();
      if(!result.ok) throw new Error(body.error || 'The tutor could not reply.');
      setMessages(previous=>[...previous,{role:'user',content:message},{role:'assistant',content:body.reply}]);
      setDraft('');setRemaining(body.remaining);
      if(body.truncated) setError('This reply reached its length limit. You can ask a follow-up.');
    } catch(e) {setError(e instanceof Error && e.name!=='TimeoutError' ? e.message : 'The tutor took too long. Please try again later.');}
    finally {sending.current=false;setBusy(false);}
  }
  return <div className="question-tutor">
    <button type="button" className="text-button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{open?'Close AI tutor':'Ask AI tutor'}</button>
    {open && <section id={id} className="tutor-panel" aria-label="AI tutor for this question">
      <h3>Let’s make it click</h3>
      <p className="muted">I have this question, passage, answer choices, correct answer, and your answer. Ask about a concept or a confusing step.</p>
      {demo ? <p>Sign in and submit a practice answer to chat with the tutor. Demo answers do not use AI.</p> : <>
        <div className="tutor-messages" role="log" aria-label="Tutor conversation" aria-live="polite">
          {messages.map((m,i)=><div key={i} className={`tutor-message ${m.role}`}><strong>{m.role==='user'?'You':'Tutor'}</strong><p>{m.content}</p></div>)}
        </div>
        {!messages.length && <div className="tutor-suggestions">{['Explain the key concept simply.','Why are the other choices wrong?','Walk me through the reasoning.'].map(text=><button type="button" className="text-button" disabled={busy} key={text} onClick={()=>setDraft(text)}>{text}</button>)}</div>}
        <form onSubmit={e=>{e.preventDefault();void send();}}>
          <label htmlFor={`${id}-message`}>Your follow-up question</label>
          <textarea id={`${id}-message`} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1000} rows={3} disabled={busy || remaining===0} placeholder="Which part would you like explained?" />
          <div className="tutor-footer"><small>{remaining===null?'Up to 8 replies per question · 20 per day':`${remaining} replies left for this question within your daily allowance`}</small><button className="button" disabled={busy || !draft.trim() || remaining===0}>{busy?'Explaining…':'Send'}</button></div>
        </form>
        <p className="tutor-note">Sending shares this question and your messages with OpenAI. Replies can contain mistakes. Chat clears when you leave this question.</p>
        {error && <p role="alert" className="tutor-error">{error}</p>}
      </>}
    </section>}
  </div>;
}
