import { useCallback, useEffect, useState } from "react";
import { Download, Play, Square } from "lucide-react";
import { api, formatDate, isActive } from "./api";
import type { SavedStudy, Study } from "./types";
import type {
  Metric,
  SimulationConfig,
  SimulationSummary,
  SimulationView,
} from "./simulation-types";
import SimulationDiagram from "./SimulationDiagram";
import { Histogram, SizeExplorer } from "./SimulationCharts";
import "./simulation.css";

const metricLabels: Record<Metric, string> = {
  initial_accuracy: "Initial accuracy",
  final_accuracy: "Final accuracy",
  answer_change: "Answer-change rate",
  peer_selection: "Final peer-answer selection",
  adoption: "Observed adoption among initial non-peer answers",
};
const percent = (value: number | null) =>
  value == null ? "—" : `${(value * 100).toFixed(2)}%`;
const pp = (value: number | null) =>
  value == null ? "—" : `${value.toFixed(2)} pp`;
const interval = (value: { low: number | null; high: number | null }) =>
  value.low == null
    ? "—"
    : `${value.low.toFixed(2)} to ${value.high!.toFixed(2)} pp`;

export default function StudyRehearsal({
  draft,
  saved,
  dirty,
  saveDraft,
  visible,
  recordsOnly,
  onOpen,
}: {
  draft: Study;
  saved: SavedStudy | null;
  dirty: boolean;
  saveDraft: () => Promise<SavedStudy>;
  visible: boolean;
  recordsOnly: boolean;
  onOpen: () => void;
}) {
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [sizesText, setSizesText] = useState("25, 400");
  const [explore, setExplore] = useState(false);
  const [history, setHistory] = useState<SimulationSummary[]>([]);
  const [run, setRun] = useState<SimulationView | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const report = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Simulation request failed."),
    [],
  );
  const refresh = useCallback(
    async () => setHistory(await api<SimulationSummary[]>("/simulations")),
    [],
  );
  const fetchRun = (id: string) =>
    api<SimulationView>(`/simulations/${id}?summary_only=true`);
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<SimulationConfig>("/simulation-settings"),
      api<SimulationSummary[]>("/simulations"),
      api<{ active_simulation: string | null }>("/health"),
    ])
      .then(async ([defaults, records, health]) => {
        if (!alive) return;
        setConfig(defaults);
        setHistory(records);
        if (health.active_simulation) {
          const current = await fetchRun(health.active_simulation);
          if (alive) {
            setRun(current);
            setSelectedSize(current.config.participants_per_condition);
          }
        }
      })
      .catch(report);
    return () => {
      alive = false;
    };
  }, [report]);
  const active = !!run && isActive(run.status);
  const runId = run?.id;
  useEffect(() => {
    if (!active || !runId) return;
    let alive = true;
    let timer: number;
    const poll = async () => {
      try {
        const updated = await fetchRun(runId);
        if (!alive) return;
        setRun(updated);
        if (!isActive(updated.status)) {
          setCancelling(false);
          await refresh();
        }
      } catch (e) {
        if (alive) report(e);
      }
      if (alive) timer = window.setTimeout(poll, 500);
    };
    timer = window.setTimeout(poll, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, runId, refresh, report]);

  async function open(id: string) {
    setError("");
    try {
      const record = await fetchRun(id);
      setRun(record);
      setSelectedSize(record.config.participants_per_condition);
      onOpen();
    } catch (e) {
      report(e);
    }
  }
  const peerChoices = new Set(draft.peers.map((p) => p.choice_id));
  const peerChoice = draft.peers[0]?.choice_id;
  const invalidStudy =
    draft.options.length < 2
      ? "Add at least two answer choices in Study design."
      : peerChoices.size !== 1
        ? "All scripted peers must select the same answer for this mode. Update Study design."
        : peerChoice === draft.ground_truth
          ? "Choose a scripted peer answer different from the correct answer in Study design."
          : "";

  async function launch() {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      const sizes = explore
        ? sizesText.split(",").map((s) => Number(s.trim()))
        : [];
      if (
        explore &&
        (!sizesText.trim() ||
          sizes.some((n) => !Number.isInteger(n) || n < 1 || n > 10000))
      )
        throw new Error(
          "Enter comparison sizes as whole numbers from 1 to 10,000, separated by commas.",
        );
      const frozen = { ...config, comparison_sizes: sizes };
      if (sizes.length > 5 || new Set(sizes).size !== sizes.length)
        throw new Error("Enter up to five distinct comparison sizes.");
      if (
        2 *
          [...new Set([config.participants_per_condition, ...sizes])].reduce(
            (a, b) => a + b,
            0,
          ) *
          config.repetitions >
        20000000
      )
        throw new Error(
          "Reduce sample sizes or repetitions: the limit is 20,000,000 simulated participants per run.",
        );
      const revision = dirty || !saved ? await saveDraft() : saved;
      const result = await api<{ id: string }>("/simulations", {
        study_id: revision.id,
        revision: revision.revision,
        config: frozen,
      });
      setRun(await fetchRun(result.id));
      setSelectedSize(config.participants_per_condition);
      setCancelling(false);
      await refresh();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!run) return;
    setCancelling(true);
    try {
      await api(`/simulations/${run.id}/cancel`, {});
    } catch (e) {
      setCancelling(false);
      report(e);
    }
  }
  const chosen =
    run?.aggregate.find((a) => a.participants_per_condition === selectedSize) ??
    run?.aggregate[0];
  const diagramConfig = run?.config ?? config;
  return (
    <div className="study-simulation" hidden={!visible}>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {!recordsOnly && (
        <>
          <div className="sim-notice">
            <strong>Probability simulation · offline</strong>
            <p>
              Simulated results under user-defined assumptions. These are
              neither human evidence nor measured AI-model behavior. No model
              API calls are made.
            </p>
          </div>
          {config ? (
            <form
              className="card sim-config"
              onSubmit={(e) => {
                e.preventDefault();
                void launch();
              }}
            >
              <h2>Configure repeated studies</h2>
              <p className="sim-study-title">
                {draft.title} ·{" "}
                {dirty
                  ? "current edits will be saved as a new revision"
                  : `revision ${saved?.revision}`}
              </p>
              <details>
                <summary>Current task and answer mapping</summary>
                <p>{draft.instructions}</p>
                <p>{draft.question}</p>
                <ol type="A">
                  {draft.options.map((o) => (
                    <li key={o.id}>
                      {o.text}
                      {o.id === draft.ground_truth ? " · correct answer" : ""}
                      {o.id === peerChoice ? " · scripted peer answer" : ""}
                    </li>
                  ))}
                </ol>
                <p>
                  The simulation uses answer identities and the answer key.
                  Question difficulty and peer wording do not change the
                  probabilities.
                </p>
              </details>
              {invalidStudy && (
                <p className="message error" role="alert">
                  {invalidStudy}
                </p>
              )}
              <fieldset disabled={busy || active}>
                <legend>
                  Fixed assumptions for every simulated participant
                </legend>
                <div className="sim-fields">
                  <label>
                    Participants per condition
                    <input
                      type="number"
                      required
                      min="1"
                      max="10000"
                      step="1"
                      value={config.participants_per_condition}
                      aria-label="Participants per condition"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          participants_per_condition: Number(e.target.value),
                        })
                      }
                    />
                    <small>
                      {config.participants_per_condition * 2} total participants
                      in one primary-size study
                    </small>
                  </label>
                  <label>
                    Monte Carlo repetitions per sample size
                    <input
                      type="number"
                      required
                      min="1"
                      max="2000"
                      step="1"
                      value={config.repetitions}
                      aria-label="Monte Carlo repetitions per sample size"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          repetitions: Number(e.target.value),
                        })
                      }
                    />
                    <small>Each repetition is a fresh, independent study</small>
                  </label>
                  <label>
                    Initial-correctness probability
                    <input
                      type="number"
                      required
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.initial_correctness}
                      aria-label="Initial-correctness probability"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          initial_correctness: Number(e.target.value),
                        })
                      }
                    />
                    <small>0–1; same distribution in both groups</small>
                  </label>
                  <label>
                    Baseline answer-change probability
                    <input
                      type="number"
                      required
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.baseline_change}
                      aria-label="Baseline answer-change probability"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          baseline_change: Number(e.target.value),
                        })
                      }
                    />
                    <small>0–1; switch uniformly to another option</small>
                  </label>
                  <label>
                    Peer-adoption probability
                    <input
                      type="number"
                      required
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.peer_adoption}
                      aria-label="Peer-adoption probability"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          peer_adoption: Number(e.target.value),
                        })
                      }
                    />
                    <small>
                      0–1; treatment rule after baseline, not an observed
                      conformity rate
                    </small>
                  </label>
                  <label>
                    Random seed
                    <input
                      type="number"
                      required
                      min="0"
                      max="4294967295"
                      step="1"
                      value={config.seed}
                      aria-label="Random seed"
                      onChange={(e) =>
                        setConfig({ ...config, seed: Number(e.target.value) })
                      }
                    />
                    <small>
                      Reproduces streams with the same model and library
                      versions
                    </small>
                  </label>
                </div>
                <label className="sim-checkbox">
                  <input
                    type="checkbox"
                    checked={explore}
                    onChange={(e) => setExplore(e.target.checked)}
                  />
                  Compare sample sizes
                </label>
                {explore && (
                  <label className="sim-size-input">
                    Additional participants per condition
                    <input
                      value={sizesText}
                      aria-label="Additional participants per condition"
                      onChange={(e) => setSizesText(e.target.value)}
                      required
                      placeholder="25, 400"
                    />
                    <small>
                      Up to five distinct sizes, comma-separated. Primary size
                      is always included; other assumptions stay fixed.
                    </small>
                  </label>
                )}
                <p className="sim-limits">
                  Limits: 10,000 participants per condition; 2,000 repetitions
                  per size; 20 million simulated participants across the run.
                </p>
              </fieldset>
              <div className="sim-actions">
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || active || !!invalidStudy}
                >
                  <Play size={16} />
                  {busy ? "Starting…" : "Run study simulation"}
                </button>
                {active && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={cancel}
                    disabled={cancelling}
                  >
                    <Square size={15} />
                    {cancelling
                      ? "Stopping after current study…"
                      : "Cancel simulation"}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p>Loading simulation settings…</p>
          )}
          {run && (
            <section
              className="card sim-results"
              aria-labelledby="simulation-results-title"
            >
              <div className="sim-result-heading">
                <div>
                  <span className="eyebrow">
                    SIMULATED RESULTS UNDER FIXED ASSUMPTIONS
                  </span>
                  <h2 id="simulation-results-title">{run.protocol.title}</h2>
                  <p>
                    Frozen revision {run.revision} · seed {run.config.seed} ·{" "}
                    {formatDate(run.created_at)}
                  </p>
                </div>
                <span className="badge">{run.status}</span>
              </div>
              <div role="status" className="sim-progress">
                {run.completed_repetitions} / {run.planned_repetitions}{" "}
                simulated studies complete across {run.sample_sizes.length}{" "}
                sample size{run.sample_sizes.length === 1 ? "" : "s"}
                <progress
                  aria-label="Simulation completion"
                  max={run.planned_repetitions}
                  value={run.completed_repetitions}
                />
              </div>
              {run.error && <p role="alert">{run.error}</p>}
              {run.status !== "completed" && (
                <p>
                  Partial results include only completed studies. Unfinished
                  repetitions are not scored or filled in.
                </p>
              )}
              <label className="sim-size-input">
                Result sample size
                <select
                  aria-label="Result sample size"
                  value={chosen?.participants_per_condition ?? ""}
                  onChange={(e) => setSelectedSize(Number(e.target.value))}
                >
                  {run.sample_sizes.map((n) => (
                    <option key={n} value={n}>
                      {n} per condition · {2 * n} total per study
                      {n === run.config.participants_per_condition
                        ? " · primary size"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {chosen && (
                <>
                  <p>
                    {chosen.completed_repetitions} / {run.config.repetitions}{" "}
                    repetitions completed at this sample size.
                  </p>
                  <div className="sim-primary-metrics">
                    <div>
                      <span>Mean final peer-answer selection difference</span>
                      <strong>
                        {pp(chosen.difference_pp.peer_selection.mean)}
                      </strong>
                      <small>Treatment minus control</small>
                    </div>
                    <div>
                      <span>95% simulation interval</span>
                      <strong>
                        {interval(chosen.difference_pp.peer_selection)}
                      </strong>
                      <small>Middle 95% of repeated-study differences</small>
                    </div>
                  </div>
                  {chosen.completed_repetitions < 40 && (
                    <p>
                      Few repetitions: interval endpoints are unstable; one
                      repetition cannot show variability.
                    </p>
                  )}
                  <Histogram result={chosen} />
                  <h3>Condition metrics across repeated studies</h3>
                  <p>
                    Percentages are means of valid per-study rates. Counts below
                    pool numerator / denominator across completed repetitions to
                    make eligibility visible; they are not the sample size of
                    one study.
                  </p>
                  <div className="sim-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Control</th>
                          <th>Treatment</th>
                          <th>Mean difference</th>
                          <th>95% simulation interval</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.keys(metricLabels) as Metric[]).map(
                          (metric) => (
                            <tr key={metric}>
                              <th scope="row">{metricLabels[metric]}</th>
                              {(["control", "treatment"] as const).map(
                                (arm) => (
                                  <td key={arm}>
                                    {percent(chosen[arm][metric].mean)}
                                    <small>
                                      {chosen[arm][metric].numerator_total} /{" "}
                                      {chosen[arm][metric].denominator_total}{" "}
                                      across repetitions
                                    </small>
                                    <small>
                                      {chosen[arm][metric].count} valid studies
                                    </small>
                                  </td>
                                ),
                              )}
                              <td>
                                {pp(chosen.difference_pp[metric].mean)}
                                <small>
                                  {chosen.difference_pp[metric].count} valid
                                  study differences
                                </small>
                              </td>
                              <td>{interval(chosen.difference_pp[metric])}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    Observed adoption means initial non-peer → final peer,
                    including baseline switches. Its denominator excludes
                    initial peer answers. If either group has zero eligible
                    participants in a repetition, its adoption difference is
                    missing (—), not zero. Peer adoption is a model assumption;
                    it is not this observed rate.
                  </p>
                  <p>
                    A 95% simulation interval describes outcomes under these
                    assumptions. It is not a confidence interval for human
                    behavior. Positive differences are not claims of statistical
                    significance; no power analysis is performed.
                  </p>
                </>
              )}
              <details>
                <summary>Frozen protocol, assumptions and provenance</summary>
                <pre className="json">
                  {JSON.stringify(
                    {
                      id: run.id,
                      study_id: run.study_id,
                      revision: run.revision,
                      protocol: run.protocol,
                      config: run.config,
                      config_hash: run.config_hash,
                      protocol_hash: run.protocol_hash,
                      provenance: run.provenance,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <div className="sim-actions">
                <a
                  className="secondary"
                  href={`/api/simulations/${run.id}/export/json`}
                >
                  <Download size={16} />
                  Simulation JSON
                </a>
                <a
                  className="secondary"
                  href={`/api/simulations/${run.id}/export/repetitions.csv`}
                >
                  <Download size={16} />
                  Per-repetition CSV
                </a>
              </div>
              {active && (
                <p>
                  Exports are a snapshot of completed repetitions at download
                  time.
                </p>
              )}
            </section>
          )}
          {run && run.sample_sizes.length > 1 && (
            <SizeExplorer results={run.aggregate} />
          )}
          {diagramConfig && (
            <SimulationDiagram
              config={diagramConfig}
              completed={run?.completed_repetitions ?? 0}
              planned={run?.planned_repetitions ?? config!.repetitions}
              active={active}
            />
          )}
          {run && (
            <p className="sim-diagram-caption">
              The diagram describes the displayed run’s frozen assumptions. Edit
              the controls and start a new run to explore different assumptions.
            </p>
          )}
        </>
      )}
      <section className="card sim-history">
        <h2>Saved study simulations</h2>
        <p>
          Probability-based runs, separate from participant invocation records.
        </p>
        {history.length ? (
          <div className="sim-history-list">
            {history.map((record) => (
              <button
                type="button"
                className="sim-history-item"
                key={record.id}
                onClick={() => void open(record.id)}
                disabled={active && record.id !== runId}
              >
                <strong>{record.protocol.title}</strong>
                <span>
                  {record.status} · revision {record.revision} ·{" "}
                  {record.completed_repetitions}/{record.planned_repetitions}{" "}
                  studies · {formatDate(record.created_at)}
                </span>
                <small>{record.id}</small>
              </button>
            ))}
          </div>
        ) : (
          <p>No saved simulations yet. Open Study rehearsal to begin.</p>
        )}
      </section>
    </div>
  );
}
