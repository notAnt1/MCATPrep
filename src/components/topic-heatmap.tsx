'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { analyze } from '@/lib/analytics';
import type { Attempt } from '@/lib/types';
import tags from '../../data/reviewed/pilot-tags.json';

export function TopicHeatmap({attempts,session=false}:{attempts:Attempt[];session?:boolean}) {
  const [selected,setSelected]=useState<string|null>(null);
  const [filter,setFilter]=useState('all');
  const detailsId=useId();
  const detail=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(selected) {
      detail.current?.scrollIntoView({block:'nearest'});
      detail.current?.focus({preventScroll:true});
    }
  },[selected]);
  const stats=analyze(attempts);
  const names=[...new Set([...(!session?tags.topics:[]),...stats.topics.map(t=>t.topic)])].sort();
  const tiles=names.map(topic=>{
    const t=stats.topics.find(t=>t.topic===topic);
    const accuracy=t?(session?t.accuracy:t.recentAccuracy):null;
    const sample=t?(session?t.attempts:t.recentSample):0;
    return {topic,t,accuracy,sample,tone:accuracy===null?'unseen':accuracy<65?'low':accuracy<80?'mid':'high'};
  });
  const visible=tiles.filter(t=>filter==='all'||(filter==='practiced'?!!t.t:t.accuracy!==null&&t.accuracy<65));
  const active=tiles.find(t=>t.topic===selected);
  return <section className="card topic-card topic-map">
    <div className="section-heading"><div><h2>{session?'Session heat map':'Topic heat map'}</h2><p>{session?'Accuracy in this session. Select a topic for details.':'Your latest 20 independent first attempts per topic. Updates after each completed session.'}</p></div></div>
    <div className="heatmap-toolbar">
      <div className="heatmap-legend" aria-label="Accuracy legend"><span className="low">Below 65%</span><span className="mid">65–79%</span><span className="high">80–100%</span><span className="unseen">No evidence</span></div>
      <label>Show <select value={filter} onChange={e=>{setFilter(e.target.value);setSelected(null);}}><option value="all">All topics</option><option value="practiced">Practiced topics</option><option value="review">Below 65%</option></select></label>
    </div>
    <p className="heatmap-help">Striped tiles have fewer than 5 answers—an early signal, not a mastery rating.</p>
    {active && <div ref={detail} tabIndex={-1} id={detailsId} className="topic-detail" role="region" aria-label={`${active.topic} details`}>
      <div className="section-heading"><h3>{active.topic}</h3><button className="text-button" onClick={()=>setSelected(null)}>Close details</button></div>
      {active.t ? <>
        <div className="topic-detail-stats"><div><strong>{active.accuracy===null?'—':`${active.accuracy}%`}</strong><span>{session?'Session accuracy':'Recent independent accuracy'}</span></div><div><strong>{active.sample}</strong><span>{session?'Answers this session':'Independent first attempts in sample'}</span></div><div><strong>{active.t.attempts}</strong><span>Total answers · {active.t.assisted} assisted · {active.t.repeats} repeated</span></div></div>
        <p>{active.sample<5?'More independent practice is needed before drawing conclusions.':session?'Session accuracy includes assisted and repeated answers.':active.t.status}</p>
        <p>Last practiced: {new Date(active.t.lastPracticed!).toLocaleDateString()}. {active.t.previousAccuracy!==null&&!session?`Previous sample: ${active.t.previousAccuracy}% across ${active.t.previousSample} answers.`:''}</p>
        <div className="topic-timing">{active.t.timing.map(t=><p key={t.mode}>{t.mode==='training'?'Training':'Rapid fire'}: {t.medianCorrectSeconds===null?'No valid individual timing for correct answers':`${Math.round(t.medianCorrectSeconds)}s median on correct answers`}.</p>)}</div>
      </>:<p>No answers yet. Practice this topic to start building your map.</p>}
    </div>}
    <div className="heatmap-grid">{visible.map(t=><button key={t.topic} type="button" aria-pressed={selected===t.topic} aria-controls={selected===t.topic?detailsId:undefined} className={`heatmap-tile ${t.tone} ${t.sample>0&&t.sample<5?'limited':''}`} onClick={()=>setSelected(selected===t.topic?null:t.topic)}>
      <span className="heatmap-name">{t.topic}</span><strong>{t.accuracy===null?'—':`${t.accuracy}%`}</strong><span>{t.sample?`${t.sample} ${t.sample===1?'answer':'answers'}${t.sample<5?' · early signal':''}`:t.t?'No independent answers':'Not practiced'}</span>
    </button>)}</div>
    {!visible.length&&<p className="empty-small">No topics match this view yet.</p>}
    {!session&&<p className="fine-print">Hint-assisted answers and repeats do not affect the accuracy colors. Click a tile to see them in its details.</p>}
  </section>;
}
