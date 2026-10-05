import type { components } from "./schema";
export type Study = components["schemas"]["Study"];
export type Settings = components["schemas"]["Settings"];
export interface SavedStudy {
  id: string;
  revision: number;
  created_at: string;
  hash: string;
  study: Study;
}
export interface Health {
  ok: boolean;
  remote_available: boolean;
  remote_model: string | null;
  active_run: string | null;
}
export interface Preview {
  system: string;
  initial: string;
  schema: unknown;
  example_answer: { choice: string };
  notice: string;
  conditions: Record<
    "peer" | "control",
    { prompt: string; visible_history: unknown[] }
  >;
}
export interface Answer {
  token: string;
  choice_id: string;
}
export interface Session {
  id: string;
  pair_id: string;
  pair_number: number;
  arm: "peer" | "control";
  order: number;
  fixture: string | null;
  status: string;
  initial: Answer | null;
  revised: Answer | null;
  initial_correct: boolean | null;
  revised_correct: boolean | null;
  changed: boolean | null;
}
export interface Attempt {
  id: string;
  run_id: string;
  pair_id: string;
  session_id: string;
  stage_id: string;
  stage: string;
  number: number;
  purpose: string;
  retry_of: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  prompt: string;
  request: unknown;
  response: unknown;
  wire_request: unknown;
  wire_response: unknown;
  choice: Answer | null;
  error: string | null;
}
export interface ArmMetrics {
  scheduled: number;
  complete: number;
  missing: number;
  changed: number;
  initial_accuracy: { count: number; denominator: number };
  revised_accuracy: { count: number; denominator: number };
  correct_to_incorrect: { count: number; denominator: number };
  incorrect_to_correct: { count: number; denominator: number };
}
export interface Provenance {
  response_origin: string;
  execution_mode: string;
  model: string;
  [key: string]: unknown;
}
export interface RunSummary {
  id: string;
  study_id: string;
  revision: number;
  created_at: string;
  status: string;
  title: string;
  settings: Settings;
  metrics: Record<"peer" | "control", ArmMetrics>;
  provenance: Provenance;
}
export interface Run extends Omit<RunSummary, "title"> {
  protocol: Study;
  protocol_hash: string;
  mapping: Record<string, string>;
  updated_at: string;
  ended_at: string | null;
  sessions: Session[];
  attempts: Attempt[];
  planned_schedule: unknown[];
  realized_schedule: unknown[];
  events: { at: string; kind: string; detail: string }[];
  cancel_requested: boolean;
}
