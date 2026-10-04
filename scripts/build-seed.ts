import { readFileSync, writeFileSync } from "node:fs";
import { questions } from "../src/lib/questions";
import { expandedQuestions } from "../src/lib/expanded-questions";
import { reviewedQuestions } from "../src/lib/reviewed-questions";
import { pilotQuestions } from '../src/lib/pilot-questions';
const values = pilotQuestions
  .map(
    (q) => `('${q.id}', '${JSON.stringify(q).replaceAll("'", "''")}'::jsonb)`,
  )
  .join(",\n");
writeFileSync(
  "supabase/seed.sql",
  `-- Original starter questions. Existing versions are preserved.\ninsert into public.mcat_questions(id,body) values\n${values}\non conflict(id) do nothing;\n`,
);
console.log(`Wrote ${pilotQuestions.length} active pilot questions.`);
writeFileSync(
  "supabase/ollama-batch-001.sql",
  `-- Adds 10 reviewed original questions. Existing questions and results are preserved.\nBEGIN;\ninsert into public.mcat_questions(id,body) values\n${reviewedQuestions.map((q) => `('${q.id}', '${JSON.stringify(q).replaceAll("'", "''")}'::jsonb)`).join(",\n")}\non conflict(id) do nothing;\nCOMMIT;\nselect id, published from public.mcat_questions where id in (${reviewedQuestions.map((q) => `'${q.id}'`).join(",")}) order by id;\n`,
);
writeFileSync(
  "supabase/expansion-01.sql",
  `-- Adds 48 original practice questions. Safe to rerun; existing questions and results are preserved.\nBEGIN;\ninsert into public.mcat_questions(id,body) values\n${expandedQuestions.map((q) => `('${q.id}', '${JSON.stringify(q).replaceAll("'", "''")}'::jsonb)`).join(",\n")}\non conflict(id) do nothing;\nCOMMIT;\nselect body->>'topic' as topic, count(*) as questions from public.mcat_questions where published group by 1 order by 1;\n`,
);
writeFileSync(
  "supabase/setup.sql",
  readFileSync("supabase/schema.sql", "utf8") +
    "\n" +
    readFileSync("supabase/training-review.sql", "utf8") +
    "\n" +
    readFileSync("supabase/passage-units.sql", "utf8") +
    "\n" +
    readFileSync("supabase/seed.sql", "utf8"),
);
