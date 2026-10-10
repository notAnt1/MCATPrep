"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { availableItems, groups, searchTopics, sections, topics, type Annotation } from "@/lib/canonical-topics";

const names: Record<string, string> = {
  "C/P": "Chemical & physical foundations",
  "B/B": "Biological & biochemical foundations",
  "P/S": "Psychological & social foundations",
  CARS: "Critical analysis & reasoning",
};

export function TopicExplorer({ bank, ready, onPractice }: {
  bank: Annotation[]; ready: boolean; onPractice: (id: string, section: string) => void;
}) {
  const [section, setSection] = useState("");
  const [groupId, setGroup] = useState("");
  const [topicId, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const group = groups.find(g => g.id === groupId);
  const topic = topics.find(t => t.id === topicId);
  const matching = searchTopics(query, section);
  const visibleGroups = groups.filter(g => matching.some(t => t.group_id === g.id));
  function chooseSection(value: string) { setSection(value); setGroup(""); setTopic(""); setQuery(""); }
  function chooseTopic(id: string) {
    const target = topics.find(t => t.id === id)!;
    setSection(section && target.section_filters.includes(section) ? section : target.section_filters[0]);
    setGroup(target.group_id); setTopic(id); setQuery("");
  }
  function practiceButton(id: string) {
    const count = availableItems(bank, id, section).length;
    return <button className="button small" disabled={!ready || count === 0} onClick={() => onPractice(id, section)}>
      {!ready ? "Sign in for availability" : count ? `Practice · ${count} question${count === 1 ? "" : "s"}` : "No questions yet"}
    </button>;
  }
  return <section className="topic-explorer">
    <div className="page-heading"><div><h1>Explore the topic map</h1><p>Follow a branch from a section to its topics. Open any topic to see what’s inside.</p></div></div>
    <label className="explorer-search"><Search size={20} aria-hidden="true"/><input aria-label="Search the topic map" placeholder="Find a topic or subtopic…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery("")}>Clear</button>}</label>
    <div className="explorer-root"><span>MCAT</span></div>
    <div className="explorer-sections" aria-label="MCAT sections">
      {sections.map((s, i) => <button key={s} className={`explorer-section section-${i}`} aria-pressed={section === s} onClick={() => chooseSection(section === s ? "" : s)}><strong>{s}</strong><span>{names[s]}</span><small>{topics.filter(t => t.section_filters.includes(s)).length} topics</small></button>)}
    </div>
    <p className="explorer-key">Lines show section → group → topic relationships. Topics can belong to more than one section.</p>
    {query ? <div className="explorer-panel"><h2>Matches {section && `in ${section}`} <span>({matching.length})</span></h2><div className="explorer-nodes">{matching.map(t => <button className="explorer-node" key={t.id} onClick={() => chooseTopic(t.id)}><strong>{t.label}</strong><span>{t.section_filters.join(" · ")} · {t.selectable_subtopics.length} subtopics</span><ChevronRight size={18}/></button>)}</div>{!matching.length && <p>No matches here. Choose another section or try a broader term.</p>}</div>
    : !section ? <div className="explorer-intro"><h2>Four sections. One connected subject map.</h2><p>Choose a section above to unfold its branches.</p><div className="explorer-overlap">{sections.filter(s => s !== "CARS").map(s => <div key={s}><strong>{s}</strong><p>{topics.filter(t => t.section_filters.includes(s) && t.section_filters.length > 1).length} topics shared with other sections</p></div>)}</div><p>CARS branches describe reading and reasoning tasks, rather than passage subjects.</p></div>
    : <div className="explorer-panel">
      <nav className="explorer-trail" aria-label="Topic map path"><button onClick={() => chooseSection("")}>All sections</button><ChevronRight size={16}/><button onClick={() => { setGroup(""); setTopic(""); }}>{section}</button>{group && <><ChevronRight size={16}/><button onClick={() => setTopic("")}>{group.label}</button></>}{topic && <><ChevronRight size={16}/><span>{topic.label}</span></>}</nav>
      <div className="explorer-branch-title">{(group || topic) && <button aria-label="Back one level" onClick={() => topic ? setTopic("") : setGroup("")}><ArrowLeft size={20}/></button>}<div><h2>{topic?.label || group?.label || names[section]}</h2><p>{topic ? "Subtopics" : group ? "Topics in this group" : "Choose a topic group"}</p></div></div>
      {topic && <div className="explorer-topic-actions">{practiceButton(topic.id)}<div className="explorer-shared"><span>Belongs to</span>{topic.section_filters.map(s => <button key={s} aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>)}</div></div>}
      <div className="explorer-tree">
        {topic ? topic.selectable_subtopics.map(sub => <div className="explorer-leaf" key={sub.id}><strong>{sub.label}</strong>{practiceButton(sub.id)}</div>)
        : group ? topics.filter(t => t.group_id === group.id && t.section_filters.includes(section)).map(t => <button className="explorer-node" key={t.id} onClick={() => chooseTopic(t.id)}><strong>{t.label}</strong><span>{t.selectable_subtopics.length} subtopics{t.section_filters.length > 1 ? ` · ${t.section_filters.join(" / ")}` : ""}</span><ChevronRight size={18}/></button>)
        : visibleGroups.map(g => <button className="explorer-node" key={g.id} onClick={() => setGroup(g.id)}><strong>{g.label}</strong><span>{matching.filter(t => t.group_id === g.id).length} topics</span><ChevronRight size={18}/></button>)}
      </div>
    </div>}
  </section>;
}
