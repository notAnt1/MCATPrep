# Canonical topic map integration — 2026-10-10

## Source and navigation

`data/topic-map-spec/MCAT_Topic_Map/MCAT_Topic_Map.json` is the unmodified canonical 1.0.0 vocabulary. All 128 topic IDs and 525 child IDs are preserved. The complete supplied bundle is retained beside it, including its original manifest and acceptance specification. Scope concepts participate in search but never become extra heat-map cells.

Practice has section filters, search, collapsed group/topic/subtopic navigation, available reviewed-question counts, and explicit integrated-practice counts. Whole topics include their children; child selections require that target in the solution. Zero-count selections are disabled. Whole passages remain intact, so delivered sessions may contain additional related questions beyond the matching-item count. Section filters apply to both practice modes. Existing unfinished sessions resume as before.

## Classification and review

The 50 active questions were inspected using their actual stems, options and worked solutions, not the bundle's illustrative question numbers (which describe a different batch). `canonical-annotations.json` records stable family ID, content/taxonomy/tagging versions, actual section, primary and essential secondary targets, category, dominant official skill, context, reviewer, rationale and uncertainty. `canonical-inventory.json` omits solution-bearing rationale from the selection catalog. Live inventory comes from the published bank through an authenticated metadata-only RPC.

45 items are AI-reviewed; 5 are held for classification review (listed in `data/reviewed/canonical-review.md`). Held items remain in the bank and can accompany complete passages or balanced sessions, but do not qualify as targeted practice or scored topic evidence. None have independent human validation. The 94 archived questions remain untouched and are not silently assigned guessed canonical tags. Historical attempts lacking a matching reviewed version remain outside canonical totals, with a visible review count.

CARS annotations classify reading tasks and evidence scope, including RWT for distant main-idea integration. Architecture and political-science passage subjects are context only; they never create knowledge-performance scores. Parent candidate categories are not automatically inherited. Additional official category adjudication and all AI annotations remain suitable for expert review.

## Additive migration and historical meaning

Apply `supabase/canonical-topics.sql` to an existing deployment after the existing passage API. Fresh setup includes it through `supabase/setup.sql`. It creates canonical-node and versioned-annotation tables, a private exposure ledger, metadata-only inventory/selection functions, and nullable/defaulted attempt evidence columns. Triggers snapshot annotations and family/context/difficulty metadata at scoring time and retain hint/display/answer/solution exposure. No question body, publication status, saved answer, score, session, or report is replaced or deleted. Migration reruns are tested.

Older attempts retain `exposure_known=false`: the previous system did not reliably record all prior answer/hint/solution exposure. They remain in history and learning statistics but cannot truthfully be promoted into confirmed fresh evidence. Known historical answers and hints seed the exposure ledger. Viewing a question in an abandoned new session prevents a subsequent session from calling it fresh. This tracks in-app exposure; outside study is not observable.

First exposure is determined over lifetime family history before date, section, session, or mode filtering. The main metric requires an unaided, unexposed first scored family response. Retries and assisted/unknown-history responses have separate learning totals. A correct retry never repairs first-exposure accuracy. Parent counts are a union of unique families, not sums of child percentages or overlapping tags. Distinct passage IDs and standalone families supply context counts. Unanswered questions in completed sessions are counted separately and never treated as incorrect; navigation abandonment is not inferred to be an explicit skip.

Future wording revisions must retain the family ID. Create a new annotation row with an increased content/tagging version and document any true family split. Taxonomy label edits retain IDs; splits/merges require an explicit mapping migration. Do not regenerate child IDs from labels or overwrite previously scored annotation snapshots. `scripts/classify-pilot.ts` is the initial batch annotation source, not an automatic classifier for arbitrary new questions.

## Heat maps and limitations

Default primary-target performance is grouped by canonical navigation groups, with section/search/mode/all-time-or-30-day filters and optional subtopic drilldowns. Integrated-target and official reasoning-skill views are explicitly separate. Cells distinguish unavailable, unattempted, actual zero, and limited evidence. Full-strength colors require 10 eligible families and 3 contexts; this is provisional, not a validated mastery threshold. Details show correct/attempted counts, contexts, estimated difficulty composition, prior-passage exposure and learning/retry outcomes.

Existing saved narrative reports keep their original free-text labels and earlier analytics. They are labeled separately from the new canonical evidence policy, rather than being rewritten retroactively. The old overall/session score summaries remain descriptive totals including repeats and assistance. No raw accuracy is converted into an MCAT score. Difficulty and timing targets remain estimates; no empirical calibration is claimed.

## Validation and deployment evidence

The acceptance tests cover incidental insulin context, exact passive-versus-active selection, multiple children under one parent, 2/3 parent accuracy, wrong-first/correct-retry behavior across date windows, hint/answer/solution exposure, unavailable versus unattempted versus zero, content revisions sharing a family, novel CARS subjects and RWT integration, and cross-section/difficulty/context preservation. Database tests additionally cover idempotence, authenticated-only inventory, hidden rationales, whole passages, persisted hints, evidence snapshots and retries. The existing scoring/privacy/tutor tests remain passing.

Live migration verification: 144 total questions, 50 published, 89 attempts and 27 sessions both before and after. Question-body/publication checksum stayed `c46e2999aa42e18508777426cf30298f`. Added 653 canonical nodes and 50 annotations; all 89 historical attempts remained historical (zero silently promoted fresh observations).

Needs review: five flagged classifications, the archived bank if reintroduced, independent expert review of AI tagging, empirical difficulty calibration, learner usability, and the provisional evidence/color thresholds. No new questions were invented to fill empty taxonomy cells.
