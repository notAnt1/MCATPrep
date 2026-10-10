import { writeFileSync } from "node:fs";
import { pilotQuestions } from "../src/lib/pilot-questions";
import {
  taxonomy,
  parentId,
  type Annotation,
} from "../src/lib/canonical-topics";
// Adjudicated against each actual stem and shortest correct solution, not passage labels.
// [primary target, actual category, dominant skill, essential secondary targets, uncertainty]
const rows: Record<number, [string, string, string, string[], string?]> = {
  1: ["acid-base.weak-acid-and-weak-base-equilibria", "5A", "S2", []],
  2: [
    "membrane-transport.passive-transport",
    "2A",
    "S2",
    ["acid-base.weak-acid-and-weak-base-equilibria"],
    "Confirm 2A versus C/P solution-chemistry category for a protein-free barrier.",
  ],
  3: [
    "acid-base.weak-acid-and-weak-base-equilibria",
    "5A",
    "S2",
    ["membrane-transport.passive-transport"],
  ],
  4: [
    "experimental-design.controls-and-confounding",
    "5A",
    "S3",
    ["acid-base.weak-acid-and-weak-base-equilibria"],
  ],
  5: ["spectroscopy.ir-spectroscopy", "4D", "S1", ["acid-base"]],
  6: ["sound.sound-propagation", "4D", "S2", []],
  7: ["sound.ultrasound-and-attenuation", "4D", "S2", []],
  8: ["sound.intensity-and-decibels", "4D", "S2", []],
  9: [
    "data-interpretation.readout-interpretation",
    "4D",
    "S4",
    ["sound.sound-propagation"],
  ],
  10: ["sound.ultrasound-and-attenuation", "4D", "S2", []],
  11: [
    "electrochemistry.cell-potentials",
    "4C",
    "S2",
    ["thermodynamics", "kinetics-chem"],
  ],
  12: [
    "stereochemistry.enantiomers-and-diastereomers",
    "5B",
    "S2",
    ["alcohols"],
  ],
  13: [
    "resistors.resistor-networks",
    "4C",
    "S2",
    ["resistors.electrical-power"],
  ],
  14: ["renal.filtration-reabsorption-secretion", "3B", "S2", []],
  15: ["renal.filtration-reabsorption-secretion", "3B", "S2", []],
  16: ["renal.filtration-reabsorption-secretion", "3B", "S4", []],
  17: [
    "membrane-transport.active-transport",
    "2A",
    "S2",
    ["renal.filtration-reabsorption-secretion"],
  ],
  18: [
    "endocrine.hormone-mechanisms",
    "3A",
    "S1",
    ["renal.urine-concentration"],
  ],
  19: ["oxphos.inhibitors-and-uncoupling", "1D", "S2", []],
  20: ["data-interpretation.normalization-and-ratios", "1D", "S4", []],
  21: ["oxphos.electron-transport", "1D", "S1", []],
  22: ["experimental-design.controls-and-confounding", "1D", "S3", []],
  23: ["membrane-transport.electrochemical-gradients", "2A", "S1", []],
  24: ["linkage-meiosis.crossing-over-and-recombination", "1C", "S2", []],
  25: [
    "organelles-trafficking.er-golgi-and-protein-trafficking",
    "2A",
    "S2",
    [],
  ],
  26: ["endocrine.feedback-loops", "3A", "S2", []],
  27: ["sensation.signal-detection", "6A", "S4", []],
  28: ["sensation.signal-detection", "6A", "S4", []],
  29: ["sensation.signal-detection", "6A", "S2", []],
  30: ["experimental-design.controls-and-confounding", "6A", "S3", []],
  31: ["conditioning.reinforcement-and-punishment", "7C", "S2", []],
  32: [
    "data-interpretation.normalization-and-ratios",
    "10A",
    "S4",
    [],
    "Category is contextual: confirm 10A versus 9B; solution only requires comparison of changes.",
  ],
  33: ["learning-modeling.observational-learning", "7C", "S1", []],
  34: [
    "identity.self-concept-and-efficacy",
    "8A",
    "S1",
    [],
    "Confirm collective efficacy placement versus group processes; avoid claiming the individual-only child is sufficient.",
  ],
  35: [
    "experimental-design.sampling-and-generalization",
    "10A",
    "S3",
    [],
    "Confirm actual category for a research-methods question; social context alone is not a scored target.",
  ],
  36: ["inequality.capital-and-social-reproduction", "10A", "S1", []],
  37: ["attribution.attribution-biases", "8B", "S1", []],
  38: [
    "experimental-design.measurement-quality",
    "6A",
    "S3",
    [],
    "Confirm official category for measurement quality; do not score income or social isolation as prerequisite topics.",
  ],
  39: ["cars-main-idea.central-claim", "", "CARS-RWT", []],
  40: ["cars-context.rhetorical-meaning", "", "CARS-FC", []],
  41: ["cars-main-idea.author-s-position", "", "CARS-RWT", []],
  42: ["cars-structure.organization-and-relationships", "", "CARS-RWT", []],
  43: ["cars-application.applying-a-principle", "", "CARS-RBT", []],
  44: ["cars-new-information.strengthen-weaken", "", "CARS-RBT", []],
  45: ["cars-main-idea.central-claim", "", "CARS-RWT", []],
  46: ["cars-context.tone-and-attitude", "", "CARS-FC", []],
  47: ["cars-structure.examples-and-concessions", "", "CARS-RWT", []],
  48: ["cars-context.rhetorical-meaning", "", "CARS-FC", []],
  49: ["cars-application.applying-a-principle", "", "CARS-RBT", []],
  50: ["cars-application.applying-a-principle", "", "CARS-RBT", []],
};
const annotations: Annotation[] = pilotQuestions.map((q) => {
  const n = Number(q.id.match(/q(\d+)$/)![1]);
  const [primary, category, skill, secondary, uncertainty = ""] = rows[n];
  for (const id of [primary, ...secondary])
    if (!parentId(id)) throw Error(`Unknown canonical target ${id}`);
  return {
    question_id: q.id,
    family_id: q.id,
    content_version: q.version,
    taxonomy_version: taxonomy.version,
    tagging_version: "1.0.0",
    section: q.section,
    primary,
    secondary,
    categories: category ? [category] : [],
    skill,
    secondary_skills: [],
    context:
      q.section === "CARS"
        ? [n < 45 ? "Architecture" : "Political science"]
        : [q.passage_title || q.topic],
    rationale: q.explanation
      .split("\n\n")[0]
      .replace(/^[A-D] is correct\. /, ""),
    uncertainty,
    reviewer:
      "Codex solution-based review, 2026-10-10; not independent human validation",
    review_status: uncertainty ? "needs-review" : "ai-reviewed",
    passage_id: q.passage_id || null,
    difficulty: q.difficulty,
    difficulty_status: "estimated",
    published: true,
  };
});
writeFileSync(
  "data/reviewed/canonical-annotations.json",
  JSON.stringify(annotations, null, 2) + "\n",
);
writeFileSync(
  "data/reviewed/canonical-inventory.json",
  JSON.stringify(
    annotations.map((a) => ({ ...a, rationale: "" })),
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "data/reviewed/canonical-review.md",
  `# Classification review\n\n50 active items inspected against stems and solutions. ${annotations.filter((a) => a.review_status === "needs-review").length} held out of targeted selection/performance pending review. All annotations are AI reviewed, not independently validated. Archived items retain history and remain unmapped until reviewed. IDs identify existing question families; no wording changes or new families were created.\n\n` +
    annotations
      .filter((a) => a.uncertainty)
      .map((a) => `- ${a.question_id}: ${a.uncertainty}`)
      .join("\n") +
    "\n",
);
