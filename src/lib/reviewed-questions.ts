import batch from "../../data/reviewed/ollama-batch-001.json";
import type { FullQuestion } from "./types";

// Preserve the received review artifact; adapt only platform tags and add a second hint.
const secondHints = [
  "Competitive inhibition preserves Vmax; uncompetitive inhibition lowers Vmax and apparent Km proportionally.",
  "Use Km = [S](Vmax/v - 1) separately for each enzyme preparation.",
  "A proton leak reduces the gradient even when the respiratory chain consumes more oxygen.",
  "Divide each proton count by four to obtain the corresponding ATP yield.",
  "For an even saturated chain with n carbons, compare n/2 acetyl-CoA with n/2 - 1 cycles.",
  "Fatty acid synthase uses NADPH in its reductive reactions; ATP cannot replace that electron donor.",
  "The fed state favors synthesis of the regulator, which activates glycolysis and inhibits gluconeogenesis.",
  "The mutation preserves the fasting regulatory state despite the fed hormone mixture.",
  "The glyceraldehyde-3-phosphate dehydrogenase step requires NAD+; lactate formation replenishes it.",
  "Calculate 100 times the difference between the two ATP yields, then divide by 30 seconds.",
];

export const reviewedQuestions: FullQuestion[] = batch.map((q, index) => ({
  ...q,
  section: "B/B",
  skill: [1, 3, 4, 9].includes(index) ? "Quantitative reasoning" : "Concept application",
  difficulty: "Medium (not empirically calibrated)",
  hints: [...q.hints, secondHints[index]],
}));
