# Topic-map coverage and review record

Reviewed October 9, 2026 | Version 1.0.0

## Outcome and evidence

The deliverable has 26 navigation groups, 128 selectable topics, 525 optional child choices, and 938 detailed scope concepts. All four sections are represented. The default topic heat map uses the main topics; the detailed scope inventory supports search and author coverage checks. This is an original product taxonomy grounded in AAMC scope, not an official AAMC classification or endorsement.

The author compared the local 111-page AAMC outline against content inventories and checked the current publisher-linked source. The [current AAMC outline landing page](https://students-residents.aamc.org/prepare-mcat-exam/whats-mcat-exam-pdf-outline) links to [the PDF](https://students-residents.aamc.org/media/9261/download). Its 2020 copyright does not imply a newly written 2026 edition. Local inspected source SHA-256: `ec85d11891457c0e2be645885114ef4901bbab0295d2e975d5aadbb9f505fae2`. Page references use PDF file pages, not printed numbers.

The [CARS overview](https://students-residents.aamc.org/whats-mcat-exam/critical-analysis-and-reasoning-skills-section-overview) supplies the outside-knowledge distinction and reading-skill scope. [W3C SKOS](https://www.w3.org/TR/skos-primer/) informed canonical concepts, alternate labels, and hierarchy; this vocabulary does not claim RDF/SKOS conformance. [NIST proportion guidance](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) informed the limitations of optional accuracy intervals, not an ability or mastery model.

## Independent semantic reviews

Two separate review agents inspected the actual draft inventories and final documents:

- `taxonomy_coverage`: B/B and P/S content, final scientific wording, classification examples, and tagging/heatmap safeguards.
- `taxonomy_cp_review`: C/P and CARS content, cross-section mapping safeguards, passage-context lists, and final tagging/heatmap safeguards.

These are independent AI diagnostic reviews, not human validation or proof of exam equivalence. Final reviews identified no remaining required-content defect in their inspected domains. The final consistency recommendations concerning prior exposure and lifetime attempt history were implemented after those reviews; the explicit fields are included in the structural checks.

## Changes made in response to inspection

- Split muscle, skeleton, and skin; emotion and stress; and inequality and health disparities into separate selectable topics.
- Distinguish DNA mutations from transient transcription/translation errors and germline from somatic inheritance.
- Include biotechnology applications, extracellular matrix, organism integration details, biological influences on cognition, ethnic identity, political systems, false consciousness, racial formation, total fertility rates, and social significance of aging in detailed scope.
- Include gas heat capacities, lead-storage/nickel-cadmium batteries, NMR magnetic-field detail, and the explicitly required principal quantum-number scope.
- Preserve search aliases for common technique/pathway abbreviations and quantitative stereochemistry.
- Allow CARS main idea, context/tone, structure, and inference to map to comprehension or reasoning within the text according to necessary evidence scope. Preserve all published example passage disciplines as nonexhaustive context filters.
- Correct mathematical-preparation locators to the substantive PDF pages 20, 53, and 78; omit adjacent resource/distribution pages from those locators.
- Explicitly exclude previously hinted/answer-exposed items from fresh performance; determine first exposure over lifetime history before applying date filters.

## Executed structural checks

`Structural_Validation.json` records 17 passed assertions. They check unique IDs; navigation and parent references; exact published counts; representation of all 31 science category destinations, three CARS families, and four science skills; CSV/JSON/crosswalk consistency; four-section representation; valid page ranges; selected omission/split regressions; CARS classification flexibility; context-only passage filters; explicit prior-exposure exclusions; and the inspected source fingerprint.

`AAMC_Category_Crosswalk.csv` includes category/skill summaries and source page locators. It demonstrates category-level destinations, not a machine-certified one-to-one mapping of every official bullet. Each question still needs an actual category and skill adjudicated from its solution; a parent's candidate category envelope is not automatically applied wholesale.

## Limits and next checks

The map covers the published content and reasoning dimensions inspected. It does not enumerate every possible unfamiliar research context, future outline change, or passage subject. Unmapped targets are held for classification review; supplied novel entities remain context when no outside knowledge is needed.

The 128-topic granularity is a reviewed product proposal. Learner navigation, question-bank supply, and heat-map usefulness need real-user feedback. The 10-question/3-context color threshold is an initial heuristic, not AAMC guidance or psychometric validation. Raw accuracy is performance on targeted questions, not a scaled score, causal diagnosis, or established mastery.

No website fetching/scoring implementation was modified or tested. The implementation acceptance cases are specified in `Question_Tagging_and_Heatmap.md`. Existing practice questions were not retagged or changed; example annotations are proposals. Future maintenance should preserve IDs, migrate splits/merges explicitly, inspect actual question solutions, and recheck the current AAMC source before a substantive scope update.
