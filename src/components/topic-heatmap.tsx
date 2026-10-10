'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { topicMap, compareTopics, sectionNames, type TopicTile } from '@/lib/topic-map';
import type { Attempt } from '@/lib/types';


export function TopicHeatmap({attempts,session=false}:{attempts:Attempt[];session?:boolean}) {
  const [selected,setSelected]=useState<string|null>(null);
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState('priority');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [limits,setLimits]=useState<Record<string,number>>({});
  const detailsId=useId();
  const detail=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(selected) {
      detail.current?.scrollIntoView({block:'nearest'});
      detail.current?.focus({preventScroll:true});
    }
  },[selected]);
  const tiles=useMemo(()=>topicMap(attempts,session),[attempts,session]);
  const visible=tiles.filter(t=>(!query.trim()||t.topic.toLowerCase().includes(query.trim().toLowerCase())) &&
    (filter==='all'||(filter==='practiced'?!!t.t:filter==='priority'?t.priority:filter==='early'?t.sample>0&&t.sample<5:filter==='unseen'?t.accuracy===null:t.accuracy!==null&&t.accuracy<65)))
    .sort(sort==='name'?(a,b)=>a.topic.localeCompare(b.topic):sort==='least'?(a,b)=>a.sample-b.sample||a.topic.localeCompare(b.topic):compareTopics);
  const priorities=tiles.filter(t=>t.priority).sort(compareTopics);
  const early=tiles.filter(t=>t.sample>0&&t.sample<5&&t.accuracy!==null&&t.accuracy<100).sort(compareTopics);
  const suggestions=(priorities.length?priorities:early).slice(0,3);
  const resetView=()=>{setLimits({});setSelected(null);};
  function tile(t:TopicTile) {
    return <button key={t.topic} type="button" aria-pressed={selected===t.topic} aria-controls={selected===t.topic?detailsId:undefined} className={`heatmap-tile ${t.tone} ${t.sample>0&&t.sample<5?'limited':''}`} onClick={()=>setSelected(selected===t.topic?null:t.topic)}>
      <span className="heatmap-name">{t.topic}</span><strong>{t.accuracy===null?'—':`${t.accuracy}%`}</strong><span>{t.sample?`${t.sample} ${t.sample===1?'answer':'answers'}${t.sample<5?' · early signal':''}`:t.t?'No independent answers':'Not practiced'}</span>
    </button>;
  }
  const active=tiles.find(t=>t.topic===selected);
  return <section className="card topic-card topic-map">
    <div className="section-heading"><div><h2>{session?'Session heat map':'Topic heat map'}</h2><p>{session?'Accuracy in this session. Select a topic for details.':'Your latest 20 independent first attempts per topic. Updates after each completed session.'}</p></div></div>
    <div className="map-priorities">
      <h3>{priorities.length?'What to practice next':early.length?'Revisit these early misses':'What to practice next'}</h3>
      <p>{priorities.length?'Lowest accuracy with at least 5 answers. Select a topic to inspect the evidence.':early.length?'These misses are worth reviewing, but there is not enough evidence to call them persistent struggles.':'No established weak topics yet. Try unpracticed topics or build evidence with fresh questions.'}</p>
      {suggestions.length>0&&<div className="map-recommendations">{suggestions.map(t=><button key={t.topic} onClick={()=>setSelected(t.topic)}><strong>{t.topic}</strong><span>{t.accuracy}% · {t.sample} answers · {t.section}</span></button>)}</div>}
    </div>
    <div className="map-controls">
      <label>Find a topic<input type="search" value={query} placeholder="Search topics…" onChange={e=>{setQuery(e.target.value);resetView();}} /></label>
      <label>Show<select value={filter} onChange={e=>{setFilter(e.target.value);resetView();}}><option value="all">All topics</option><option value="priority">Needs practice (5+ answers)</option><option value="review">Below 65% (any sample)</option><option value="early">Early evidence</option><option value="practiced">Practiced topics</option><option value="unseen">No independent evidence</option></select></label>
      <label>Sort<select value={sort} onChange={e=>{setSort(e.target.value);setLimits({});}}><option value="priority">Practice priority</option><option value="name">Topic name</option><option value="least">Least evidence</option></select></label>
    </div>
    <div className="heatmap-toolbar">
      <div className="heatmap-legend" aria-label="Accuracy legend"><span className="low">Below 65%</span><span className="mid">65–79%</span><span className="high">80–100%</span><span className="unseen">No evidence</span></div>

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
    <div className="map-sections">{Object.entries(sectionNames).map(([section,name])=>{
      const all=tiles.filter(t=>t.section===section);
      const items=visible.filter(t=>t.section===section);
      if(!all.length || !items.length) return null;
      const isOpen=!!query.trim() || expanded===section;
      const limit=limits[section]||12;
      const priorityCount=all.filter(t=>t.priority).length;
      return <div className="map-section" key={section}>
        <button className="map-section-toggle" aria-expanded={isOpen} aria-controls={`${detailsId}-${section}`} onClick={()=>{setQuery('');setExpanded(isOpen?null:section);setSelected(null);}}>
          <span><strong>{section}</strong><span>{name}</span></span>
          <span className="map-section-counts">{items.length===all.length?`${all.length} topics`:`${items.length} of ${all.length} topics`} · {all.filter(t=>t.t).length} practiced{priorityCount?` · ${priorityCount} need practice`:''}</span>
          <span aria-hidden="true">{isOpen?'−':'+'}</span>
        </button>
        <div className="map-section-bar" aria-label="All topics in this section: distribution of accuracy colors, not an overall section score">{['low','mid','high','unseen'].map(tone=>{const count=all.filter(t=>t.tone===tone).length;return count?<span key={tone} className={tone} style={{flex:count}} title={`${count} topics: ${tone==='low'?'below 65%':tone==='mid'?'65–79%':tone==='high'?'80–100%':'no evidence'}`} />:null;})}</div>
        {isOpen&&<div id={`${detailsId}-${section}`} className="map-section-content"><p className="heatmap-help">Showing {Math.min(limit,items.length)} of {items.length} matching topics</p><div className="heatmap-grid">{items.slice(0,limit).map(tile)}</div>{items.length>limit&&<button className="text-button" onClick={()=>setLimits({...limits,[section]:limit+12})}>Show 12 more topics</button>}</div>}
      </div>;
    })}</div>
    {!visible.length&&<p className="empty-small">No topics match this view yet.</p>}
    {!session&&<p className="fine-print">Hint-assisted answers and repeats do not affect the accuracy colors. Click a tile to see them in its details.</p>}
  </section>;
}
