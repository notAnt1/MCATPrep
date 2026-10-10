import { analyze } from './analytics';
import type { Attempt } from './types';
import topicSections from '../../data/reviewed/topic-sections.json';

export const sectionNames: Record<string,string> = {'C/P':'Chemical & physical foundations','B/B':'Biological & biochemical foundations','P/S':'Psychological & social foundations',CARS:'Critical analysis & reasoning','Cross-section':'Across sections',Other:'Other topics'};
export function topicMap(attempts:Attempt[],session=false) {
  const stats=analyze(attempts);
  const catalog:Record<string,string[]>=topicSections;
  const names=[...new Set([...(!session?Object.keys(catalog):[]),...stats.topics.map(t=>t.topic)])];
  return names.map(topic=>{
    const t=stats.topics.find(t=>t.topic===topic);
    const accuracy=t?(session?t.accuracy:t.recentAccuracy):null;
    const sample=t?(session?t.attempts:t.recentSample):0;
    const sections=[...new Set([...(catalog[topic]||[]),...attempts.filter(a=>a.topic===topic).map(a=>a.section)])];
    const section=sections.length>1?'Cross-section':sectionNames[sections[0]]?sections[0]:'Other';
    return {topic,t,accuracy,sample,section,tone:accuracy===null?'unseen':accuracy<65?'low':accuracy<80?'mid':'high',priority:sample>=5&&accuracy!==null&&accuracy<65};
  });
}
export type TopicTile=ReturnType<typeof topicMap>[number];
export function compareTopics(a:TopicTile,b:TopicTile) {
  // Established low accuracy first, then early misses; ties favor more evidence.
  const rank=(t:TopicTile)=>t.priority?0:t.accuracy!==null&&t.accuracy<80?1:t.accuracy!==null?2:3;
  return rank(a)-rank(b)||(a.accuracy??101)-(b.accuracy??101)||b.sample-a.sample||a.topic.localeCompare(b.topic);
}
