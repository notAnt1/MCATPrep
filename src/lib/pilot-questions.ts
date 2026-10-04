import pilot from '../../data/reviewed/MCAT_50_Question_Pilot.json';
import type { FullQuestion } from './types';

export const pilotQuestions: FullQuestion[] = [
  ...pilot.passage_sets.flatMap(p => p.questions.map((q, index) => ({
    ...q,
    passage: p.passage,
    passage_id: p.id,
    passage_title: p.topic,
    passage_order: index,
    figures: (p.figures ?? []).map(f => ({
      id: f.id,
      src: `/figures/pilot-october/${f.path.split('/').pop()}`,
      caption: f.caption,
      alt: f.alt_text,
      width: f.id === 'bb-coupling-figure2' ? 2100 : 1800,
      height: f.id === 'bb-coupling-figure2' ? 850 : 840,
    })),
  }))),
  ...pilot.standalone_questions,
];
