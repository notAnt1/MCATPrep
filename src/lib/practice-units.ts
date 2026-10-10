import { annotationMatches, parentId, type Annotation } from './canonical-topics';
import inventory from '../../data/reviewed/canonical-inventory.json';
import type { FullQuestion, Attempt } from './types';

export function chooseUnits(bank: FullQuestion[], attempts: Attempt[], topic: string | null, skill = '', section = '') {
  const groups = new Map<string, FullQuestion[]>();
  for (const q of bank) {
    const key = q.passage_id || q.id;
    groups.set(key, [...(groups.get(key) || []), q]);
  }
  const ranked = [...groups.values()]
    .filter(g => g.some(q => (!topic || (parentId(topic) ? (inventory as Annotation[]).some(a=>a.question_id===q.id && annotationMatches(a,topic,true)) : q.topic===topic)) && (!skill || q.skill === skill) && (!section || q.section === section)))
    .map(g => ({ g: g.sort((a,b) => (a.passage_order || 0) - (b.passage_order || 0)), seen: attempts.filter(a => g.some(q => q.id === a.question_id)).length / g.length, rand: Math.random() }))
    .sort((a,b) => a.seen-b.seen || a.rand-b.rand);
  const selected: FullQuestion[] = [];
  for (const { g } of ranked) { if (selected.length >= 10) break; selected.push(...g); }
  return selected;
}

export function currentUnit(bank: FullQuestion[], ids: string[], cursor: number) {
  const first = bank.find(q => q.id === ids[cursor]);
  if (!first) return [];
  const unit = [first];
  if (first.passage_id) for (const id of ids.slice(cursor+1)) {
    const q = bank.find(q => q.id === id);
    if (!q || q.passage_id !== first.passage_id) break;
    unit.push(q);
  }
  return unit;
}
