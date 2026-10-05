import { useEffect, useState } from "react";
import { api } from "./api";

export type ReferenceNote = {
  objective: string;
  status: string;
  text: string;
  citations: { id: string; title: string; url: string }[];
};
export function ReferenceNotes({ notes }: { notes?: ReferenceNote[] }) {
  return (
    <div className="reference-notes">
      {notes?.map((n) => (
        <details key={n.objective}>
          <summary>Learning reference · {n.objective}</summary>
          <p>{n.text}</p>
          <small>
            {n.status}. Original MindLab interpretation, not a source-authored
            rating.
          </small>
          {n.citations.map((c) => (
            <p key={c.id}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.title}
              </a>
            </p>
          ))}
        </details>
      ))}
    </div>
  );
}

type Review = {
  id: string;
  kind: string;
  reviewer: string;
  message_id: string;
  text: string;
  unsupported_feedback: string;
  missed_problem: string;
  cultural_language_review: string;
};
type ReviewState = {
  records: Review[];
  independent_ratings: number;
  adjudication_ready: boolean;
  ready_targets: string[];
  identity_limit: string;
};
export function ReviewPanel({
  sessionId,
  messages,
}: {
  sessionId: string;
  messages: { id: string; text: string }[];
}) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [kind, setKind] = useState("learner disagreement");
  const [reviewer, setReviewer] = useState("");
  const [target, setTarget] = useState("transcript");
  const [qualifications, setQualifications] = useState("");
  const [message, setMessage] = useState(messages[0]?.id || "");
  const [text, setText] = useState("");
  const [unsupported, setUnsupported] = useState("not assessable");
  const [missed, setMissed] = useState("not assessable");
  const [culture, setCulture] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<ReviewState>(`/practice/sessions/${sessionId}/reviews`)
      .then((s) => {
        if (active) setState(s);
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);
  return (
    <details className="practice-panel">
      <summary>Disagree, correct, or submit a professional review</summary>
      <p>
        Corrections remain alongside the original feedback. Professional review
        requires suitable qualifications; entering a name does not verify them.
      </p>
      <p>
        {state?.independent_ratings ?? 0} independent ratings submitted. Ratings
        are concealed here until two different reviewers submit. A coordinator
        must ensure independent work.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(`/practice/sessions/${sessionId}/reviews`, {
              kind,
              reviewer,
              review_target: target,
              qualifications_and_scope:
                qualifications || "Not supplied; credentials unverified",
              message_id: message,
              text,
              unsupported_feedback: unsupported,
              missed_problem: missed,
              cultural_language_review: culture || "Not reviewed",
            });
            setState(
              await api<ReviewState>(`/practice/sessions/${sessionId}/reviews`),
            );
            setText("");
            setNotice("Review saved. Original feedback preserved.");
          } catch (e) {
            setNotice(e instanceof Error ? e.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="practice-field">
          Review type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              "learner disagreement",
              "professional correction",
              "independent rating",
              "adjudication",
            ].map((k) => (
              <option
                key={k}
                disabled={
                  k === "adjudication" && !state?.ready_targets.includes(target)
                }
              >
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="practice-field">
          Review target
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {["transcript", "case", "rubric", "cultural/language"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="practice-field">
          Qualifications, jurisdiction and scope
          <textarea
            maxLength={1500}
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            placeholder="Self-declared; coordinator must verify relevant expertise and independence"
          />
        </label>
        <label className="practice-field">
          Reviewer name or local identifier
          <input
            required
            maxLength={100}
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          />
        </label>
        <label className="practice-field">
          Evidence turn
          <select value={message} onChange={(e) => setMessage(e.target.value)}>
            {messages.map((m, i) => (
              <option key={m.id} value={m.id}>
                #{i + 1} {m.text.slice(0, 70)}
              </option>
            ))}
          </select>
        </label>
        <label className="practice-field">
          Correction and reasoning
          <textarea
            required
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {[
          ["Unsupported feedback", unsupported, setUnsupported],
          ["Missed problem", missed, setMissed],
        ].map(([label, value, setter]) => (
          <label className="practice-field" key={String(label)}>
            {String(label)}
            <select
              value={String(value)}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
            >
              {["not assessable", "not observed", "present"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="practice-field">
          Cultural and language review
          <textarea
            maxLength={1000}
            value={culture}
            onChange={(e) => setCulture(e.target.value)}
            placeholder="Supported context, reviewer expertise, concerns and missing evidence"
          />
        </label>
        <button className="practice-secondary" disabled={busy}>
          Save review
        </button>
      </form>
      <p role="status">{notice}</p>
      {state?.records.map((r) => (
        <article className="saved-note" key={r.id}>
          <b>
            {r.kind} · {r.reviewer}
          </b>
          <p>{r.text}</p>
          <small>
            Unsupported feedback: {r.unsupported_feedback}; missed problem:{" "}
            {r.missed_problem}. {r.cultural_language_review}
          </small>
        </article>
      ))}
    </details>
  );
}
