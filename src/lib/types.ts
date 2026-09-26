export type Mode = "training" | "rapid";
export type Question = {
  id: string;
  topic: string;
  section: string;
  skill: string;
  difficulty: string;
  prompt: string;
  options: string[];
  target_seconds: number;
  version: number;
  source: string;
  passage?: string | null;
};
export type FullQuestion = Question & {
  answer: number;
  explanation: string;
  hints: string[];
};
export type Attempt = {
  id?: string;
  session_id: string;
  question_id: string;
  topic: string;
  section: string;
  skill: string;
  mode: Mode;
  correct: boolean;
  active_ms: number;
  target_seconds: number;
  hints_used: number;
  repeated: boolean;
  timing_valid: boolean;
  created_at: string;
  selected: number;
  points: number;
  question_version: number;
};
export type StudySession = {
  id: string;
  mode: Mode;
  question_ids: string[];
  created_at: string;
  completed_at: string | null;
  cursor: number;
  score: number;
};
export type Feedback = {
  correct: boolean;
  answer: number;
  explanation: string;
  points: number;
};
export type Report = {
  session_summary: string;
  overall_summary: string;
  strengths: string[];
  weaknesses: string[];
  next_steps: string[];
  overall_strengths: string[];
  overall_weaknesses: string[];
  overall_next_steps: string[];
  caveat: string;
};
