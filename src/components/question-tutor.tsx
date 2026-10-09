'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { getBrowserDb } from '@/lib/supabase';
import { tutorText } from '@/lib/tutor-text';

type Message = {role:'user'|'assistant';content:string};
export function QuestionTutor({sessionId,questionId,demo=false}:{sessionId:string;questionId:string;demo?:boolean}) {
  const id=useId();
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState<number|null>(null);
  const sending=useRef(false);
  const conversation=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    if(open && !busy) composer.current?.focus({preventScroll:true});
  },[open,busy]);
  useEffect(()=>{
    const log=conversation.current;
    const latest=log?.lastElementChild;
    if(!log || !latest) return;
    // Reveal the new reply inside the chat without moving the surrounding question.
    // Align its beginning so longer answers remain readable from the first line.
    log.scrollTop+=latest.getBoundingClientRect().top-log.getBoundingClientRect().top;
  },[messages.length,open]);
  async function send() {
    if(sending.current || demo || remaining===0 || !draft.trim()) return;
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
      <h3>AI tutor</h3>
      <p className="muted">Ask about this question. I already have the passage, choices, and your answer.</p>
      {demo ? <p>Sign in and submit a practice answer to chat with the tutor. Demo answers do not use AI.</p> : <>
        <div ref={conversation} className="tutor-messages" role="log" aria-label="Tutor conversation" aria-live="polite" tabIndex={0}>
          {messages.map((m,i)=><div key={i} className={`tutor-message ${m.role}`}><strong className="tutor-speaker">{m.role==='user'?'You':'Tutor'}</strong>{(m.role==='assistant'?tutorText(m.content):m.content).split(/\n\s*\n/).map((paragraph,j)=><p key={j}>{paragraph}</p>)}</div>)}
        </div>
        {!messages.length && <div className="tutor-suggestions">{['Explain it simply','Compare the choices','Show the steps'].map(text=><button type="button" disabled={busy} key={text} onClick={()=>{setDraft(text);composer.current?.focus({preventScroll:true});}}>{text}</button>)}</div>}
        <form onSubmit={e=>{e.preventDefault();void send();}}>
          <label htmlFor={`${id}-message`}>Your question</label>
          <textarea ref={composer} id={`${id}-message`} aria-describedby={`${id}-keys`} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{
            if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode!==229) {
              e.preventDefault();
              if(!e.repeat) void send();
            }
          }} maxLength={1000} rows={2} disabled={busy || remaining===0} placeholder="What would you like explained?" />
          <div className="tutor-footer"><small id={`${id}-keys`}>Enter to send · Shift+Enter for a new line</small><button className="button" disabled={busy || !draft.trim() || remaining===0}>{busy?'Explaining…':'Send'}</button></div>
          <small className="tutor-allowance">{remaining===null?'8 replies per question · 20 per day':`${remaining} replies remaining for this question today`}</small>
        </form>
        <p className="tutor-note">Sending shares this question and your messages with OpenAI. Replies can contain mistakes. Chat clears when you leave this question.</p>
        {error && <p role="alert" className="tutor-error">{error}</p>}
      </>}
    </section>}
  </div>;
}
