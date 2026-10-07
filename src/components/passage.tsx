import Image from 'next/image';
import type { Question } from '@/lib/types';

function PassageText({ text }: { text: string }) {
  return <div className="passage">{text.split(/\r?\n\s*\r?\n/).map((block,index) => {
    const lines=block.split(/\r?\n/);
    const start=lines.findIndex(line=>line.includes('|'));
    if(start<0) return <p key={index}>{block}</p>;
    const rows=lines.slice(start).map(line=>line.split('|').map(cell=>cell.trim()));
    if(rows.length<2 || rows.some(row=>row.length!==rows[0].length)) return <p key={index}>{block}</p>;
    const caption=lines.slice(0,start).join(' ');
    return <div className="passage-table-scroll" key={index} tabIndex={0} role="region" aria-label={caption || 'Passage data table'}>
      <table className="passage-table">
        {caption && <caption>{caption}</caption>}
        <thead><tr>{rows[0].map((cell,i)=><th scope="col" key={i}>{cell}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((row,i)=><tr key={i}>{row.map((cell,j)=>j===0?<th scope="row" key={j}>{cell}</th>:<td key={j}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  })}</div>;
}

export function Passage({ question }: { question: Question }) {
  return <>
    {question.passage && <PassageText text={question.passage} />}
    {question.figures?.map(f => <figure className="passage-figure" key={f.id}>
      <a href={f.src} target="_blank" rel="noreferrer" aria-label={`Open full-size ${f.caption}`}>
        <Image src={f.src} alt={f.alt} width={f.width} height={f.height} unoptimized />
      </a>
      <figcaption>{f.caption} <a href={f.src} target="_blank" rel="noreferrer">View full size</a></figcaption>
      <details><summary>Figure data in text</summary><p>{f.alt}</p></details>
    </figure>)}
  </>;
}
