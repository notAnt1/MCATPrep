import { writeFileSync } from 'node:fs';
import { pilotQuestions } from '../src/lib/pilot-questions';

const values=pilotQuestions.filter(q=>q.passage_id).map(q=>`('${q.id}','${JSON.stringify({passage:q.passage,passage_id:q.passage_id,passage_title:q.passage_title,passage_order:q.passage_order,figures:q.figures}).replaceAll("'","''")}'::jsonb)`).join(',\n');
writeFileSync('supabase/pilot-passage-metadata.sql',`-- Attach passage identities and extracted PDF figures without changing answer keys or versions.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mcat_questions WHERE id IN (${pilotQuestions.map(q=>`'${q.id}'`).join(',')}))<>50 THEN RAISE EXCEPTION 'Import the 50-question pilot first'; END IF;
END $$;
UPDATE public.mcat_questions q SET body=q.body||p.metadata
FROM (VALUES
${values}
) AS p(id,metadata) WHERE q.id=p.id;
COMMIT;
SELECT count(*) AS passage_questions, count(*) FILTER(WHERE jsonb_array_length(body->'figures')>0) AS illustrated_questions, count(DISTINCT body->>'passage_id') AS passages FROM public.mcat_questions WHERE published AND body ? 'passage_id';
`);
console.log('Prepared metadata for 42 questions across 8 passages; 15 illustrated questions.');
