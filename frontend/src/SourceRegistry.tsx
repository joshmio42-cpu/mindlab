import { useEffect, useState } from "react";
import { api } from "./api";
type Source = {
  id: string;
  title: string;
  url: string;
  author_or_organization: string;
  publication_date: string | null;
  version: string;
  source_type: string;
  skills: string[];
  populations: string[];
  languages: string[];
  settings: string[];
  limitations: string;
  review_status: string;
  imported_material: string;
  used_by: string[];
  availability: { checked_on: string; method: string };
  permissions: Record<string, { status: string; evidence: string }>;
};
export default function SourceRegistry() {
  const [sources, setSources] = useState<Source[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ sources: Source[] }>("/practice/sources")
      .then((r) => {
        if (active) setSources(r.sources);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <details className="practice-panel source-registry">
      <summary>Source registry & permissions ({sources.length})</summary>
      <p>
        Bibliographic references and original learning notes are separate from
        imported materials. No external cases, datasets, test items, or training
        tools have been imported. No professional review is claimed.
      </p>
      <label className="practice-field">
        Find a source
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, skill, feature, permission"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {sources
        .filter((s) =>
          JSON.stringify(s).toLowerCase().includes(query.toLowerCase()),
        )
        .map((s) => (
          <article key={s.id}>
            <h3>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            </h3>
            <p>
              {s.author_or_organization} ·{" "}
              {s.publication_date || "Date not established"} · {s.source_type}
            </p>
            <dl>
              <dt>Version</dt>
              <dd>{s.version}</dd>
              <dt>Skills</dt>
              <dd>{s.skills.join(", ")}</dd>
              <dt>Context</dt>
              <dd>
                {[...s.populations, ...s.languages, ...s.settings].join(" · ")}
              </dd>
              <dt>Used by</dt>
              <dd>{s.used_by.join(", ")}</dd>
              <dt>Limitations</dt>
              <dd>{s.limitations}</dd>
              <dt>Review</dt>
              <dd>{s.review_status}</dd>
              <dt>Availability</dt>
              <dd>
                {s.availability.checked_on} · {s.availability.method}
              </dd>
              <dt>Material</dt>
              <dd>{s.imported_material}</dd>
              {Object.entries(s.permissions).map(([kind, p]) => (
                <div key={kind} style={{ display: "contents" }}>
                  <dt>{kind.replace("_", " ")}</dt>
                  <dd>
                    {p.status}
                    <br />
                    <small>{p.evidence}</small>
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
    </details>
  );
}
