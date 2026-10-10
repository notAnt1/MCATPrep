import vocabulary from "../../data/topic-map-spec/MCAT_Topic_Map/MCAT_Topic_Map.json";
export const taxonomy = vocabulary;
export const topics = vocabulary.topics;
export const groups = vocabulary.navigation_groups;
export const sections = ["C/P", "B/B", "P/S", "CARS"];
export type Annotation = {
  question_id: string;
  family_id: string;
  content_version: number;
  taxonomy_version: string;
  tagging_version: string;
  section: string;
  primary: string;
  secondary: string[];
  context: string[];
  categories: string[];
  skill: string;
  secondary_skills: string[];
  rationale: string;
  uncertainty: string;
  reviewer: string;
  review_status: "ai-reviewed" | "needs-review";
  passage_id: string | null;
  difficulty: string;
  difficulty_status: "estimated" | "empirical";
  published?: boolean;
};
const parents = new Map(
  topics.flatMap(
    (t) =>
      [[t.id, t.id], ...t.selectable_subtopics.map((s) => [s.id, t.id])] as [
        string,
        string,
      ][],
  ),
);
const labels = new Map(
  topics.flatMap(
    (t) =>
      [
        [t.id, t.label],
        ...t.selectable_subtopics.map((s) => [s.id, s.label]),
      ] as [string, string][],
  ),
);
export function parentId(id: string) {
  return parents.get(id);
}
export function targetLabel(id: string) {
  return labels.get(id) || id;
}
export function targetMatches(target: string, selection: string) {
  return target === selection || parentId(target) === selection;
}
export function annotationMatches(
  a: Annotation,
  selection: string,
  integrated = false,
) {
  return (
    a.review_status !== "needs-review" &&
    [a.primary, ...(integrated ? a.secondary : [])].some((t) =>
      targetMatches(t, selection),
    )
  );
}
export function availableItems(
  bank: Annotation[],
  selection: string,
  section = "",
  integrated = true,
) {
  return bank.filter(
    (a) =>
      a.published !== false &&
      (!section || a.section === section) &&
      annotationMatches(a, selection, integrated),
  );
}
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function searchTopics(query: string, section = "") {
  const words = norm(query).split(" ").filter(Boolean);
  return topics.filter(
    (t) =>
      (!section || t.section_filters.includes(section)) &&
      words.every((w) =>
        norm(
          [
            t.label,
            ...t.aliases,
            ...t.coverage_concepts,
            ...t.selectable_subtopics.map((s) => s.label),
          ].join(" "),
        ).includes(w),
      ),
  );
}
