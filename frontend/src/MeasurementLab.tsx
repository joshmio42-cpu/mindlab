import { useEffect, useState } from "react";
import { api, formatDate } from "./api";
import { ReferenceNotes, type ReferenceNote } from "./PracticeEvidence";
import "./evidence-lab.css";

type Config = {
  repetitions: number;
  short_length: number;
  long_length: number;
  seed: number;
  population_mean: number;
  population_sd: number;
  lapse: number;
};
type Summary = {
  length: number;
  selection: string;
  n: number;
  bias: number;
  rmse: number;
  coverage: number;
  coverage_mc_se: number;
  mean_interval_width: number;
  exposure: number[];
};
type Run = {
  id: string;
  status: string;
  config: Config;
  created_at: string;
  completed_repetitions: number;
  planned_repetitions: number;
  error: string | null;
  aggregate: Summary[];
  protocol: { limits: string; items: { id: string; difficulty: number }[] };
  provenance: { references: ReferenceNote[] };
};
const terminal = new Set(["completed", "cancelled", "interrupted", "failed"]);

export default function MeasurementLab({
  onEncounter,
}: {
  onEncounter: () => void;
}) {
  const [config, setConfig] = useState<Config>({
    repetitions: 200,
    short_length: 5,
    long_length: 15,
    seed: 42,
    population_mean: 0,
    population_sd: 1,
    lapse: 0,
  });
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [refs, setRefs] = useState<ReferenceNote[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Run[]>("/measurement/runs"),
      api<{ references: ReferenceNote[] }>("/measurement/definition"),
    ])
      .then(([h, d]) => {
        if (active) {
          setHistory(h);
          setRefs(d.references);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const activeId = run && !terminal.has(run.status) ? run.id : null;
  useEffect(() => {
    if (!activeId) return;
    let active = true;
    const timer = setInterval(() => {
      api<Run>(`/simulations/${activeId}?summary_only=true`)
        .then(async (r) => {
          if (active) setRun(r);
          if (terminal.has(r.status)) {
            const h = await api<Run[]>("/measurement/runs");
            if (active) setHistory(h);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 700);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeId]);
  const controls: [keyof Config, string, number, number, number][] = [
    ["short_length", "Short test length", 2, 30, 1],
    ["long_length", "Long test length", 2, 30, 1],
    ["repetitions", "Simulated people / repetitions", 1, 1000, 1],
    ["seed", "Seed", 0, 4294967295, 1],
    ["population_mean", "Generating population mean", -2, 2, 0.25],
    ["population_sd", "Generating population SD", 0.25, 2, 0.25],
    ["lapse", "Random-response mixture", 0, 0.5, 0.05],
  ];
  return (
    <main className="evidence-lab">
      <header>
        <span className="small-kicker">ASSESSMENT & PSYCHOMETRICS</span>
        <h1>A measurement is an estimate.</h1>
        <p>
          Explore an original synthetic item bank. Compare test lengths and
          selection rules, then practice explaining uncertainty in a fictional
          encounter.
        </p>
        <button className="practice-secondary" onClick={onEncounter}>
          Discuss a fictional score report →
        </button>
      </header>
      <ol className="simulation-flow" aria-label="Measurement simulation flow">
        <li>Choose assumptions</li>
        <li>Draw synthetic ability</li>
        <li>Select items & generate responses</li>
        <li>Estimate with a fixed model</li>
        <li>Compare error & exposure</li>
      </ol>
      <div className="lab-layout">
        <form
          className="practice-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const { id } = await api<{ id: string }>(
                "/measurement/runs",
                config,
              );
              setRun(await api<Run>(`/simulations/${id}?summary_only=true`));
              setHistory(await api<Run[]>("/measurement/runs"));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Launch failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Make assumptions visible</h2>
          {controls.map(([key, label, min, max, step]) => (
            <label className="practice-field" key={key}>
              {label}
              <input
                required
                type="number"
                min={min}
                max={max}
                step={step}
                value={config[key]}
                onChange={(e) =>
                  setConfig({ ...config, [key]: e.target.valueAsNumber })
                }
              />
            </label>
          ))}
          <p>
            41 binary items; difficulties evenly spaced from −3 to 3. The
            estimator always uses a standard normal prior and assumes no
            random-response mixture. Changing the generating population or noise
            deliberately creates model mismatch.
          </p>
          <button
            className="practice-primary"
            disabled={busy || Boolean(activeId)}
          >
            Run measurement rehearsal
          </button>
          {activeId && (
            <button
              type="button"
              className="practice-secondary"
              onClick={async () => {
                try {
                  await api(`/simulations/${activeId}/cancel`, {});
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Cancel rehearsal
            </button>
          )}
          <details>
            <summary>What the methods assume</summary>
            <p>
              Responses follow a one-parameter logistic model, mixed with random
              50/50 responses at the selected rate. Fixed tests spread items
              across the bank. Adaptive tests choose the unused item nearest the
              current estimated ability, with lower-index tie breaking.
            </p>
            <p>
              Estimates are posterior means on 201 nodes from −5 to 5. Intervals
              contain the central 95% of that posterior. Designs within a
              repetition share the same ability and potential response per item.
              Repetitions are independent.
            </p>
            <p>
              Simulation coverage is the fraction of generated abilities inside
              these intervals. It is not a guarantee for real people.
            </p>
          </details>
        </form>
        <section className="lab-results">
          {error && <p role="alert">{error}</p>}
          {run ? (
            <>
              <div className="practice-panel">
                <h2>Simulator results</h2>
                <p role="status">
                  {run.status} · {run.completed_repetitions}/
                  {run.planned_repetitions} repetitions · seed {run.config.seed}
                </p>
                {run.error && <p role="alert">{run.error}</p>}
                <p>
                  Generating mean {run.config.population_mean}, SD{" "}
                  {run.config.population_sd}; noise mixture {run.config.lapse}.
                  Results retain the settings used when this run began.
                </p>
                <div className="lab-table">
                  <table>
                    <caption>
                      Error and empirical interval coverage on the synthetic
                      ability scale
                    </caption>
                    <thead>
                      <tr>
                        <th>Design</th>
                        <th>Bias</th>
                        <th>RMSE</th>
                        <th>Coverage</th>
                        <th>Coverage MC SE</th>
                        <th>Mean width</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.aggregate.map((s) => (
                        <tr key={`${s.length}-${s.selection}`}>
                          <th>
                            {s.length} items · {s.selection}
                          </th>
                          <td>{s.bias.toFixed(3)}</td>
                          <td>{s.rmse.toFixed(3)}</td>
                          <td>{(100 * s.coverage).toFixed(1)}%</td>
                          <td>{(100 * s.coverage_mc_se).toFixed(1)} pp</td>
                          <td>{s.mean_interval_width.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Bias is mean estimate minus truth. RMSE includes bias and
                  variability. Monte Carlo SE describes sampling noise in the
                  reported coverage estimate.
                </p>
                <a
                  className="practice-secondary"
                  href={`/api/simulations/${run.id}/export/json`}
                  download
                >
                  Export assumptions, item bank & every repetition
                </a>
              </div>
              <div className="practice-panel">
                <h2>Which items get used?</h2>
                <p>
                  Exposure is the fraction of simulated people receiving an
                  item. Each design is shown separately.
                </p>
                {run.aggregate.map((s) => (
                  <figure key={`${s.length}-${s.selection}`}>
                    <figcaption>
                      {s.length} items · {s.selection} · {s.n} simulated people
                    </figcaption>
                    <svg
                      viewBox="0 0 500 125"
                      role="img"
                      aria-label={`Item exposure for ${s.length} item ${s.selection} test`}
                    >
                      <line
                        x1="30"
                        y1="100"
                        x2="480"
                        y2="100"
                        stroke="#9bacab"
                      />
                      <text x="0" y="15" fontSize="11">
                        100%
                      </text>
                      <text x="8" y="100" fontSize="11">
                        0%
                      </text>
                      {s.exposure.map((v, i) => (
                        <rect
                          key={i}
                          x={32 + i * 10.8}
                          y={100 - v * 85}
                          width="8"
                          height={v * 85}
                          fill={
                            s.selection === "adaptive" ? "#1b7567" : "#b28743"
                          }
                        >
                          <title>
                            {run.protocol.items[i].id}: {(v * 100).toFixed(1)}%
                          </title>
                        </rect>
                      ))}
                      <text x="30" y="120" fontSize="11">
                        Difficulty −3
                      </text>
                      <text x="415" y="120" fontSize="11">
                        +3
                      </text>
                    </svg>
                    <details>
                      <summary>Exposure values</summary>
                      <p>
                        {s.exposure
                          .map((v, i) => `${i + 1}: ${(v * 100).toFixed(1)}%`)
                          .join(" · ")}
                      </p>
                    </details>
                  </figure>
                ))}
              </div>
            </>
          ) : (
            <div className="practice-panel">
              <h2>Start with a comparison</h2>
              <p>
                Run the default 5-item and 15-item tests. Then change the
                generating population or response noise and inspect how the same
                estimation assumptions behave.
              </p>
            </div>
          )}
          <div className="practice-panel">
            <h2>What this exercise leaves open</h2>
            <p>
              Parameter recovery is not evidence of construct validity. There
              are no calibrated test items, real norms, human response patterns,
              clinical thresholds, or validated fairness conclusions here.
              Synthetic noise cannot identify invalid responding in a person.
            </p>
            <p>
              Consider: What evidence would justify your assessment choice?
              Which population would the norms need to represent? What response
              conditions, language needs, uncertainty and alternative
              explanations would you check?
            </p>
            <ReferenceNotes notes={run?.provenance.references || refs} />
          </div>
          <details className="practice-panel">
            <summary>Saved measurement rehearsals ({history.length})</summary>
            {history.map((h) => (
              <button
                className="history-run"
                key={h.id}
                onClick={async () => {
                  try {
                    setRun(
                      await api<Run>(`/simulations/${h.id}?summary_only=true`),
                    );
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                {formatDate(h.created_at)} · {h.status} · seed {h.config.seed}
              </button>
            ))}
          </details>
        </section>
      </div>
    </main>
  );
}
