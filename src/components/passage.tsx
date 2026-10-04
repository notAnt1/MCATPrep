import Image from 'next/image';
import type { Question } from '@/lib/types';

export function Passage({ question }: { question: Question }) {
  return <>
    {question.passage && <div className="passage">{question.passage}</div>}
    {question.figures?.map(f => <figure className="passage-figure" key={f.id}>
      <a href={f.src} target="_blank" rel="noreferrer" aria-label={`Open full-size ${f.caption}`}>
        <Image src={f.src} alt={f.alt} width={f.width} height={f.height} unoptimized />
      </a>
      <figcaption>{f.caption} <a href={f.src} target="_blank" rel="noreferrer">View full size</a></figcaption>
      <details><summary>Figure data in text</summary><p>{f.alt}</p></details>
    </figure>)}
  </>;
}
