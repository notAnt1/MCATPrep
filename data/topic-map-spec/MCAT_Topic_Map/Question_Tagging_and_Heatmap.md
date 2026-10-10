# Question tagging and topic-performance rules

Version 1.0.0 | October 9, 2026

This is a proposed product specification accompanying the AAMC-grounded topic map. It does not implement or modify the website. It distinguishes content selection, question classification, and the performance evidence the website can honestly display.

## Navigation and practice selection

Use a section filter, then the relevant topic groups. Show topic names first, with optional expandable child choices. For example:

- B/B → Cell biology → Membrane transport → Active transport.
- C/P → Laboratory analysis and separations → IR, UV-visible, and NMR spectroscopy → Proton NMR.
- P/S → Learning, motivation, and mental health → Classical and operant conditioning → Reinforcement schedules.
- CARS → Reasoning beyond the text → Applying ideas to new situations → Analogy.

Do not open every branch at once. Search should match canonical labels, abbreviations, aliases, and scope concepts, then return the correct selectable topic or child. The 938 scope concepts are not 938 separate performance cells. Display counts of suitable questions; distinguish an unattempted topic from a topic for which the bank currently has no questions. A comprehensive taxonomy does not establish a comprehensive question inventory.

A whole-topic selection includes questions targeting any of its children. A child selection should require that particular concept or task in the solution. If an item targets the topic broadly and no child uniquely fits, retain the parent tag instead of inventing child precision. Practice selection can include essential secondary targets; identify these as integrated practice. An incidental passage mention never qualifies by itself.

## Canonical data and versions

Each concept has one ID, a preferred display label, aliases, one navigation parent, optional related concepts, and candidate AAMC categories/skills with source locators. The same canonical topic may appear in multiple section views. A question records its actual section and actual category separately. A duplicate topic history is not created because an enzyme question appears in both C/P and B/B.

Version the taxonomy independently from question content. IDs in the delivered JSON are the initial stable vocabulary. Future label changes retain IDs; splits and merges require explicit migration records and historical views. Do not regenerate child IDs from edited labels without preserving their existing identity. The current builder assigns initial IDs from labels; maintain or migrate those IDs intentionally when changing the vocabulary.

Question family IDs connect versions of substantially the same item. A wording edit does not create a new independent performance observation. A new passage/task may warrant a new family; record the rationale. Store content version, taxonomy version, tagging version, reviewer, and review status with annotations.

## Minimum question annotation

For each science question record:

- Actual MCAT section.
- One primary topic: the main content concept or cross-cutting method the question actually tests.
- Zero or more essential secondary topics: concepts genuinely needed in its shortest valid solution.
- A primary subtopic if the target is sufficiently specific; otherwise use the topic-level target.
- The relevant official AAMC content category, adjudicated for that particular question. Parent candidate lists are possibilities, not automatic tags. Record additional categories only when the item actually requires them.
- One dominant official science skill S1–S4, with secondary skills only when genuinely needed.
- Context-only topics or entities, stored separately from scored targets.
- A short evidence-based tagging rationale and any uncertainty.

For CARS record the reading-task topic/child and the actual official CARS skill. Passage disciplines are optional context filters, not outside-knowledge topics or knowledge-mastery scores. Main idea, tone, structure, and inference cannot be classified from stem keywords alone: immediate-context reasoning may be comprehension, while distant integration can be reasoning within the text.

Research topics are selectable practice targets, not extra official science skills. For a question mainly about choosing a control, experimental design can be primary while membrane transport is secondary. For a transport-mechanism question in an experiment, membrane transport can be primary while the experimental setting is merely context. Determine this from the task, not a fixed rule about which passage it belongs to.

Do not tag all questions in a passage with all its topics. Review tags against each question's shortest valid solution, with a separate classification check when available. Hold genuinely unmapped targets for review rather than putting them in a hidden “Other” weakness bucket. Novel research entities often require reasoning from supplied information, not new prerequisite topics.

## Illustrative annotations from our existing batch

These are proposed annotations for explaining the taxonomy, not changes to the accepted bank or a newly completed annotation review.

| Item | Primary target | Possible essential secondary target | Reason |
| --- | --- | --- | --- |
| Q3, bead transit time | Scientific calculations and model use | Motion and vectors | The task is a supplied-speed distance/time calculation. A rotating-liquid setting alone does not make viscosity its measured weakness. |
| Q6, capacitor leakage | Capacitance and stored energy | Current, resistance, and circuits | The discharge model and parallel resistance relationship determine the result. |
| Q12, chiral peak calculation | Isomers and stereochemistry → Enantiomeric excess and resolution | Chromatography | Peak assignment and relative quantities support an enantiomeric-excess calculation. |
| Q13, TLC/IR conclusion | Chromatography → Chiral separation | Spectroscopy | The important limitation is that an achiral measurement cannot establish enantiomeric purity. |
| Q19, bypassing a reporter step | Experimental design and controls | Enzyme mechanisms and catalysis | The student selects an experiment that isolates one step. |
| Q23, reversed glucose-analog gradient | Membrane transport → Passive transport | None required | The target is the direction of facilitated diffusion, not insulin signaling or active transport. |
| Q27, unaffected child's carrier risk | Mendelian and non-Mendelian inheritance | Statistics, probability, and uncertainty | The genetic cross and conditioning determine the two risks. |

Correct/incorrect alone does not identify which of several required concepts caused an error. Optional learner-selected error reasons or reviewed response explanations can add information, but should not overwrite observed scores or claim a definitive cognitive diagnosis.

## Heat-map display

Default to the 128 main topics, grouped and filtered by section. Make 525 child-level views optional drilldowns, with their own counts and sparse-evidence treatment. Do not assume that practice on one child establishes performance on its siblings.

Use the wording **“Performance on questions targeting this topic.”** Show observed accuracy, eligible unique question count, independent context count, and the selected date/window. Include correct and attempted counts; do not label raw accuracy “mastery” or convert it to a scaled MCAT score.

Maintain separate dimensions for:

1. Topic performance.
2. Official reasoning-skill performance.
3. Learning/retry performance.

Within the topic view, the default uses the primary target only. An optional “questions involving this topic” view may include essential secondary targets; make that distinction visible and do not interpret it as identifying the reason for a miss.

### Eligible attempt policy

For the main accuracy metric, use the first-ever scored exposure to each question family, eligible only if unaided and without prior answer, hint, or solution exposure. Determine first exposure over the learner’s lifetime history before applying a recent/date filter; a retry inside a new window does not become a first attempt. Record whether the answer, explanation, worked solution, or hint was already seen. An item first attempted with assistance cannot later become a fresh first-exposure observation merely because hints were turned off. Previously exposed retries belong to a separate learning metric. Record skipped or unanswered items separately, with an explicit policy for scoring them; do not silently convert navigation abandonment into an incorrect response.

Track timed/untimed mode, assistance, prior item and passage exposure, item version, question family, passage ID, date, outcome, and estimated or empirically measured difficulty status. Model-generated timing and difficulty estimates do not become student measurements. Seeing a shared passage earlier changes reading-time interpretation, even if a later question is new.

### Deduplication and parent rollups

The parent count is the union of eligible unique question-family attempts. Never sum child percentages or count the same item twice because it has two tags under the same parent. Calculate parent accuracy from the deduplicated correct/attempted counts. An integrated item can appear in different filtered views, but do not add those overlapping counts to obtain an overall total.

Questions sharing a passage provide correlated evidence. Show distinct passages and standalone contexts as well as question count. A standalone item contributes its own context. Keep a performance view for each section and a combined canonical-topic view; section differences are useful information, not duplicated concepts.

### Sparse evidence and color

- No eligible attempts: neutral cell with “Not yet attempted,” not 0%.
- No available bank items: “No questions available yet,” distinct from learner performance.
- Few observations: show accuracy and counts with a neutral/muted “Limited evidence” treatment.
- Proposed initial threshold for full-strength coloring: at least 10 eligible unique questions across at least 3 distinct contexts. These are provisional product heuristics, not AAMC standards or validated mastery thresholds. Reassess with actual response data and question supply.
- Use a labeled, accessible color scale plus percentages and counts. Color alone should not convey meaning.

Show difficulty composition and the time window when comparing cells. Raw percentages from targeted practice on differently difficult questions are not directly comparable estimates of underlying ability. Keep recent and all-time views distinct; choose a clearly labeled time window rather than inventing an opaque mastery-decay model.

[NIST's proportion-interval guidance](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) can inform an optional uncertainty indicator. Binomial intervals assume conditions that repeated/shared-passage, adaptively selected items may not meet. Do not present an interval as validated mastery precision; counts and cautious wording are the simpler initial display.

## Acceptance checks for tagging and analytics

Before website implementation is accepted, test these cases:

- A passive-transport question in an insulin passage counts under passive transport, not automatically endocrine regulation or active transport.
- One item tagged with two children of the same parent adds one parent attempt.
- Two correct questions plus one incorrect question give 2/3 parent accuracy, regardless of child counts.
- A wrong first attempt followed by a correct retry leaves first-exposure accuracy unchanged; retry improvement is recorded separately.
- Prior hint/answer exposure excludes a later attempt from the fresh metric.
- An unattempted topic is distinct from a topic with actual 0% accuracy and from unavailable bank content.
- An item content revision does not silently create a new independent question-family attempt.
- A novel CARS passage subject remains classifiable by reading skill without implying a new knowledge requirement.
- A CARS tone or main-idea task requiring distant integration can receive Reasoning Within the Text.
- Cross-section views use the same topic ID but filter actual section and preserve difficulty/context information.

The taxonomy's structural checks have been run. These are implementation acceptance cases for the future website; the website's scoring implementation has not been tested or modified in this task.

## Sources and ownership of design choices

The [AAMC outline](https://students-residents.aamc.org/prepare-mcat-exam/whats-mcat-exam-pdf-outline) defines required scope and the science skill families; the [CARS overview](https://students-residents.aamc.org/whats-mcat-exam/critical-analysis-and-reasoning-skills-section-overview) defines its separate reading skill families. Our menu labels, granularity, tagging policy, heat-map display, and sparse-data thresholds are product choices, not AAMC-endorsed analytics.

Stable IDs, alternate labels, and broader/narrower relationships follow concepts described by the [W3C SKOS Primer](https://www.w3.org/TR/skos-primer/). This JSON is a practical adapted vocabulary, not a claim of full RDF/SKOS conformance.
