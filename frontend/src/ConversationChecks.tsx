import { useEffect, useState } from "react";
import { api, formatDate } from "./api";
type Row = {
  case_id: string;
  repetitions: number;
  attempts: number;
  failures: number;
  disclosure_flags: number;
  refusal_flags: number;
  unsupported_evidence_links: number;
  opening_baseline_refusal_flags: number;
  unique_replies_per_probe: number[];
};
type Evaluation = {
  id: string;
  status: string;
  error: string | null;
  aggregate: Row[];
};
export default function ConversationChecks() {
  const [run, setRun] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<
    { id: string; created_at: string; status: string }[]
  >([]);
  useEffect(() => {
    let active = true;
    api<typeof history>("/practice/evaluations")
      .then((h) => {
        if (active) setHistory(h);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const activeId =
    run && ["queued", "running"].includes(run.status) ? run.id : null;
  useEffect(() => {
    if (!activeId) return;
    let active = true;
    const timer = setInterval(() => {
      api<Evaluation>(`/simulations/${activeId}?summary_only=true`)
        .then((r) => {
          if (active) setRun(r);
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
  return (
    <details className="practice-panel source-registry">
      <summary>Conversation simulator checks</summary>
      <p>
        Repeat three development probes three times within each case. Compare
        the scripted client against a baseline that always repeats the opening.
        No model calls. Deterministic replies should not vary within a case;
        differences between cases are shown separately.
      </p>
      <button
        className="practice-secondary"
        disabled={busy || Boolean(activeId)}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { id } = await api<{ id: string }>("/practice/evaluations", {
              repetitions: 3,
            });
            setRun(
              await api<Evaluation>(`/simulations/${id}?summary_only=true`),
            );
            setHistory(await api<typeof history>("/practice/evaluations"));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not run");
          } finally {
            setBusy(false);
          }
        }}
      >
        Run conversation checks
      </button>
      {error && <p role="alert">{error}</p>}
      {run && (
        <>
          <p role="status">
            {run.status}
            {run.error ? ` · ${run.error}` : ""}
          </p>
          {run.aggregate.map((r) => (
            <article key={r.case_id}>
              <h3>{r.case_id}</h3>
              <p>
                {r.repetitions} repeats · {r.attempts} attempts · {r.failures}{" "}
                failures
              </p>
              <p>
                Early-disclosure flags: {r.disclosure_flags}. Missing refusal
                flags: {r.refusal_flags} (opening-only baseline:{" "}
                {r.opening_baseline_refusal_flags}). Unsupported evidence links:{" "}
                {r.unsupported_evidence_links}.
              </p>
              <p>
                Distinct replies across repeats for each probe:{" "}
                {r.unique_replies_per_probe.join(", ")}.
              </p>
            </article>
          ))}
          <a href={`/api/simulations/${run.id}/export/json`} download>
            Export probes, transcripts, failures and versions
          </a>
        </>
      )}
      <p>
        Literal markers and exact evidence-link checks do not detect every
        factual error or unsupported interpretation. Human ratings, independent
        held-out cases, and cultural review are still needed. These are
        simulator diagnostics, not evidence of learning benefit or real client
        behavior.
      </p>
      <details>
        <summary>Saved checks</summary>
        {history.map((h) => (
          <button
            className="history-run"
            key={h.id}
            onClick={async () => {
              try {
                setRun(
                  await api<Evaluation>(
                    `/simulations/${h.id}?summary_only=true`,
                  ),
                );
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {formatDate(h.created_at)} · {h.id}
          </button>
        ))}
      </details>
    </details>
  );
}
