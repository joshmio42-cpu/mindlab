import type { components } from "./schema";
import type { Study } from "./types";

export type SimulationConfig = Required<
  components["schemas"]["SimulationConfig"]
>;
export type Metric =
  | "initial_accuracy"
  | "final_accuracy"
  | "answer_change"
  | "peer_selection"
  | "adoption";
export interface Distribution {
  count: number;
  mean: number | null;
  low: number | null;
  high: number | null;
  sd: number | null;
}
export interface ConditionAggregate extends Distribution {
  numerator_total: number;
  denominator_total: number;
}
export interface SizeAggregate {
  participants_per_condition: number;
  completed_repetitions: number;
  control: Record<Metric, ConditionAggregate>;
  treatment: Record<Metric, ConditionAggregate>;
  difference_pp: Record<Metric, Distribution>;
  histogram: { low: number; high: number; count: number }[];
}
export interface SimulationSummary {
  id: string;
  study_id: string;
  revision: number;
  protocol: Study;
  protocol_hash: string;
  config: SimulationConfig;
  config_hash: string;
  peer_choice_id: string;
  mapping: Record<string, string>;
  sample_sizes: number[];
  planned_repetitions: number;
  completed_repetitions: number;
  status: string;
  cancel_requested: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  provenance: Record<string, unknown>;
}
export interface SimulationView extends SimulationSummary {
  aggregate: SizeAggregate[];
  events: { at: string; kind: string }[];
}
