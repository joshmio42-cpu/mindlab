import { useState } from "react";
import type { SimulationConfig } from "./simulation-types";

export default function SimulationDiagram({
  config,
  completed,
  planned,
  active,
}: {
  config: SimulationConfig;
  completed: number;
  planned: number;
  active: boolean;
}) {
  const [selected, setSelected] = useState("config");
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const steps: Record<string, { title: string; detail: string }> = {
    config: {
      title: "Study + assumptions + seed",
      detail: `The saved question, answer choices, correct-answer key and unanimous incorrect peer answer define the task. Probabilities are fixed for every participant. Seed ${config.seed} determines reproducible random streams. Text is recorded but is not understood or answered by the code.`,
    },
    loop: {
      title: "Monte Carlo repetition loop",
      detail: `${config.repetitions} repetitions per sample size. One participant is one simulated initial/final answer pair. One study has two independent groups. Each repetition generates a fresh study, not another answer from the same participant.`,
    },
    groups: {
      title: "Generate independent groups",
      detail: `At the primary size, each study has ${config.participants_per_condition} control and ${config.participants_per_condition} treatment participants (${2 * config.participants_per_condition} total). Both groups share the same initial-answer distribution, but use independent random streams.`,
    },
    initial: {
      title: "Initial answer",
      detail: `Each participant is initially correct with probability ${percent(config.initial_correctness)}. Otherwise the code selects uniformly among all incorrect options. This assumption is identical in both groups.`,
    },
    baseline: {
      title: "Baseline re-ask",
      detail: `In both groups, a ${percent(config.baseline_change)} probability triggers a switch to a uniformly selected other answer. This happens before the treatment peer-adoption step.`,
    },
    peer: {
      title: "Peer-adoption step",
      detail: `In treatment only, a ${percent(config.peer_adoption)} probability then replaces the answer with the scripted peer answer. This is a mathematical rule, not a live conversation with an AI model. Selecting an answer already held causes no additional change. A switch followed by a return to the initial answer is not an observed initial-to-final change.`,
    },
    final: {
      title: "Final answer",
      detail:
        "Control stops after the baseline re-ask; treatment stops after the peer rule. Only the initial and final answers determine observed answer changes. Intermediate switches are not counted as final changes.",
    },
    score: {
      title: "Score and compare",
      detail:
        "Score accuracy, initial-to-final answer changes, final peer-answer selection and observed adoption (initial non-peer → final peer). Adoption uses only participants whose initial answer differed from the peer answer. Zero eligible participants yields a missing rate, not zero. Subtract control from treatment, in percentage points.",
    },
    aggregate: {
      title: "Aggregate across repetitions",
      detail:
        "Retain per-study counts, denominators, rates and differences. Average valid per-study rates without pooling them. No synthetic participant records are saved by default. Partial runs retain only completed studies.",
    },
    distribution: {
      title: "Distribution + simulation interval",
      detail:
        "The histogram shows treatment-minus-control final peer-answer selection across repeated studies. Its mean and 2.5th–97.5th percentiles describe a 95% simulation interval under these assumptions. This is not a confidence interval for human behavior or a significance test.",
    },
    export: {
      title: "Compare sample sizes / export",
      detail:
        "Vary participants per condition while holding probabilities, repetition count, protocol and seed fixed. Separate streams are used for each sample size. Larger samples can reduce random variability without establishing realism. JSON retains the frozen configuration and provenance; CSV has one row per completed study.",
    },
  };
  function step(id: string, label?: string) {
    return (
      <button
        type="button"
        className={`sim-node ${selected === id ? "chosen" : ""}`}
        aria-pressed={selected === id}
        aria-controls="simulation-step-explanation"
        onClick={() => setSelected(id)}
      >
        {label ?? steps[id].title}
        {id === "loop" && active && (
          <span className="sim-loop-progress">
            {completed} / {planned} studies complete
            <progress
              aria-label="Diagram repetition progress"
              value={completed}
              max={planned}
            />
          </span>
        )}
      </button>
    );
  }
  return (
    <section
      className="card simulation-diagram"
      aria-labelledby="simulation-diagram-title"
    >
      <h2 id="simulation-diagram-title">How the simulation works</h2>
      <p>Choose a step to inspect its rule and assumptions.</p>
      <div
        className="sim-flow"
        role="group"
        aria-label="Interactive simulation sequence"
      >
        {step("config")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("loop")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("groups")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        <div className="sim-branches">
          <div className="sim-branch control">
            <h3>Control · neutral re-ask</h3>
            {step("initial", "Control: initial answer")}
            <span className="sim-arrow" aria-hidden="true">
              ↓
            </span>
            {step("baseline", "Control: baseline re-ask")}
            <span className="sim-arrow" aria-hidden="true">
              ↓
            </span>
            {step("final", "Control: final answer")}
          </div>
          <div className="sim-branch treatment">
            <h3>Treatment · scripted peer answer</h3>
            {step("initial", "Treatment: initial answer")}
            <span className="sim-arrow" aria-hidden="true">
              ↓
            </span>
            {step("baseline", "Treatment: baseline re-ask")}
            <span className="sim-arrow" aria-hidden="true">
              ↓
            </span>
            {step("peer")}
            <span className="sim-arrow" aria-hidden="true">
              ↓
            </span>
            {step("final", "Treatment: final answer")}
          </div>
        </div>
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("score")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("aggregate")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("distribution")}
        <span className="sim-arrow" aria-hidden="true">
          ↓
        </span>
        {step("export")}
      </div>
      <div
        id="simulation-step-explanation"
        className="sim-explanation"
        role="status"
      >
        <h3>{steps[selected].title}</h3>
        <p>{steps[selected].detail}</p>
      </div>
      <details>
        <summary>Accessible text equivalent</summary>
        <ol>
          {Object.entries(steps).map(([id, value]) => (
            <li key={id}>
              <strong>{value.title}.</strong> {value.detail}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
