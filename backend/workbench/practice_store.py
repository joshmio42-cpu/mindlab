"""Practice recorder using the existing SQLite connection and durability conventions."""

import json

from .store import now


class PracticeRecorder:
    def __init__(self, store):
        self.store = store
        with store.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS practice_sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL)"
            )

    def get(self, session_id):
        with self.store.connection() as db:
            row = db.execute("SELECT body FROM practice_sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise KeyError(session_id)
        return json.loads(row[0])

    def list(self):
        with self.store.connection() as db:
            rows = db.execute("SELECT body FROM practice_sessions ORDER BY rowid DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def create(self, session):
        with self.store.connection() as db:
            db.execute("INSERT INTO practice_sessions VALUES (?, ?)", (session["id"], json.dumps(session)))

    def save(self, session):
        with self.store.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM practice_sessions WHERE id=?", (session["id"],)).fetchone()
            if not row:
                raise KeyError(session["id"])
            previous = json.loads(row[0])
            if previous["status"] == "completed":
                raise ValueError("Completed practice records are immutable. Create a replay instead.")
            if previous["revision"] != session["revision"]:
                raise ValueError("This record changed. Reload it before continuing.")
            for key in (
                "id",
                "created_at",
                "config",
                "parent_session_id",
                "branch_point",
                "conversation_prefix",
            ):
                if previous[key] != session[key]:
                    raise ValueError("Session configuration and replay ancestry are immutable.")
            for key in ("messages", "notes", "events", "attempts", "errors"):
                if session[key][: len(previous[key])] != previous[key]:
                    raise ValueError("Practice records are append only.")
            ids = {m["id"] for m in session["messages"]}
            if session["feedback"]:
                refs = [f["message_id"] for f in session["feedback"]["findings"]]
                refs += session["feedback"]["summary_evidence"]
                if any(ref not in ids for ref in refs):
                    raise ValueError("Feedback must reference actual transcript messages.")
            session["revision"] += 1
            session["updated_at"] = now()
            db.execute("UPDATE practice_sessions SET body=? WHERE id=?", (json.dumps(session), session["id"]))

    def recover(self):
        for session in self.list():
            if session["pending"]:
                session["errors"].append(
                    {
                        "at": now(),
                        "attempt_id": session["pending"],
                        "message": "Interrupted request. No call was repeated. Start a replay or continue with a new message.",
                    }
                )
                session["pending"] = None
                session["events"].append({"at": now(), "kind": "interrupted"})
                self.save(session)
