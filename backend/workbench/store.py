"""Transactional JSON records in SQLite. Frozen configuration and terminal runs are write protected."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .protocol import Study, digest, summarize

TERMINAL = {"completed", "completed_with_errors", "cancelled", "interrupted", "failed"}
FROZEN = (
    "id",
    "study_id",
    "revision",
    "protocol",
    "protocol_hash",
    "settings",
    "mapping",
    "planned_schedule",
    "provenance",
    "created_at",
)


def now():
    return datetime.now(timezone.utc).isoformat()


def uid(prefix):
    return f"{prefix}_{uuid4().hex[:16]}"


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError(f"Unsupported database version {version}; database was not modified.")
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS revisions (
                    study_id TEXT NOT NULL, revision INTEGER NOT NULL,
                    body TEXT NOT NULL, PRIMARY KEY(study_id, revision)
                );
                CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS simulations (id TEXT PRIMARY KEY, body TEXT NOT NULL);
                PRAGMA user_version=1;
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute("PRAGMA synchronous=FULL")
            with db:
                yield db
        finally:
            db.close()

    def save_study(self, study: Study, study_id: str | None = None):
        study_id = study_id or uid("study")
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            latest = db.execute(
                "SELECT MAX(revision) FROM revisions WHERE study_id=?", (study_id,)
            ).fetchone()[0]
            rev = (latest or 0) + 1
            record = {
                "id": study_id,
                "revision": rev,
                "created_at": now(),
                "hash": digest(study.model_dump()),
                "study": study.model_dump(),
            }
            db.execute(
                "INSERT INTO revisions VALUES (?, ?, ?)",
                (study_id, rev, json.dumps(record, ensure_ascii=False)),
            )
        return record

    def study(self, study_id: str, revision: int | None = None):
        with self.connection() as db:
            if revision is None:
                row = db.execute(
                    "SELECT body FROM revisions WHERE study_id=? ORDER BY revision DESC LIMIT 1", (study_id,)
                ).fetchone()
            else:
                row = db.execute(
                    "SELECT body FROM revisions WHERE study_id=? AND revision=?", (study_id, revision)
                ).fetchone()
        if not row:
            raise KeyError(study_id)
        return json.loads(row[0])

    def studies(self):
        with self.connection() as db:
            rows = db.execute(
                "SELECT body FROM revisions a WHERE revision=(SELECT MAX(revision) FROM revisions b WHERE a.study_id=b.study_id) ORDER BY rowid DESC"
            ).fetchall()
        return [json.loads(r[0]) for r in rows]

    def create_run(self, run):
        with self.connection() as db:
            db.execute("INSERT INTO runs VALUES (?, ?)", (run["id"], json.dumps(run, ensure_ascii=False)))

    def checkpoint(self, run):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM runs WHERE id=?", (run["id"],)).fetchone()
            if not row:
                raise KeyError(run["id"])
            previous = json.loads(row[0])
            if previous["status"] in TERMINAL:
                raise ValueError("A terminal run cannot be changed.")
            if any(previous[k] != run[k] for k in FROZEN):
                raise ValueError("A run's protocol and schedule are immutable.")
            old_events = previous["events"]
            if run["events"][: len(old_events)] != old_events:
                raise ValueError("Events are append only.")
            old_attempts = {a["id"]: a for a in previous["attempts"]}
            new_attempts = {a["id"]: a for a in run["attempts"]}
            for key, attempt in old_attempts.items():
                if key not in new_attempts or (
                    attempt["status"] != "running" and new_attempts[key] != attempt
                ):
                    raise ValueError("Completed attempts are immutable.")
            run["updated_at"] = now()
            run["metrics"] = summarize(run["sessions"])
            db.execute("UPDATE runs SET body=? WHERE id=?", (json.dumps(run, ensure_ascii=False), run["id"]))

    def run(self, run_id):
        with self.connection() as db:
            row = db.execute("SELECT body FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise KeyError(run_id)
        return json.loads(row[0])

    def runs(self):
        with self.connection() as db:
            rows = db.execute("SELECT body FROM runs ORDER BY rowid DESC").fetchall()
        return [json.loads(r[0]) for r in rows]

    def recover(self):
        for simulation in self.simulations():
            if simulation["status"] not in TERMINAL:
                simulation.update(status="interrupted", ended_at=now())
                simulation["events"].append({"at": now(), "kind": "recovered"})
                self.checkpoint_simulation(simulation)
        for run in self.runs():
            if run["status"] in TERMINAL:
                continue
            timestamp = now()
            for attempt in run["attempts"]:
                if attempt["status"] == "running":
                    attempt.update(
                        status="interrupted",
                        ended_at=timestamp,
                        error="Process stopped before this attempt completed; response, if received, is preserved.",
                    )
            for session in run["sessions"]:
                if session["status"] in ("pending", "running"):
                    session["status"] = "interrupted"
            run.update(status="interrupted", ended_at=timestamp)
            run["events"].append(
                {
                    "at": timestamp,
                    "kind": "recovered",
                    "detail": "Interrupted run retained. No calls repeated.",
                }
            )
            self.checkpoint(run)

    def create_simulation(self, run):
        with self.connection() as db:
            db.execute("INSERT INTO simulations VALUES (?, ?)", (run["id"], json.dumps(run)))

    def simulation(self, run_id):
        with self.connection() as db:
            row = db.execute("SELECT body FROM simulations WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise KeyError(run_id)
        return json.loads(row[0])

    def simulations(self):
        with self.connection() as db:
            rows = db.execute("SELECT body FROM simulations ORDER BY rowid DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def checkpoint_simulation(self, run):
        frozen = (
            "id",
            "study_id",
            "revision",
            "protocol",
            "protocol_hash",
            "mapping",
            "peer_choice_id",
            "config",
            "config_hash",
            "sample_sizes",
            "planned_repetitions",
            "created_at",
            "provenance",
        )
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM simulations WHERE id=?", (run["id"],)).fetchone()
            if not row:
                raise KeyError(run["id"])
            previous = json.loads(row[0])
            if previous["status"] in TERMINAL:
                raise ValueError("A terminal simulation cannot be changed.")
            if any(previous[key] != run[key] for key in frozen):
                raise ValueError("Simulation configuration is immutable.")
            for key in ("repetitions", "events"):
                if run[key][: len(previous[key])] != previous[key]:
                    raise ValueError("Simulation records are append only.")
            if run["completed_repetitions"] != len(run["repetitions"]):
                raise ValueError("Completed repetition count must match retained results.")
            run["updated_at"] = now()
            db.execute("UPDATE simulations SET body=? WHERE id=?", (json.dumps(run), run["id"]))
