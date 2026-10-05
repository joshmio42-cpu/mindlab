import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CornerDownRight,
  Download,
  FlaskConical,
  Leaf,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import Research from "./App";
import MeasurementLab from "./MeasurementLab";
import SourceRegistry from "./SourceRegistry";
import ConversationChecks from "./ConversationChecks";
import {
  ReferenceNotes,
  ReviewPanel,
  type ReferenceNote,
} from "./PracticeEvidence";
import { api, formatDate } from "./api";
import "./practice.css";

type Objective = { id: string; label: string };
type Scenario = {
  id: string;
  version: string;
  title: string;
  subtitle: string;
  duration: string;
  review_status: string;
  introduction: {
    name: string;
    age: number;
    description: string;
    setting: string;
    opening: string;
  };
  objectives: Objective[];
};
type Message = {
  id: string;
  role: "client" | "practitioner";
  text: string;
  at: string;
  origin: string;
};
type Note = {
  id: string;
  observed: string;
  interpretation: string;
  follow_up: string;
  message_id: string | null;
};
type Finding = {
  references?: ReferenceNote[];
  criterion: string;
  title: string;
  message_id: string;
  observation: string;
  interpretation: string;
  alternative: string;
  why: string;
};
type Feedback = {
  summary: string;
  findings: Finding[];
  rubric: {
    version: string;
    method: string;
    limits: string;
    criteria: { id: string; question: string }[];
  };
  missed_opportunities: {
    criterion: string;
    question: string;
    observation: string;
    interpretation: string;
  }[];
  reflection: string[];
  unexplored: { id: string; topic: string; fact: string }[];
  unexplored_label: string;
  notes_included: boolean;
  notes_comment: string;
  notes: Note[];
};
type Session = {
  id: string;
  scenario: Scenario;
  created_at: string;
  status: "active" | "completed";
  revision: number;
  pending: string | null;
  parent_session_id: string | null;
  branch_point: string | null;
  conversation_prefix: Message[];
  config: {
    source: "scripted" | "model";
    scenario_version: string;
    objectives: string[];
    client_version: string;
    mode?: string;
    role?: string;
    setting?: string;
    model_settings: { model: string | null };
    rubric: Feedback["rubric"];
  };
  messages: Message[];
  notes: Note[];
  errors: { message: string; attempt_id: string }[];
  reflection?: { text: string; status: string };
  feedback: Feedback | null;
};
type History = {
  scenario_title?: string;
  id: string;
  created_at: string;
  source: string;
  status: string;
  parent_session_id: string | null;
  message_count: number;
  scenario_version: string;
};
const sourceLabel = (source: string) =>
  source === "model"
    ? "Model-generated fiction"
    : "Offline scripted demonstration";

export default function Practice() {
  const [workspace, setWorkspace] = useState<
    "practice" | "research" | "measurement"
  >("practice");
  const [page, setPage] = useState<"library" | "session" | "history">(
    "library",
  );
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [caseLibrary, setCaseLibrary] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [parent, setParent] = useState<Session | null>(null);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [source, setSource] = useState("scripted");
  const [authorized, setAuthorized] = useState(false);
  const [replayAuthorized, setReplayAuthorized] = useState(false);
  const [health, setHealth] = useState<{
    remote_available: boolean;
    remote_model: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [observed, setObserved] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [reference, setReference] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [reflection, setReflection] = useState("");
  const [mode, setMode] = useState("guided");
  const [role, setRole] = useState("student");
  const [setting, setSetting] = useState("");
  const [tab, setTab] = useState<"conversation" | "debrief" | "compare">(
    "conversation",
  );
  const [notice, setNotice] = useState("");
  const dirtyNotes = Boolean(observed || interpretation || followUp);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.status === "active" && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
      if (session.messages.length > 1) {
        transcriptRef.current.lastElementChild?.scrollIntoView({
          block: "nearest",
        });
      }
    }
  }, [session?.messages.length, session?.status, tab]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Scenario[]>("/practice/scenarios"),
      api<History[]>("/practice/sessions"),
      api<{ remote_available: boolean; remote_model: string | null }>(
        "/health",
      ),
    ])
      .then(([scenarios, records, info]) => {
        if (active) {
          setCaseLibrary(scenarios);
          setScenario(scenarios[0]);
          setObjectives(scenarios[0].objectives.map((o) => o.id));
          setHistory(records);
          setHealth(info);
        }
      })
      .catch((e) => active && setError(String(e.message)));
    return () => {
      active = false;
    };
  }, []);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshHistory() {
    setHistory(await api<History[]>("/practice/sessions"));
  }
  async function open(record: Session) {
    setSession(record);
    setPage("session");
    setTab(record.feedback ? "debrief" : "conversation");
    setText("");
    setObserved("");
    setInterpretation("");
    setFollowUp("");
    setReference("");
    setIncludeNotes(false);
    setReflection("");
    setReplayAuthorized(false);
    setParent(
      record.parent_session_id
        ? await api<Session>(`/practice/sessions/${record.parent_session_id}`)
        : null,
    );
    await refreshHistory();
  }
  async function saveNotes(current: Session) {
    if (!dirtyNotes) return current;
    const saved = await api<Session>(`/practice/sessions/${current.id}/notes`, {
      observed,
      interpretation,
      follow_up: followUp,
      message_id: reference || null,
      revision: current.revision,
    });
    setSession(saved);
    setObserved("");
    setInterpretation("");
    setFollowUp("");
    setReference("");
    return saved;
  }
  async function navigate(destination: "library" | "history") {
    if (session?.status === "active") await saveNotes(session);
    await refreshHistory();
    setPage(destination);
  }
  async function branch(message: Message) {
    if (!session) return;
    const next = await api<Session>(
      `/practice/sessions/${session.id}/branches`,
      { message_id: message.id, authorize_model_calls: replayAuthorized },
    );
    await open(next);
    setText(message.text);
    setTab("compare");
    setNotice(
      "Replay created. Edit the earlier response below; the original is preserved.",
    );
  }
  const number = (id: string) =>
    (session?.messages.findIndex((m) => m.id === id) ?? -1) + 1;

  return (
    <>
      <div className="workspace-switch" aria-label="Workspace">
        <span className="workspace-wordmark">
          <Leaf size={18} /> MindLab
        </span>
        <button
          aria-pressed={workspace === "practice"}
          onClick={() => setWorkspace("practice")}
        >
          <MessageCircle size={15} /> Practitioner practice
        </button>
        <button
          aria-pressed={workspace === "research"}
          onClick={() =>
            void perform(async () => {
              if (session?.status === "active") await saveNotes(session);
              setWorkspace("research");
            })
          }
        >
          <FlaskConical size={15} /> Research & rehearsal
        </button>
        <button
          aria-pressed={workspace === "measurement"}
          onClick={() =>
            void perform(async () => {
              if (session?.status === "active") await saveNotes(session);
              setWorkspace("measurement");
            })
          }
        >
          <FlaskConical size={15} /> Measurement lab
        </button>
        <span className="workspace-local">Local learning workspace</span>
      </div>
      <aside className="use-notice" aria-label="Educational use warning">
        <strong>Educational prototype · Fictional scenarios only.</strong> Not
        for diagnosis, treatment, real-client assessment, or emergency support.
        Do not enter personal or client data.
      </aside>
      {workspace === "measurement" ? (
        <MeasurementLab
          onEncounter={() => {
            const selected = caseLibrary.find(
              (c) => c.id === "score-understanding",
            );
            if (selected) {
              setScenario(selected);
              setObjectives(selected.objectives.map((o) => o.id));
            }
            setPage("library");
            setWorkspace("practice");
          }}
        />
      ) : workspace === "research" ? (
        <>
          <div className="research-context">
            Research workspace · Probability-generated participants, scripted
            procedure fixtures and model outputs retain separate provenance.
            None represents a human population. Human research data is not
            supported.
          </div>
          <Research />
        </>
      ) : (
        <div className="practice-app">
          <aside className="practice-nav">
            <div className="practice-brand">
              <div className="practice-brand-mark">
                <Leaf size={27} />
              </div>
              <div>
                <strong>MindLab</strong>
                <span>A place to practice</span>
              </div>
            </div>
            <p className="practice-nav-caption">PRACTITIONER WORKSPACE</p>
            <nav aria-label="Practice navigation">
              <button
                className={page === "library" ? "selected" : ""}
                onClick={() => void perform(() => navigate("library"))}
              >
                <BookOpen size={19} /> Scenario library <span>01</span>
              </button>
              <button
                disabled={!session}
                className={page === "session" ? "selected" : ""}
                onClick={() => setPage("session")}
              >
                <MessageCircle size={19} />{" "}
                {session?.status === "completed"
                  ? "Session & reflection"
                  : "Practice session"}
              </button>
              <button
                className={page === "history" ? "selected" : ""}
                onClick={() => void perform(() => navigate("history"))}
              >
                <RotateCcw size={19} /> History & replays
              </button>
            </nav>
            <div className="practice-nav-note">
              <span className="small-kicker">SPACE FOR REFLECTION</span>
              <p>
                You can slow down.
                <br />
                You can try again.
                <br />
                There is more than one thoughtful response.
              </p>
              <div className="nav-line" />
              <small>
                Educational prototype
                <br />
                Requires review by qualified psychologists and psychometricians.
              </small>
            </div>
          </aside>
          <main className="practice-main" id="practice-main">
            <header className="practice-topline">
              <span>
                Practice /{" "}
                {page === "library"
                  ? "Scenario library"
                  : page === "history"
                    ? "History & replays"
                    : session?.feedback
                      ? "Reflection"
                      : "Conversation"}
              </span>
              <span className="prototype-pill">
                <span /> Educational prototype
              </span>
            </header>
            {error && (
              <div role="alert" className="practice-error">
                {error}{" "}
                {session && (
                  <button
                    onClick={() =>
                      void perform(async () => {
                        const fresh = await api<Session>(
                          `/practice/sessions/${session.id}`,
                        );
                        setSession(fresh);
                      })
                    }
                  >
                    Reload session
                  </button>
                )}
              </div>
            )}
            {notice && (
              <div role="status" className="practice-notice">
                {notice}
              </div>
            )}
            {!scenario ? (
              <p role="status">Loading your practice space…</p>
            ) : (
              <>
                {page === "library" && (
                  <>
                    <section className="practice-hero">
                      <span className="small-kicker">
                        THOUGHTFUL PRACTICE STARTS WITH A PERSON
                      </span>
                      <h1>
                        A little space to rehearse.
                        <br />
                        <em>A different perspective to hear.</em>
                      </h1>
                      <p>
                        Meet a fictional client. Practice a conversation, notice
                        your assumptions, and return with a different question.
                      </p>
                      <div className="practice-cycle">
                        <span>Meet</span>
                        <ArrowRight />
                        <span>Interact</span>
                        <ArrowRight />
                        <span>Observe</span>
                        <ArrowRight />
                        <span>Reflect & replay</span>
                      </div>
                    </section>
                    <div className="library-section-heading">
                      <h2>Your scenario library</h2>
                      <span>Three fictional adult encounters · English</span>
                    </div>
                    <label className="practice-field case-picker">
                      Choose an encounter
                      <select
                        value={scenario.id}
                        onChange={(e) => {
                          const selected = caseLibrary.find(
                            (c) => c.id === e.target.value,
                          )!;
                          setScenario(selected);
                          setObjectives(selected.objectives.map((o) => o.id));
                        }}
                      >
                        {caseLibrary.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} · {c.introduction.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <section className="scenario-feature">
                      <div className="scenario-story">
                        <span className="small-kicker">
                          FICTIONAL / UNREVIEWED
                        </span>
                        <div className="client-monogram" aria-hidden="true">
                          {scenario.introduction.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                          <span />
                        </div>
                        <div className="scenario-person">
                          <h2>
                            Meet {scenario.introduction.name.split(" ")[0]}.
                          </h2>
                          <span>
                            Fictional adult · {scenario.introduction.age} years
                            old
                          </span>
                        </div>
                        <blockquote>
                          “{scenario.introduction.opening}”
                        </blockquote>
                        <p>{scenario.subtitle}</p>
                        <div className="story-footer">
                          <span>
                            <MessageCircle size={15} /> Conversation practice
                          </span>
                          <span>{scenario.duration}</span>
                        </div>
                      </div>
                      <div className="scenario-plan">
                        <span className="small-kicker">{scenario.title}</span>
                        <h2>
                          Help make the unknown
                          <br />a little more understandable.
                        </h2>
                        <p>{scenario.introduction.description}</p>
                        <fieldset className="objective-list">
                          <legend>Choose your learning objectives</legend>
                          {scenario.objectives.map((o) => (
                            <label key={o.id}>
                              <input
                                type="checkbox"
                                checked={objectives.includes(o.id)}
                                onChange={(e) =>
                                  setObjectives(
                                    e.target.checked
                                      ? [...objectives, o.id]
                                      : objectives.filter((id) => id !== o.id),
                                  )
                                }
                              />
                              <span>{o.label}</span>
                            </label>
                          ))}
                        </fieldset>
                        <p className="practice-muted">
                          Adapt your focus to your role and local scope of
                          practice.
                        </p>
                        <label className="practice-field">
                          Practice mode
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                          >
                            <option value="guided">
                              Guided practice · prompts available
                            </option>
                            <option value="reflective">
                              Reflective practice · fewer prompts
                            </option>
                          </select>
                        </label>
                        <label className="practice-field">
                          Intended role
                          <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                          >
                            {[
                              "student",
                              "psychometrician",
                              "psychologist",
                              "professional",
                            ].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <label className="practice-field">
                          Setting and local scope
                          <input
                            maxLength={500}
                            value={setting}
                            onChange={(e) => setSetting(e.target.value)}
                            placeholder="Country, service, supervision and task limits"
                          />
                        </label>
                        <p className="practice-muted">
                          Role titles do not establish permitted activities.
                          These English adult cases have no
                          jurisdiction-specific or cultural review.{" "}
                          {scenario.review_status}
                        </p>
                        <label className="practice-field">
                          Conversation source
                          <select
                            value={source}
                            onChange={(e) => {
                              setSource(e.target.value);
                              setAuthorized(false);
                            }}
                          >
                            <option value="scripted">
                              Offline scripted demonstration
                            </option>
                            <option
                              value="model"
                              disabled={!health?.remote_available}
                            >
                              Model-generated fiction
                              {!health?.remote_available
                                ? " — not configured"
                                : ` — ${health.remote_model}`}
                            </option>
                          </select>
                        </label>
                        {source === "scripted" ? (
                          <p className="source-description">
                            An authored response tree, with limited language
                            coverage. No model calls or fees. Responses are
                            simulated possibilities.
                          </p>
                        ) : (
                          <label className="consent-check">
                            <input
                              type="checkbox"
                              checked={authorized}
                              onChange={(e) => setAuthorized(e.target.checked)}
                            />
                            <span>
                              I authorize paid model calls for this session.
                              Scenario and conversation text go to OpenAI;
                              private notes stay local.
                            </span>
                          </label>
                        )}
                        <button
                          className="practice-primary"
                          disabled={
                            busy ||
                            !objectives.length ||
                            (source === "model" && !authorized)
                          }
                          onClick={() =>
                            void perform(async () =>
                              open(
                                await api<Session>("/practice/sessions", {
                                  scenario_id: scenario.id,
                                  mode,
                                  role,
                                  setting:
                                    setting ||
                                    "Educational rehearsal; local scope not specified",
                                  source,
                                  objectives,
                                  authorize_model_calls: authorized,
                                }),
                              ),
                            )
                          }
                        >
                          Begin practice <ArrowRight size={18} />
                        </button>
                      </div>
                    </section>
                    <SourceRegistry />
                    <ConversationChecks />
                    <div className="library-principles">
                      <div>
                        <LockKeyhole size={20} />
                        <h3>Room for your own notes</h3>
                        <p>
                          Separate what you notice from what you think it might
                          mean.
                        </p>
                      </div>
                      <div>
                        <RotateCcw size={20} />
                        <h3>Return to a moment</h3>
                        <p>
                          Try another response while keeping the original
                          conversation.
                        </p>
                      </div>
                      <div>
                        <BookOpen size={20} />
                        <h3>A rehearsal, with limits</h3>
                        <p>
                          Fictional conversations support reflection. They do
                          not validate clinical skill.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                {page === "history" && (
                  <section className="history-section">
                    <span className="small-kicker">
                      A RECORD OF YOUR PRACTICE
                    </span>
                    <h1>
                      Each conversation leaves
                      <br />
                      <em>something to reflect on.</em>
                    </h1>
                    <p>
                      Reopen a session or explore a different continuation.
                      Originals remain preserved.
                    </p>
                    {!history.length ? (
                      <div className="practice-panel empty-practice">
                        <NotebookPen />
                        <h2>Your first conversation starts here.</h2>
                        <button
                          className="practice-primary"
                          onClick={() => setPage("library")}
                        >
                          Choose a scenario <ArrowRight size={17} />
                        </button>
                      </div>
                    ) : (
                      <div className="practice-history">
                        {history.map((h) => (
                          <button
                            key={h.id}
                            disabled={busy}
                            onClick={() =>
                              void perform(async () =>
                                open(
                                  await api<Session>(
                                    `/practice/sessions/${h.id}`,
                                  ),
                                ),
                              )
                            }
                          >
                            <div className="history-icon">
                              {h.parent_session_id ? (
                                <CornerDownRight />
                              ) : (
                                <MessageCircle />
                              )}
                            </div>
                            <div>
                              <span className="small-kicker">
                                {sourceLabel(h.source)}
                              </span>
                              <h2>
                                {h.parent_session_id
                                  ? `${h.scenario_title || "Encounter"} · Replay`
                                  : h.scenario_title ||
                                    "Alex · Before the assessment"}
                              </h2>
                              <p>
                                {formatDate(h.created_at)} · {h.message_count}{" "}
                                messages · v{h.scenario_version}
                              </p>
                              <small>
                                {h.parent_session_id
                                  ? `Branch of ${h.parent_session_id.slice(-8)}`
                                  : "Original session"}{" "}
                                · {h.id.slice(-8)}
                              </small>
                            </div>
                            <span className="history-status">
                              {h.status === "completed"
                                ? "View reflection"
                                : "Continue"}
                              <ArrowRight size={17} />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {page === "session" && session && (
                  <>
                    <div className="session-heading">
                      <div>
                        <span className="small-kicker">
                          {session.parent_session_id ? "REPLAY / " : ""}
                          {session.scenario.title}
                        </span>
                        <h1>
                          {session.feedback
                            ? "A moment to reflect."
                            : `A conversation with ${session.scenario.introduction.name.split(" ")[0]}.`}
                        </h1>
                      </div>
                      <span className={`source-pill ${session.config.source}`}>
                        {sourceLabel(session.config.source)}
                      </span>
                    </div>
                    <div className="session-context">
                      <span className="mini-monogram">
                        {session.scenario.introduction.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <div>
                        <strong>
                          {session.scenario.introduction.name}{" "}
                          <span>· Fictional client</span>
                        </strong>
                        <p>{session.scenario.introduction.setting}</p>
                        <p className="practice-muted">
                          {session.config.role} · {session.config.mode} practice
                          · {session.config.setting}
                        </p>
                      </div>
                    </div>
                    <details className="session-objectives">
                      <summary>
                        Your focus for this session ·{" "}
                        {session.config.objectives.length} objectives
                      </summary>
                      <ul>
                        {session.scenario.objectives
                          .filter((o) =>
                            session.config.objectives.includes(o.id),
                          )
                          .map((o) => (
                            <li key={o.id}>{o.label}</li>
                          ))}
                      </ul>
                      <p>
                        Stay within the fictional briefing. You may pause by
                        leaving the session and resume from history. Do not
                        enter real client information.
                      </p>
                    </details>
                    <div
                      className="practice-tabs"
                      role="tablist"
                      aria-label="Session views"
                      onKeyDown={(e) => {
                        if (
                          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            e.key,
                          )
                        )
                          return;
                        const tabs = Array.from(
                          e.currentTarget.querySelectorAll<HTMLButtonElement>(
                            "button:not(:disabled)",
                          ),
                        );
                        const index = tabs.indexOf(
                          document.activeElement as HTMLButtonElement,
                        );
                        const next =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? tabs.length - 1
                              : (index +
                                  (e.key === "ArrowRight" ? 1 : -1) +
                                  tabs.length) %
                                tabs.length;
                        e.preventDefault();
                        tabs[next]?.focus();
                        tabs[next]?.click();
                      }}
                    >
                      <button
                        role="tab"
                        id="tab-conversation"
                        aria-controls="view-conversation"
                        tabIndex={tab === "conversation" ? 0 : -1}
                        aria-selected={tab === "conversation"}
                        onClick={() => setTab("conversation")}
                      >
                        Conversation & notes
                      </button>
                      <button
                        role="tab"
                        id="tab-debrief"
                        aria-controls="view-debrief"
                        tabIndex={tab === "debrief" ? 0 : -1}
                        disabled={!session.feedback}
                        aria-selected={tab === "debrief"}
                        onClick={() => setTab("debrief")}
                      >
                        Reflective debrief
                      </button>
                      {parent && (
                        <button
                          role="tab"
                          id="tab-compare"
                          aria-controls="view-compare"
                          tabIndex={tab === "compare" ? 0 : -1}
                          aria-selected={tab === "compare"}
                          onClick={() => setTab("compare")}
                        >
                          Compare branches
                        </button>
                      )}
                    </div>
                    {session.errors.map((e) => (
                      <div
                        role="alert"
                        className="practice-error"
                        key={e.attempt_id}
                      >
                        {e.message}
                      </div>
                    ))}
                    {session.pending && (
                      <div role="status" className="practice-notice">
                        A client response is pending. Reload the session to
                        check its recorded outcome.
                      </div>
                    )}
                    {tab === "conversation" && (
                      <div
                        className="conversation-layout"
                        role="tabpanel"
                        id="view-conversation"
                        aria-labelledby="tab-conversation"
                      >
                        <section className="practice-panel conversation-panel">
                          <div className="panel-heading">
                            <MessageCircle size={18} />
                            <h2>
                              {session.feedback
                                ? "Saved transcript"
                                : "The conversation"}
                            </h2>
                            <span>{session.messages.length} messages</span>
                          </div>
                          <div
                            className="transcript"
                            ref={transcriptRef}
                            role="log"
                            aria-label="Conversation transcript"
                          >
                            {session.messages.map((m, i) => (
                              <article
                                className={`practice-message ${m.role}`}
                                id={`message-${m.id}`}
                                key={m.id}
                              >
                                <div className="practice-message-meta">
                                  <strong>
                                    {m.role === "client"
                                      ? session.scenario.introduction.name.split(
                                          " ",
                                        )[0]
                                      : "You"}
                                  </strong>
                                  <span>
                                    #{i + 1} ·{" "}
                                    {m.origin === "authored_opening"
                                      ? "Authored opening"
                                      : m.origin === "authored_scope_boundary"
                                        ? "Authored scope boundary"
                                        : m.role === "client"
                                          ? sourceLabel(m.origin)
                                          : "Practitioner"}
                                  </span>
                                </div>
                                <p>{m.text}</p>
                                {session.feedback &&
                                  m.role === "practitioner" && (
                                    <button
                                      className="replay-link"
                                      disabled={
                                        busy ||
                                        (session.config.source === "model" &&
                                          !replayAuthorized)
                                      }
                                      onClick={() =>
                                        void perform(() => branch(m))
                                      }
                                    >
                                      <RotateCcw size={13} /> Replay from here
                                    </button>
                                  )}
                              </article>
                            ))}
                          </div>
                          {session.status === "active" && (
                            <form
                              className="conversation-composer"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void perform(async () => {
                                  const current = await saveNotes(session);
                                  const next = await api<Session>(
                                    `/practice/sessions/${current.id}/messages`,
                                    { text, revision: current.revision },
                                  );
                                  setSession(next);
                                  setText("");
                                });
                              }}
                            >
                              <label htmlFor="practitioner-response">
                                Your response to{" "}
                                {
                                  session.scenario.introduction.name.split(
                                    " ",
                                  )[0]
                                }
                              </label>
                              <textarea
                                id="practitioner-response"
                                placeholder="Take your time. What would you say?"
                                rows={3}
                                maxLength={3000}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                required
                              />
                              <div>
                                <small>
                                  {session.config.source === "scripted"
                                    ? "Scripted demo · Limited response tree"
                                    : "Model session · One paid call per response"}
                                </small>
                                <button
                                  className="practice-primary"
                                  disabled={
                                    busy ||
                                    Boolean(session.pending) ||
                                    !text.trim()
                                  }
                                  type="submit"
                                >
                                  {busy ? "Saving…" : "Send response"}
                                  <Send size={16} />
                                </button>
                              </div>
                            </form>
                          )}
                          {session.feedback &&
                            session.config.source === "model" && (
                              <label className="consent-check replay-consent">
                                <input
                                  type="checkbox"
                                  checked={replayAuthorized}
                                  onChange={(e) =>
                                    setReplayAuthorized(e.target.checked)
                                  }
                                />
                                <span>
                                  I authorize paid model calls in a new replay.
                                  Each replay preserves the original model
                                  settings.
                                </span>
                              </label>
                            )}
                        </section>
                        <aside className="notebook practice-panel">
                          <div className="panel-heading">
                            <NotebookPen size={19} />
                            <h2>Private notebook</h2>
                            <LockKeyhole size={14} />
                          </div>
                          <p>
                            For your eyes. Notes never enter the client's
                            context. Written dialogue is not evidence of
                            unobserved body language.
                          </p>
                          {session.status === "active" && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void perform(async () => {
                                  await saveNotes(session);
                                  setNotice("Note saved privately.");
                                });
                              }}
                            >
                              <label className="practice-field">
                                Observed behavior or exact quotation
                                <textarea
                                  rows={3}
                                  placeholder="Record the client’s exact words or observable text"
                                  value={observed}
                                  maxLength={3000}
                                  onChange={(e) => setObserved(e.target.value)}
                                />
                              </label>
                              <label className="practice-field">
                                Interpretation or hypothesis
                                <textarea
                                  rows={3}
                                  placeholder="What might this mean? What else could explain it?"
                                  value={interpretation}
                                  maxLength={3000}
                                  onChange={(e) =>
                                    setInterpretation(e.target.value)
                                  }
                                />
                              </label>
                              <label className="practice-field">
                                Follow-up or information still needed
                                <textarea
                                  rows={2}
                                  placeholder="What would you ask or check?"
                                  value={followUp}
                                  maxLength={3000}
                                  onChange={(e) => setFollowUp(e.target.value)}
                                />
                              </label>
                              <label className="practice-field">
                                Link to transcript
                                <select
                                  value={reference}
                                  onChange={(e) => setReference(e.target.value)}
                                >
                                  <option value="">General session note</option>
                                  {session.messages.map((m, i) => (
                                    <option key={m.id} value={m.id}>
                                      #{i + 1} ·{" "}
                                      {m.role === "client"
                                        ? session.scenario.introduction.name.split(
                                            " ",
                                          )[0]
                                        : "You"}
                                      : {m.text.slice(0, 65)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="practice-secondary"
                                type="submit"
                                disabled={
                                  busy ||
                                  Boolean(session.pending) ||
                                  !dirtyNotes
                                }
                              >
                                <Check size={16} /> Save private note
                              </button>
                              <small className="note-save-state">
                                {dirtyNotes
                                  ? "Unsaved draft · also saved when sending or ending"
                                  : "All notebook entries saved"}
                              </small>
                            </form>
                          )}
                          {session.notes.map((n) => (
                            <div className="saved-note" key={n.id}>
                              <small>
                                {n.message_id
                                  ? `Transcript #${number(n.message_id)}`
                                  : "Session note"}
                              </small>
                              {n.observed && (
                                <p>
                                  <b>Observed</b>
                                  {n.observed}
                                </p>
                              )}
                              {n.interpretation && (
                                <p>
                                  <b>Interpretation</b>
                                  {n.interpretation}
                                </p>
                              )}
                              {n.follow_up && (
                                <p>
                                  <b>Follow-up</b>
                                  {n.follow_up}
                                </p>
                              )}
                            </div>
                          ))}
                        </aside>
                      </div>
                    )}
                    {tab === "compare" && parent && (
                      <section
                        role="tabpanel"
                        id="view-compare"
                        aria-labelledby="tab-compare"
                      >
                        <div className="comparison-explainer">
                          <RotateCcw size={22} />
                          <div>
                            <h2>Same moment. Another possible conversation.</h2>
                            <p>
                              Different continuations are simulated
                              possibilities, not proof that a response would
                              cause a particular outcome in a real person.
                            </p>
                            <small>
                              Parent {parent.id.slice(-8)} · branch point #
                              {parent.messages.findIndex(
                                (m) => m.id === session.branch_point,
                              ) + 1}{" "}
                              · scenario v{session.config.scenario_version} ·{" "}
                              {session.conversation_prefix.length} shared
                              messages ·{" "}
                              {session.config.model_settings.model ||
                                session.config.client_version}
                            </small>
                          </div>
                        </div>
                        <div className="branch-columns">
                          {[
                            { title: "Original · preserved", value: parent },
                            {
                              title: "Replay · your new direction",
                              value: session,
                            },
                          ].map(({ title, value }) => (
                            <div
                              className="practice-panel branch-column"
                              key={value.id}
                            >
                              <h3>{title}</h3>
                              {value.messages.map((m, i) => (
                                <article
                                  className={`practice-message ${m.role} ${i < session.conversation_prefix.length ? "prefix-message" : ""}`}
                                  key={m.id}
                                >
                                  <div className="practice-message-meta">
                                    <strong>
                                      {m.role === "client"
                                        ? session.scenario.introduction.name.split(
                                            " ",
                                          )[0]
                                        : "You"}
                                    </strong>
                                    <span>
                                      #{i + 1}
                                      {i < session.conversation_prefix.length
                                        ? " · Shared prefix"
                                        : " · Continuation"}
                                    </span>
                                  </div>
                                  <p>{m.text}</p>
                                </article>
                              ))}
                              {value.id === session.id &&
                                session.status === "active" && (
                                  <button
                                    className="practice-primary"
                                    onClick={() => setTab("conversation")}
                                  >
                                    Try your response <ArrowRight size={16} />
                                  </button>
                                )}
                            </div>
                          ))}
                        </div>
                        <button
                          className="practice-secondary"
                          onClick={() => void perform(async () => open(parent))}
                        >
                          <ArrowLeft size={15} /> Open original record
                        </button>
                      </section>
                    )}
                    {tab === "debrief" && session.feedback && (
                      <div
                        className="debrief-layout"
                        role="tabpanel"
                        id="view-debrief"
                        aria-labelledby="tab-debrief"
                      >
                        <section className="debrief-main">
                          <div className="practice-panel reflection-summary">
                            <span className="small-kicker">
                              REFLECTION, NOT A VERDICT
                            </span>
                            <h2>What happened in this conversation</h2>
                            <p>{session.feedback.summary}</p>
                            <h3>Your reflection before feedback</h3>
                            <p>
                              {session.reflection?.text ||
                                "Reflection was skipped."}
                            </p>
                            <button
                              className="practice-text-button"
                              onClick={() => setTab("conversation")}
                            >
                              Inspect the transcript <ArrowRight size={15} />
                            </button>
                            <div className="feedback-limit">
                              <Sparkles size={17} />
                              <p>
                                {session.feedback.rubric.method}{" "}
                                {session.feedback.rubric.limits}
                              </p>
                            </div>
                          </div>
                          <h2 className="debrief-subtitle">
                            Moments worth returning to
                          </h2>
                          {!session.feedback.findings.length && (
                            <p className="practice-panel">
                              No wording cues matched. Read the transcript
                              alongside the rubric; a rule-based review cannot
                              judge the whole conversation.
                            </p>
                          )}
                          {session.feedback.findings.map((f, i) => (
                            <article
                              className="practice-panel feedback-card"
                              key={`${f.message_id}-${i}`}
                            >
                              <div>
                                <span className="small-kicker">
                                  {f.criterion}
                                </span>
                                <button
                                  onClick={() => {
                                    setTab("conversation");
                                    setTimeout(
                                      () =>
                                        document
                                          .getElementById(
                                            `message-${f.message_id}`,
                                          )
                                          ?.scrollIntoView({
                                            behavior: "smooth",
                                            block: "center",
                                          }),
                                      50,
                                    );
                                  }}
                                >
                                  Transcript #{number(f.message_id)}{" "}
                                  <ArrowRight size={14} />
                                </button>
                              </div>
                              <h3>{f.title}</h3>
                              <blockquote>“{f.observation}”</blockquote>
                              <span className="feedback-label">
                                REVIEWER INTERPRETATION
                              </span>
                              <p>{f.interpretation}</p>
                              <ReferenceNotes notes={f.references} />
                              <div className="alternative">
                                <span className="feedback-label">
                                  ONE POSSIBLE ALTERNATIVE
                                </span>
                                <p>“{f.alternative}”</p>
                                <small>{f.why}</small>
                              </div>
                            </article>
                          ))}
                          {session.feedback.missed_opportunities.length > 0 && (
                            <div className="practice-panel">
                              <h2>Questions the rules leave open</h2>
                              {session.feedback.missed_opportunities.map(
                                (m) => (
                                  <div
                                    className="missed-opportunity"
                                    key={m.criterion}
                                  >
                                    <h3>{m.question}</h3>
                                    <p>
                                      {m.observation} {m.interpretation}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                          <div className="practice-panel">
                            <h2>Your notebook in this debrief</h2>
                            <p>{session.feedback.notes_comment}</p>
                            {session.feedback.notes.map((n) => (
                              <div className="saved-note" key={n.id}>
                                <p>
                                  <b>Observed</b>
                                  {n.observed || "—"}
                                </p>
                                <p>
                                  <b>Interpretation</b>
                                  {n.interpretation || "—"}
                                </p>
                                <p>
                                  <b>Follow-up</b>
                                  {n.follow_up || "—"}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>
                        <aside className="reflection-aside">
                          <ReviewPanel
                            key={session.id}
                            sessionId={session.id}
                            messages={session.messages}
                          />
                          <div className="reflection-prompts">
                            <span className="small-kicker">TAKE A MOMENT</span>
                            <h2>What do you notice now?</h2>
                            {session.config.mode !== "reflective" &&
                              session.feedback.reflection.map((q, i) => (
                                <p key={q}>
                                  <span>0{i + 1}</span>
                                  {q}
                                </p>
                              ))}
                          </div>
                          <div className="practice-panel">
                            <h2>Beyond this exchange</h2>
                            <p>{session.feedback.unexplored_label}</p>
                            {session.feedback.unexplored.map((d) => (
                              <div className="unexplored" key={d.id}>
                                <h3>{d.topic}</h3>
                                <p>{d.fact}</p>
                              </div>
                            ))}
                            {!session.feedback.unexplored.length && (
                              <p>
                                No additional authored disclosures were flagged.
                              </p>
                            )}
                          </div>
                          <div className="practice-panel">
                            <RotateCcw />
                            <h2>Try another response</h2>
                            <p>
                              Return to any practitioner message in the
                              transcript and branch from just before it.
                            </p>
                            <button
                              className="practice-secondary"
                              onClick={() => setTab("conversation")}
                            >
                              Choose an exchange <ArrowRight size={15} />
                            </button>
                          </div>
                          <details className="practice-panel rubric-details">
                            <summary>
                              Educational rubric ·{" "}
                              {session.feedback.rubric.version}
                            </summary>
                            {session.feedback.rubric.criteria.map((c) => (
                              <p key={c.id}>{c.question}</p>
                            ))}
                          </details>
                        </aside>
                      </div>
                    )}
                    {session.status === "active" ? (
                      <div className="end-session">
                        <div>
                          <h2>Ready to step back?</h2>
                          <label className="practice-field">
                            Reflection before feedback
                            <textarea
                              maxLength={6000}
                              value={reflection}
                              onChange={(e) => setReflection(e.target.value)}
                              placeholder={
                                session.config.mode === "reflective"
                                  ? "Your reflection (optional)"
                                  : "Which exact words shaped your interpretation? What is still unknown? What would you try differently?"
                              }
                            />
                          </label>
                          <small>
                            Saved locally, never sent to the client. Leave blank
                            to record that reflection was skipped.
                          </small>
                          <p>
                            End the session to preserve this conversation and
                            open your debrief.
                          </p>
                          <label className="consent-check">
                            <input
                              type="checkbox"
                              checked={includeNotes}
                              onChange={(e) =>
                                setIncludeNotes(e.target.checked)
                              }
                            />
                            <span>
                              Include my private notes in the debrief for
                              reflection.
                            </span>
                          </label>
                        </div>
                        <button
                          className="practice-primary"
                          disabled={busy || Boolean(session.pending)}
                          onClick={() =>
                            void perform(async () => {
                              const current = await saveNotes(session);
                              setSession(
                                await api<Session>(
                                  `/practice/sessions/${session.id}/end`,
                                  {
                                    include_notes: includeNotes,
                                    reflection,
                                    revision: current.revision,
                                  },
                                ),
                              );
                              setTab("debrief");
                              await refreshHistory();
                            })
                          }
                        >
                          End session & reflect <ArrowRight size={17} />
                        </button>
                      </div>
                    ) : (
                      <div className="record-footer">
                        <span>
                          <LockKeyhole size={15} /> Completed record · original
                          preserved
                        </span>
                        <a
                          className="practice-secondary"
                          href={`/api/practice/sessions/${session.id}/export`}
                          download
                        >
                          <Download size={16} /> Export fictional record
                          (includes private notes)
                        </a>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <footer className="practice-footer">
              <span>Made for careful conversations.</span>
              <span>Fictional simulation · No professional review claimed</span>
            </footer>
          </main>
        </div>
      )}
    </>
  );
}
