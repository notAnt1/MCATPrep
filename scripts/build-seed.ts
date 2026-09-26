import { readFileSync, writeFileSync } from "node:fs";
import { questions } from "../src/lib/questions";
const values = questions
  .map(
    (q) => `('${q.id}', '${JSON.stringify(q).replaceAll("'", "''")}'::jsonb)`,
  )
  .join(",\n");
writeFileSync(
  "supabase/seed.sql",
  `-- Original starter questions. Existing versions are preserved.\ninsert into public.mcat_questions(id,body) values\n${values}\non conflict(id) do nothing;\n`,
);
console.log(`Wrote ${questions.length} original starter questions.`);
writeFileSync(
  "supabase/setup.sql",
  readFileSync("supabase/schema.sql", "utf8") +
    "\n" +
    readFileSync("supabase/seed.sql", "utf8"),
);
