import { readFileSync, writeFileSync } from "node:fs";
import { taxonomy } from "../src/lib/canonical-topics";
import annotations from "../data/reviewed/canonical-annotations.json";
const quote = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const nodes = taxonomy.topics.flatMap((t) => [
  { id: t.id, parent: null, label: t.label },
  ...t.selectable_subtopics.map((s) => ({
    id: s.id,
    parent: t.id,
    label: s.label,
  })),
]);
const base = readFileSync("supabase/canonical-topics-base.sql", "utf8");
const data = `\nINSERT INTO mcat_topic_nodes(id,parent_id,label,taxonomy_version) VALUES\n${nodes.map((n) => `(${quote(n.id)},${n.parent ? quote(n.parent) : "NULL"},${quote(n.label)},${quote(taxonomy.version)})`).join(",\n")}\nON CONFLICT(id) DO NOTHING;\nINSERT INTO mcat_question_annotations(question_id,content_version,tagging_version,annotation) VALUES\n${annotations.map((a) => `(${quote(a.question_id)},${a.content_version},${quote(a.tagging_version)},${quote(JSON.stringify(a))}::jsonb)`).join(",\n")}\nON CONFLICT DO NOTHING;\n`;
// Only positive known historical exposure is backfilled; attempt eligibility remains unknown.
const history = `
INSERT INTO mcat_exposures(user_id,family_id,first_session,passage_id,hint_seen,answer_seen,solution_seen)
SELECT DISTINCT ON (a.user_id,a.question_id) a.user_id,a.question_id,a.session_id,q.body->>'passage_id',a.hints_used>0,true,true
FROM mcat_attempts a LEFT JOIN mcat_questions q ON q.id=a.question_id ORDER BY a.user_id,a.question_id,a.created_at
ON CONFLICT DO NOTHING;
INSERT INTO mcat_exposures(user_id,family_id,first_session,passage_id,hint_seen)
SELECT s.user_id,q.id,s.id,q.body->>'passage_id',true FROM mcat_sessions s JOIN mcat_questions q ON q.id=ANY(s.question_ids)
WHERE coalesce((s.unit_hints->>q.id)::int,0)>0 OR (q.id=s.question_ids[s.cursor+1] AND s.hints_used>0)
ON CONFLICT(user_id,family_id) DO UPDATE SET hint_seen=true;
`;
writeFileSync(
  "supabase/canonical-topics.sql",
  base.replace("COMMIT;", () => data + history + "\nCOMMIT;"),
);
