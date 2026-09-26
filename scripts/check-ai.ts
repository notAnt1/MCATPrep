// Explicit live smoke test. Uses synthetic performance only; incurs a small API charge.
import { createLearningReport, reportSchema } from "../src/lib/ai";
import { Attempt } from "../src/lib/types";
const samples: Attempt[] = Array.from({ length: 6 }, (_, i) => ({
  session_id: "synthetic-test",
  question_id: `test-${i}`,
  question_version: 1,
  selected: 0,
  topic: "Stoichiometry",
  section: "C/P",
  skill: "Quantitative reasoning",
  mode: "training",
  correct: i < 2,
  active_ms: 80000,
  target_seconds: 60,
  hints_used: 0,
  repeated: false,
  timing_valid: true,
  points: 0,
  created_at: new Date().toISOString(),
}));
async function main() {
  try {
    const report = await createLearningReport(samples, samples);
    reportSchema.parse(report);
    console.log(
      "Live AI report: PASS. Structured session and overall reports returned. No personal study data sent.",
    );
  } catch (e) {
    console.error(
      "Live AI report: FAILED.",
      e instanceof Error ? e.message.slice(0, 200) : "Unknown error",
    );
    process.exitCode = 1;
  }
}
void main();
