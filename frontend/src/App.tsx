import { cloneElement, useCallback, useEffect, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileJson,
  FlaskConical,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { api, formatDate, isActive } from "./api";
import StudyRehearsal from "./StudyRehearsal";
import type {
  Attempt,
  Health,
  Preview,
  Run,
  RunSummary,
  SavedStudy,
  Settings,
  Study,
} from "./types";

type Page = "design" | "preview" | "rehearsal" | "simulation" | "records";
const pages: {
  id: Page;
  label: string;
  icon: typeof BookOpen;
  step: string;
}[] = [
  { id: "design", label: "Study design", icon: BookOpen, step: "01" },
  { id: "preview", label: "Participant view", icon: Eye, step: "02" },
  { id: "rehearsal", label: "Rehearsal", icon: FlaskConical, step: "03" },
  { id: "simulation", label: "Study rehearsal", icon: Layers, step: "04" },
  { id: "records", label: "Saved records", icon: Database, step: "05" },
];
const fixtureLabels: Record<string, string> = {
  matrix: "Procedure suite",
  hold: "Hold initial answer",
  follow: "Follow displayed peer",
  reconsider: "Change on either re-ask",
  malformed: "Malformed JSON",
  unknown: "Unavailable answer token",
  flaky: "First transport attempt fails",
  stall: "Never responds (timeout / cancel)",
};
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "completed" || value === "valid"
          ? "green"
          : isActive(value) || value === "running"
            ? "amber"
            : value === "pending"
              ? ""
              : "rose"
      }
    >
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
function Json({ value }: { value: unknown }) {
  return (
    <pre className="json">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
function CardTitle({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="card-title">
      <span className="number">{number}</span>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("design");
  const [draft, setDraft] = useState<Study | null>(null);
  const [saved, setSaved] = useState<SavedStudy | null>(null);
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [view, setView] = useState<Preview | null>(null);
  const [exampleToken, setExampleToken] = useState("A");
  const [previewArm, setPreviewArm] = useState<"peer" | "control">("peer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const report = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Something went wrong."),
    [],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<Study>("/example"),
      api<Settings>("/settings"),
      api<Health>("/health"),
      api<SavedStudy[]>("/studies"),
      api<RunSummary[]>("/runs"),
    ])
      .then(([example, config, info, list, history]) => {
        if (alive) {
          setDraft(list[0]?.study ?? example);
          setSaved(list[0] ?? null);
          setSettings(config);
          setHealth(info);
          setStudies(list);
          setRuns(history);
          if (info.active_run)
            api<Run>(`/runs/${info.active_run}`)
              .then((r) => alive && setRun(r))
              .catch(report);
        }
      })
      .catch(report);
    return () => {
      alive = false;
    };
  }, [report]);

  useEffect(() => {
    if (page !== "preview" || !draft) return;
    let alive = true;
    setView(null);
    api<Preview>("/preview", { study: draft, example_token: exampleToken })
      .then((data) => {
        if (alive) setView(data);
      })
      .catch((e) => {
        if (alive) report(e);
      });
    return () => {
      alive = false;
    };
  }, [page, draft, exampleToken, report]);

  const active = run ? isActive(run.status) : false;
  const runId = run?.id;
  useEffect(() => {
    if (!runId || !active) return;
    let alive = true;
    const timer = window.setInterval(() => {
      api<Run>(`/runs/${runId}`)
        .then((data) => {
          if (!alive) return;
          setRun(data);
          if (!isActive(data.status)) {
            api<RunSummary[]>("/runs").then(setRuns).catch(report);
            api<Health>("/health").then(setHealth).catch(report);
          }
        })
        .catch(report);
    }, 400);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [runId, active, report]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    const result = await api<SavedStudy>(
      saved ? `/studies/${saved.id}` : "/studies",
      draft,
      saved ? "PUT" : "POST",
    );
    setSaved(result);
    setStudies(await api<SavedStudy[]>("/studies"));
    setNotice(`Revision ${result.revision} saved.`);
    return result;
  }
  function update<K extends keyof Study>(key: K, value: Study[K]) {
    setDraft((prev) => prev && { ...prev, [key]: value });
    setNotice("");
  }
  function configure<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => prev && { ...prev, [key]: value });
  }
  async function newStudy() {
    await action(async () => {
      const example = await api<Study>("/example");
      setDraft({ ...example, title: "Untitled conformity study" });
      setSaved(null);
      setExampleToken("A");
      setPage("design");
    });
  }
  async function openRun(id: string) {
    await action(async () => {
      setRun(await api<Run>(`/runs/${id}`));
      setSelectedAttempt(null);
      setPage("rehearsal");
    });
  }
  const dirty = !saved || JSON.stringify(draft) !== JSON.stringify(saved.study);
  const attempt =
    run?.attempts.find((a) => a.id === selectedAttempt) ??
    run?.attempts[run.attempts.length - 1];

  if (!draft || !settings)
    return (
      <main className="loading">
        <FlaskConical size={36} />
        <h1>Opening your workbench</h1>
        {error ? (
          <p role="alert">
            {error} <button onClick={() => location.reload()}>Try again</button>
          </p>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </main>
    );
  const token = (id: string) =>
    String.fromCharCode(65 + draft.options.findIndex((o) => o.id === id));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("design");
          }}
        >
          <span className="brand-mark">
            <FlaskConical size={23} />
          </span>
          <span>
            MindLab<span className="brand-sub">RESEARCH WORKBENCH</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">M</span>
          <div>
            Local workspace<small>Your procedure notebook</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Workspace">
          {pages.map(({ id, icon: Icon, label, step }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "selected" : ""}`}
              onClick={() => {
                setPage(id);
                setError("");
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              <small>{step}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-studies">
          <div className="nav-caption">
            YOUR STUDIES{" "}
            <button
              title="Create study"
              aria-label="Create study"
              onClick={newStudy}
            >
              <Plus size={16} />
            </button>
          </div>
          {studies.length ? (
            studies.slice(0, 5).map((s) => (
              <button
                className={`study-link ${s.id === saved?.id ? "current" : ""}`}
                key={s.id}
                title={s.study.title}
                onClick={() => {
                  setDraft(s.study);
                  setSaved(s);
                  setPage("design");
                  setExampleToken("A");
                  setNotice("");
                }}
              >
                <span className="study-dot" />
                {s.study.title}
              </button>
            ))
          ) : (
            <p className="sidebar-empty">
              Save your first study to begin a revision history.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span /> Local records
          </div>
          <p>
            Stored on this computer.
            <br />
            Every run keeps its own history.
          </p>
          <span className="version">MindLab / 0.1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{pages.find((p) => p.id === page)?.label}</span>
          </div>
          <Badge tone="green">
            <span className="status-dot" />
            {health?.remote_available
              ? "Model adapter available"
              : "Offline mode ready"}
          </Badge>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PSYCHOLOGY, WITH A CLEAR RECORD</div>
              <h1>
                {page === "design"
                  ? "Shape your next study."
                  : page === "preview"
                    ? "See what participants see."
                    : page === "rehearsal"
                      ? "Rehearse. Then look closer."
                      : page === "simulation"
                        ? "Explore assumptions. See variation."
                        : "A record of every rehearsal."}
              </h1>
              <p>
                {page === "design"
                  ? "Design a procedure, check the experience, and prepare for a human pilot."
                  : page === "preview"
                    ? "Review the exact prompt construction before any session begins."
                    : page === "rehearsal"
                      ? "Compare separate paired sessions and follow each answer back to its input."
                      : page === "simulation"
                        ? "Repeat simulated studies to explore sample size, probability and randomness."
                        : "Frozen protocols, complete attempts, and exports you can inspect."}
              </p>
            </div>
            {page === "design" && (
              <button
                className="secondary compact"
                onClick={newStudy}
                disabled={busy}
              >
                <Plus size={17} />
                New study
              </button>
            )}
          </div>
          <div className="science-note">
            <ShieldCheck size={18} />
            <span>
              Synthetic responses support procedure checks. They are not
              validated predictions of human behavior or replacements for human
              participants.
            </span>
          </div>
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}

          <StudyRehearsal
            draft={draft}
            saved={saved}
            dirty={dirty}
            saveDraft={saveDraft}
            visible={page === "simulation" || page === "records"}
            recordsOnly={page === "records"}
            onOpen={() => setPage("simulation")}
          />
          {page === "design" && (
            <>
              <div className="workflow">
                {pages.slice(0, 3).map((p, i) => (
                  <div
                    key={p.id}
                    className={`workflow-step${i === 0 ? " current" : ""}`}
                    aria-current={i === 0 ? "step" : undefined}
                  >
                    <span>{p.step}</span>
                    {p.label}
                    {i < 2 && <ChevronRight size={17} />}
                  </div>
                ))}
              </div>
              <div className="design-grid">
                <div className="stack">
                  <section className="card">
                    <CardTitle
                      number="01"
                      title="Study overview"
                      detail="The research context stays in your workspace."
                    />
                    <div className="private-label">
                      <LockKeyhole size={13} /> Researcher only
                    </div>
                    <Field label="Study title">
                      <input
                        value={draft.title}
                        onChange={(e) => update("title", e.target.value)}
                        maxLength={160}
                      />
                    </Field>
                    <Field label="Research question">
                      <textarea
                        rows={2}
                        value={draft.research_question}
                        onChange={(e) =>
                          update("research_question", e.target.value)
                        }
                      />
                    </Field>
                    <div className="field-grid">
                      <Field label="Hypothesis">
                        <textarea
                          rows={3}
                          value={draft.hypothesis}
                          onChange={(e) => update("hypothesis", e.target.value)}
                        />
                      </Field>
                      <Field label="Researcher notes">
                        <textarea
                          rows={3}
                          value={draft.notes}
                          onChange={(e) => update("notes", e.target.value)}
                        />
                      </Field>
                    </div>
                  </section>
                  <section className="card">
                    <CardTitle
                      number="02"
                      title="Participant task"
                      detail="Only these instructions, the question, and neutral option tokens are shown."
                    />
                    <Field label="Participant instructions">
                      <textarea
                        rows={2}
                        value={draft.instructions}
                        onChange={(e) => update("instructions", e.target.value)}
                      />
                    </Field>
                    <Field label="Question">
                      <textarea
                        rows={3}
                        value={draft.question}
                        onChange={(e) => update("question", e.target.value)}
                      />
                    </Field>
                    <div className="field-heading">
                      <span>Answer options</span>
                      <small>Fixed across both stages</small>
                    </div>
                    <div className="option-list">
                      {draft.options.map((o, i) => (
                        <div className="option-row" key={o.id}>
                          <span className="answer-token">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <input
                            aria-label={`Option ${String.fromCharCode(65 + i)}`}
                            value={o.text}
                            onChange={(e) =>
                              update(
                                "options",
                                draft.options.map((item, j) =>
                                  j === i
                                    ? { ...item, text: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <button
                            className="icon-button"
                            disabled={
                              draft.options.length <= 2 ||
                              o.id === draft.ground_truth ||
                              draft.peers.some((p) => p.choice_id === o.id)
                            }
                            title="Remove unused option"
                            aria-label={`Remove option ${String.fromCharCode(65 + i)}`}
                            onClick={() =>
                              update(
                                "options",
                                draft.options.filter((_, j) => j !== i),
                              )
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      disabled={draft.options.length >= 8}
                      onClick={() =>
                        update("options", [
                          ...draft.options,
                          {
                            id: `choice_${crypto.randomUUID().slice(0, 8)}`,
                            text: "",
                          },
                        ])
                      }
                    >
                      <Plus size={15} />
                      Add option
                    </button>
                    <div className="answer-key">
                      <LockKeyhole size={17} />
                      <Field
                        label="Answer key"
                        hint="Used by the deterministic scorer. Never sent to the participant."
                      >
                        <select
                          value={draft.ground_truth}
                          onChange={(e) =>
                            update("ground_truth", e.target.value)
                          }
                        >
                          {draft.options.map((o, i) => (
                            <option value={o.id} key={o.id}>
                              {String.fromCharCode(65 + i)} ·{" "}
                              {o.text || "Untitled option"}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </section>
                  <section className="card">
                    <CardTitle
                      number="03"
                      title="Scripted peer statements"
                      detail="Shown only before the second answer in the peer condition."
                    />
                    <div className="peer-list">
                      {draft.peers.map((p, i) => (
                        <div className="peer-editor" key={i}>
                          <div className="peer-editor-top">
                            <span className="peer-avatar">{i + 1}</span>
                            <input
                              aria-label={`Peer ${i + 1} name`}
                              value={p.speaker}
                              onChange={(e) =>
                                update(
                                  "peers",
                                  draft.peers.map((item, j) =>
                                    j === i
                                      ? { ...item, speaker: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <select
                              aria-label={`Peer ${i + 1} answer`}
                              value={p.choice_id}
                              onChange={(e) =>
                                update(
                                  "peers",
                                  draft.peers.map((item, j) =>
                                    j === i
                                      ? { ...item, choice_id: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {draft.options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {token(o.id)}
                                </option>
                              ))}
                            </select>
                            <button
                              className="icon-button"
                              aria-label={`Remove peer ${i + 1}`}
                              disabled={draft.peers.length < 2}
                              onClick={() =>
                                update(
                                  "peers",
                                  draft.peers.filter((_, j) => j !== i),
                                )
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <textarea
                            aria-label={`Peer ${i + 1} statement`}
                            rows={2}
                            value={p.statement}
                            onChange={(e) =>
                              update(
                                "peers",
                                draft.peers.map((item, j) =>
                                  j === i
                                    ? { ...item, statement: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      disabled={draft.peers.length >= 8}
                      onClick={() =>
                        update("peers", [
                          ...draft.peers,
                          {
                            speaker: `Participant ${draft.peers.length + 1}`,
                            choice_id: draft.options[1].id,
                            statement: "",
                          },
                        ])
                      }
                    >
                      <Plus size={15} />
                      Add scripted peer
                    </button>
                  </section>
                </div>
                <aside className="design-aside">
                  <div className="protocol-card">
                    <div className="protocol-kicker">
                      <Layers size={18} /> YOUR FIRST EXPERIMENT
                    </div>
                    <h2>
                      One question.
                      <br />
                      Two conditions.
                    </h2>
                    <p>
                      A controlled conformity rehearsal with separate, matched
                      sessions.
                    </p>
                    <div className="mini-flow">
                      <span>Independent answer</span>
                      <div className="flow-branches">
                        <span>Scripted peers</span>
                        <span>Ordinary re-ask</span>
                      </div>
                      <span>Second answer</span>
                    </div>
                    <div className="protocol-foot">
                      Every session starts with its own answer and private
                      history.
                    </div>
                  </div>
                  <div className="card checklist">
                    <h3>Built for inspection</h3>
                    <p>
                      <Check size={15} /> Neutral answer tokens
                    </p>
                    <p>
                      <Check size={15} /> Fixed option mapping
                    </p>
                    <p>
                      <Check size={15} /> Explicit missing outcomes
                    </p>
                    <p>
                      <Check size={15} /> Immutable run snapshots
                    </p>
                  </div>
                  <div className="margin-note">
                    <span>RESEARCH NOTE</span>
                    <p>
                      Withholding condition labels does not prove that a model
                      cannot recognize the procedure.
                    </p>
                  </div>
                </aside>
              </div>
              <div className="action-bar">
                <div>
                  <span className={`draft-dot ${dirty ? "" : "saved"}`} />
                  {dirty
                    ? "Unsaved changes"
                    : `Revision ${saved?.revision} saved`}
                  <small>
                    {saved
                      ? `Study ${saved.id.slice(-6)}`
                      : "A new study starts here"}
                  </small>
                </div>
                <button
                  className="secondary"
                  disabled={busy || !dirty}
                  onClick={() =>
                    action(async () => {
                      await saveDraft();
                    })
                  }
                >
                  <Save size={16} />
                  Save revision
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      if (dirty) await saveDraft();
                      setPage("preview");
                    })
                  }
                >
                  Save & preview
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}

          {page === "preview" && (
            <div className="stack">
              <div className="preview-toolbar">
                <div>
                  <Badge tone={dirty ? "amber" : "green"}>
                    {dirty
                      ? "Unsaved draft preview"
                      : `Revision ${saved?.revision}`}
                  </Badge>
                  <span>{draft.title}</span>
                </div>
                <Field label="Example initial answer">
                  <select
                    value={exampleToken}
                    onChange={(e) => setExampleToken(e.target.value)}
                  >
                    {draft.options.map((o, i) => (
                      <option key={o.id}>{String.fromCharCode(65 + i)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {view && (
                <>
                  <div className="preview-grid">
                    <section className="card participant-paper">
                      <div className="paper-top">
                        <span>01 / INDEPENDENT ANSWER</span>
                        <Badge>Same task in both conditions</Badge>
                      </div>
                      <p className="instruction">{draft.instructions}</p>
                      <h2>{draft.question}</h2>
                      <div className="preview-options">
                        {draft.options.map((o, i) => (
                          <div key={o.id}>
                            <span className="answer-token">
                              {String.fromCharCode(65 + i)}
                            </span>
                            {o.text}
                          </div>
                        ))}
                      </div>
                      <div className="paper-footer">
                        Structured answer:{" "}
                        <code>{JSON.stringify(view.example_answer)}</code>
                        <small>
                          Illustrative answer, not an executed response
                        </small>
                      </div>
                    </section>
                    <section className="card participant-paper">
                      <div className="paper-top">
                        <span>02 / SCHEDULED REVISION</span>
                      </div>
                      <div className="segmented">
                        <button
                          className={previewArm === "peer" ? "active" : ""}
                          onClick={() => setPreviewArm("peer")}
                        >
                          Peer exposure
                        </button>
                        <button
                          className={previewArm === "control" ? "active" : ""}
                          onClick={() => setPreviewArm("control")}
                        >
                          No-peer control
                        </button>
                      </div>
                      {previewArm === "peer" ? (
                        <div className="peer-preview">
                          {draft.peers.map((p, i) => (
                            <div key={i}>
                              <span className="peer-avatar">{i + 1}</span>
                              <div>
                                <strong>
                                  {p.speaker}
                                  <small>Selected {token(p.choice_id)}</small>
                                </strong>
                                <p>{p.statement}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="control-preview">
                          <Eye size={28} />
                          <h3>The same question, considered again.</h3>
                          <p>
                            This session receives no peer statements. Its own
                            initial exchange stays in its history.
                          </p>
                        </div>
                      )}
                      <p className="reask">
                        Consider the same question again. You may keep or change
                        your answer. Select one displayed token.
                      </p>
                    </section>
                  </div>
                  <section className="card">
                    <CardTitle
                      number="↳"
                      title="Inspect the constructed inputs"
                      detail={view.notice}
                    />
                    <details>
                      <summary>System instruction & response schema</summary>
                      <Json
                        value={{
                          system: view.system,
                          output_schema: view.schema,
                        }}
                      />
                    </details>
                    <details>
                      <summary>Initial prompt</summary>
                      <Json value={view.initial} />
                    </details>
                    <details>
                      <summary>
                        Revision prompt & illustrative history · {previewArm}
                      </summary>
                      <Json value={view.conditions[previewArm]} />
                    </details>
                  </section>
                </>
              )}
              <div className="action-bar">
                <div>
                  <Eye size={19} />
                  Participant material reviewed
                </div>
                <button
                  className="primary"
                  disabled={busy || !view}
                  onClick={() =>
                    action(async () => {
                      if (dirty) await saveDraft();
                      setPage("rehearsal");
                    })
                  }
                >
                  Configure rehearsal
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}

          {page === "rehearsal" && (
            <div className="stack">
              <section className="card run-config">
                <div className="config-heading">
                  <div>
                    <div className="eyebrow">NEXT REHEARSAL</div>
                    <h2>{draft.title}</h2>
                    <p>
                      {dirty
                        ? "Save the current draft before running."
                        : `Study revision ${saved?.revision} · ${draft.options.length} answer options · ${draft.peers.length} scripted peers`}
                    </p>
                  </div>
                  <Badge tone="green">
                    {settings.source === "fixture"
                      ? "Scripted procedure check"
                      : "Remote model output"}
                  </Badge>
                </div>
                <div className="settings-grid">
                  <Field label="Response source">
                    <select
                      value={settings.source}
                      disabled={active}
                      onChange={(e) =>
                        configure(
                          "source",
                          e.target.value as Settings["source"],
                        )
                      }
                    >
                      <option value="fixture">
                        Offline · scripted fixtures
                      </option>
                      <option
                        value="openai"
                        disabled={!health?.remote_available}
                      >
                        OpenAI · {health?.remote_model ?? "not configured"}
                      </option>
                    </select>
                  </Field>
                  <Field
                    label="Matched pairs"
                    hint={`${settings.pairs * 2} separate sessions · up to ${settings.pairs * 4} answers`}
                  >
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={settings.pairs}
                      disabled={active}
                      onChange={(e) =>
                        configure("pairs", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field
                    label="Allocation seed"
                    hint="Controls order, not model randomness"
                  >
                    <input
                      type="number"
                      min={0}
                      max={2147483647}
                      value={settings.seed}
                      disabled={active}
                      onChange={(e) =>
                        configure("seed", Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
                {settings.source === "fixture" && (
                  <Field
                    label="Fixture profile"
                    hint="Authored responses exercise the procedure. They do not solve the task or model people."
                  >
                    <select
                      value={settings.fixture}
                      disabled={active}
                      onChange={(e) =>
                        configure(
                          "fixture",
                          e.target.value as Settings["fixture"],
                        )
                      }
                    >
                      {Object.entries(fixtureLabels).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <details className="advanced">
                  <summary>
                    <Settings2 size={15} />
                    Attempt settings
                  </summary>
                  <div className="settings-grid">
                    <Field label="Timeout (seconds)">
                      <input
                        type="number"
                        min={0.05}
                        max={120}
                        step={0.05}
                        value={settings.timeout_seconds}
                        disabled={active}
                        onChange={(e) =>
                          configure("timeout_seconds", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field label="Transport retries">
                      <select
                        value={settings.transport_retries}
                        disabled={active}
                        onChange={(e) =>
                          configure("transport_retries", Number(e.target.value))
                        }
                      >
                        <option value={0}>None</option>
                        <option value={1}>One, recorded separately</option>
                      </select>
                    </Field>
                    <Field label="Maximum output tokens">
                      <input
                        type="number"
                        min={32}
                        max={2048}
                        value={settings.max_tokens}
                        disabled={active}
                        onChange={(e) =>
                          configure("max_tokens", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field
                      label="Temperature"
                      hint="Blank leaves the provider default."
                    >
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={settings.temperature ?? ""}
                        disabled={active}
                        onChange={(e) =>
                          configure(
                            "temperature",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <p className="subtle">
                    No format repair, persona regeneration, or hidden SDK
                    retries. A transport retry may duplicate a request already
                    received by a remote provider.
                  </p>
                </details>
                <div className="config-footer">
                  <span>
                    <LockKeyhole size={15} />
                    Protocol and settings freeze when the run starts.
                  </span>
                  <button
                    className="primary"
                    disabled={busy || active || dirty}
                    onClick={() =>
                      action(async () => {
                        if (!saved) return;
                        const launched = await api<{ id: string }>("/runs", {
                          study_id: saved.id,
                          revision: saved.revision,
                          settings,
                        });
                        setRun(await api<Run>(`/runs/${launched.id}`));
                        setSelectedAttempt(null);
                        setRuns(await api<RunSummary[]>("/runs"));
                      })
                    }
                  >
                    <FlaskConical size={17} />
                    {active
                      ? "Rehearsal running"
                      : settings.source === "fixture"
                        ? "Run rehearsal"
                        : "Run remote model"}
                  </button>
                </div>
                {dirty && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await saveDraft();
                      })
                    }
                  >
                    Save study to enable rehearsal
                    <ArrowRight size={15} />
                  </button>
                )}
              </section>
              {run ? (
                <>
                  <section className="run-header">
                    <div>
                      <div className="eyebrow">
                        {run.provenance.response_origin === "scripted_fixture"
                          ? "SCRIPTED FIXTURE RESULTS"
                          : "MODEL-GENERATED RESULTS"}
                      </div>
                      <h2>{run.protocol.title}</h2>
                      <p>
                        Revision {run.revision} · {formatDate(run.created_at)} ·{" "}
                        {run.settings.pairs} matched pairs · seed{" "}
                        {run.settings.seed}
                      </p>
                    </div>
                    <div className="run-actions">
                      <Status value={run.status} />
                      {active && (
                        <button
                          className="danger-button"
                          disabled={run.cancel_requested}
                          onClick={() =>
                            action(async () => {
                              await api(`/runs/${run.id}/cancel`, {});
                              setRun(await api<Run>(`/runs/${run.id}`));
                            })
                          }
                        >
                          <Square size={13} />
                          {run.cancel_requested ? "Cancelling…" : "Cancel run"}
                        </button>
                      )}
                    </div>
                  </section>
                  <div className="progress-wrap">
                    <progress
                      aria-label="Session progress"
                      max={run.sessions.length}
                      value={
                        run.sessions.filter(
                          (s) => !["pending", "running"].includes(s.status),
                        ).length
                      }
                    />
                    <span>
                      {
                        run.sessions.filter((s) => s.status === "completed")
                          .length
                      }{" "}
                      / {run.sessions.length} sessions complete ·{" "}
                      {run.attempts.length} attempts recorded
                    </span>
                  </div>
                  <div className="metric-grid">
                    {(["peer", "control"] as const).map((arm) => (
                      <section className="metric-card" key={arm}>
                        <div className="metric-title">
                          <span className={`arm-dot ${arm}`} />
                          {arm === "peer" ? "Peer exposure" : "No-peer control"}
                          <small>ANSWER CHANGES</small>
                        </div>
                        <div className="metric-value">
                          {run.metrics[arm].changed}
                          <span>/ {run.metrics[arm].complete}</span>
                        </div>
                        <p>sessions with both valid answers</p>
                        <div className="metric-detail">
                          <span>
                            {run.metrics[arm].missing} incomplete / missing
                          </span>
                          <span>
                            Revised accuracy{" "}
                            {run.metrics[arm].revised_accuracy.count}/
                            {run.metrics[arm].revised_accuracy.denominator}
                          </span>
                        </div>
                        <details>
                          <summary>Revision direction & denominators</summary>
                          <p>
                            Correct → incorrect:{" "}
                            {run.metrics[arm].correct_to_incorrect.count}/
                            {run.metrics[arm].correct_to_incorrect.denominator}{" "}
                            initially correct complete sessions
                          </p>
                          <p>
                            Incorrect → correct:{" "}
                            {run.metrics[arm].incorrect_to_correct.count}/
                            {run.metrics[arm].incorrect_to_correct.denominator}{" "}
                            initially incorrect complete sessions
                          </p>
                          <p>
                            Initial accuracy:{" "}
                            {run.metrics[arm].initial_accuracy.count}/
                            {run.metrics[arm].initial_accuracy.denominator}{" "}
                            valid initial answers
                          </p>
                        </details>
                      </section>
                    ))}
                  </div>
                  <section className="card comparison">
                    <div className="section-heading">
                      <div>
                        <h2>Follow the answer.</h2>
                        <p>
                          Each row is an independent session. Select a row to
                          inspect its attempts.
                        </p>
                      </div>
                      <Badge>Descriptive procedure results</Badge>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Pair / order</th>
                            <th>Condition</th>
                            <th>Initial answer</th>
                            <th>Revised answer</th>
                            <th>Change</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.sessions.map((s) => (
                            <tr key={s.id}>
                              <td>
                                <button
                                  className="row-button"
                                  onClick={() => {
                                    const a = run.attempts.find(
                                      (a) => a.session_id === s.id,
                                    );
                                    if (a) setSelectedAttempt(a.id);
                                    document
                                      .getElementById("attempt-inspector")
                                      ?.scrollIntoView({ behavior: "smooth" });
                                  }}
                                >
                                  Pair {String(s.pair_number).padStart(2, "0")}
                                  <small>
                                    Session {s.order} ·{" "}
                                    {s.fixture ?? run.provenance.model}
                                  </small>
                                </button>
                              </td>
                              <td>
                                <span className={`arm-dot ${s.arm}`} />
                                {s.arm === "peer" ? "Peer" : "Control"}
                              </td>
                              <td>
                                {s.initial ? (
                                  <span className="answer-cell">
                                    <b>{s.initial.token}</b>
                                    <small>
                                      {
                                        run.protocol.options.find(
                                          (o) => o.id === s.initial?.choice_id,
                                        )?.text
                                      }
                                    </small>
                                  </span>
                                ) : (
                                  <span className="missing">—</span>
                                )}
                              </td>
                              <td>
                                {s.revised ? (
                                  <span className="answer-cell">
                                    <b>{s.revised.token}</b>
                                    <small>
                                      {
                                        run.protocol.options.find(
                                          (o) => o.id === s.revised?.choice_id,
                                        )?.text
                                      }
                                    </small>
                                  </span>
                                ) : (
                                  <span className="missing">—</span>
                                )}
                              </td>
                              <td>
                                {s.changed === null ? (
                                  "—"
                                ) : s.changed ? (
                                  <Badge tone="amber">Changed</Badge>
                                ) : (
                                  <span className="subtle">Held</span>
                                )}
                              </td>
                              <td>
                                <Status value={s.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="table-note">
                      Missing outcomes remain missing. These counts do not
                      establish a human conformity effect.
                    </p>
                  </section>
                  <section className="card inspector" id="attempt-inspector">
                    <div className="section-heading">
                      <div>
                        <h2>Every input. Every attempt.</h2>
                        <p>
                          Captured at the participant model boundary, including
                          failed responses.
                        </p>
                      </div>
                      <Badge>{run.attempts.length} attempts</Badge>
                    </div>
                    {run.attempts.length ? (
                      <div className="inspector-grid">
                        <div className="attempt-list" aria-label="Attempts">
                          {run.attempts.map((a, i) => (
                            <button
                              key={a.id}
                              className={attempt?.id === a.id ? "active" : ""}
                              onClick={() => setSelectedAttempt(a.id)}
                            >
                              <span className="attempt-number">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span>
                                Session{" "}
                                {
                                  run.sessions.find(
                                    (s) => s.id === a.session_id,
                                  )?.order
                                }{" "}
                                · {a.stage}
                                <small>{a.purpose.replaceAll("_", " ")}</small>
                              </span>
                              <span className={`attempt-status ${a.status}`} />
                            </button>
                          ))}
                        </div>
                        {attempt && <AttemptInspector attempt={attempt} />}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <LoaderCircle className="spin" />
                        <p>Waiting for the first recorded attempt.</p>
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <h2>The frozen record</h2>
                    <p className="subtle">
                      This run always refers to its saved protocol, even when
                      the study is edited later.
                    </p>
                    <details>
                      <summary>Protocol, option mapping & run settings</summary>
                      <Json
                        value={{
                          revision: run.revision,
                          protocol_hash: run.protocol_hash,
                          protocol: run.protocol,
                          mapping: run.mapping,
                          settings: run.settings,
                        }}
                      />
                    </details>
                    <details>
                      <summary>
                        Planned schedule & realized execution order
                      </summary>
                      <Json
                        value={{
                          planned: run.planned_schedule,
                          realized: run.realized_schedule,
                        }}
                      />
                    </details>
                    <details>
                      <summary>Versions, provenance & lifecycle events</summary>
                      <Json
                        value={{
                          provenance: run.provenance,
                          events: run.events,
                        }}
                      />
                    </details>
                    <div className="exports">
                      <span>
                        <Download size={18} />
                        Export this record
                      </span>
                      <a
                        className="secondary"
                        href={`/api/runs/${run.id}/export/json`}
                        download
                      >
                        <FileJson size={16} />
                        Complete JSON
                      </a>
                      <a
                        className="secondary"
                        href={`/api/runs/${run.id}/export/sessions.csv`}
                        download
                      >
                        Sessions CSV
                      </a>
                      <a
                        className="secondary"
                        href={`/api/runs/${run.id}/export/attempts.csv`}
                        download
                      >
                        Attempts CSV
                      </a>
                    </div>
                  </section>
                </>
              ) : (
                <div className="empty-state run-empty">
                  <div className="empty-orbit">
                    <FlaskConical size={30} />
                  </div>
                  <h2>Your procedure, ready for a first pass.</h2>
                  <p>
                    Start a rehearsal to compare answers and inspect the
                    complete record.
                  </p>
                  <div className="empty-steps">
                    <span>Independent answer</span>
                    <ArrowRight size={15} />
                    <span>Peer / control</span>
                    <ArrowRight size={15} />
                    <span>Revised answer</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {page === "records" && (
            <div className="stack">
              <div className="library-toolbar">
                <input
                  aria-label="Search saved runs"
                  placeholder="Find a study or run…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Badge>{runs.length} saved runs</Badge>
              </div>
              {runs.length ? (
                <div className="run-library">
                  {runs
                    .filter((r) =>
                      `${r.title} ${r.id}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((r) => (
                      <button
                        className="run-card"
                        key={r.id}
                        onClick={() => openRun(r.id)}
                      >
                        <div className="run-card-icon">
                          <FlaskConical size={22} />
                        </div>
                        <div className="run-card-body">
                          <div>
                            <span className="eyebrow">
                              {r.provenance.response_origin ===
                              "scripted_fixture"
                                ? "SCRIPTED PROCEDURE CHECK"
                                : "MODEL OUTPUT"}
                            </span>
                            <Status value={r.status} />
                          </div>
                          <h2>{r.title}</h2>
                          <p>
                            Revision {r.revision} · {r.settings.pairs} pairs ·{" "}
                            {formatDate(r.created_at)}
                          </p>
                          <div className="run-card-footer">
                            <code>{r.id.slice(-12)}</code>
                            <span>
                              Open record
                              <ArrowRight size={16} />
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Database size={34} />
                  <h2>Your notebook starts with a rehearsal.</h2>
                  <p>
                    Completed, failed, and interrupted runs will stay
                    inspectable here.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setPage("rehearsal")}
                  >
                    Go to rehearsal
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
          <footer className="page-footer">
            <span>Made for careful questions.</span>
            <span>
              Local workspace <span>·</span> Synthetic participant rehearsal
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function AttemptInspector({ attempt }: { attempt: Attempt }) {
  const [tab, setTab] = useState<"request" | "response" | "wire" | "metadata">(
    "request",
  );
  return (
    <div className="attempt-detail">
      <div className="attempt-detail-heading">
        <div>
          <code>{attempt.id}</code>
          <p>
            {attempt.stage} · attempt {attempt.number} ·{" "}
            {formatDate(attempt.started_at)}
          </p>
        </div>
        <Status value={attempt.status} />
      </div>
      {attempt.error && <div className="attempt-error">{attempt.error}</div>}
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Attempt details"
      >
        {(["request", "response", "wire", "metadata"] as const).map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "request"
              ? "Actual request"
              : t === "response"
                ? "Raw response"
                : t === "wire"
                  ? "Provider wire"
                  : "Identifiers"}
          </button>
        ))}
      </div>
      {tab === "request" && (
        <Json
          value={
            attempt.request ?? {
              prompt: attempt.prompt,
              note: "Model boundary was not reached.",
            }
          }
        />
      )}
      {tab === "response" && (
        <Json
          value={
            attempt.response ?? {
              note: "No response received. This is a missing outcome.",
            }
          }
        />
      )}
      {tab === "wire" && (
        <Json
          value={
            attempt.wire_request
              ? {
                  request: attempt.wire_request,
                  response: attempt.wire_response,
                }
              : {
                  note: "Offline FunctionModel fixtures do not make HTTP requests.",
                }
          }
        />
      )}
      {tab === "metadata" && (
        <Json
          value={{
            run_id: attempt.run_id,
            pair_id: attempt.pair_id,
            session_id: attempt.session_id,
            stage_id: attempt.stage_id,
            attempt_id: attempt.id,
            purpose: attempt.purpose,
            retry_of: attempt.retry_of,
            started_at: attempt.started_at,
            ended_at: attempt.ended_at,
            parsed_choice: attempt.choice,
          }}
        />
      )}
    </div>
  );
}
