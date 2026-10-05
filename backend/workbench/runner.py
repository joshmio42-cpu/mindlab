"""Ordinary software allocates, dispatches, scores and records separate paired sessions."""

import asyncio
import json
from importlib.metadata import version

from openai import APIConnectionError, APITimeoutError
from pydantic_ai.exceptions import ModelHTTPError, UnexpectedModelBehavior

from .participant import FixtureConnectionError, respond
from .protocol import (
    FIXTURE_VERSION,
    PROTOCOL_VERSION,
    RENDER_VERSION,
    SCHEDULE_VERSION,
    Settings,
    Study,
    allocate,
    digest,
    initial,
    mapping,
    response_type,
    revision,
    summarize,
)
from .store import TERMINAL, Store, now, uid


class Runner:
    def __init__(self, store: Store, model_name=None, api_key=None):
        self.store = store
        self.model_name = model_name
        self.api_key = api_key
        self.task = None
        self.pending = None
        self.current = None

    @property
    def busy(self):
        return self.task is not None and not self.task.done()

    def launch(self, saved, settings: Settings):
        if self.busy:
            raise RuntimeError("A rehearsal is already running. Wait for it or cancel it first.")
        if settings.source == "openai" and not (self.model_name and self.api_key):
            raise ValueError("Enable the remote adapter and configure a model and key on the server first.")
        run_id = uid("run")
        study = Study.model_validate(saved["study"])
        sessions = allocate(run_id, settings)
        timestamp = now()
        run = {
            "id": run_id,
            "study_id": saved["id"],
            "revision": saved["revision"],
            "protocol": saved["study"],
            "protocol_hash": saved["hash"],
            "mapping": mapping(study),
            "settings": settings.model_dump(),
            "status": "queued",
            "cancel_requested": False,
            "created_at": timestamp,
            "updated_at": timestamp,
            "ended_at": None,
            "planned_schedule": [
                {k: s[k] for k in ("id", "pair_id", "arm", "order", "fixture")} for s in sessions
            ],
            "realized_schedule": [],
            "sessions": sessions,
            "attempts": [],
            "events": [{"at": timestamp, "kind": "created", "detail": "Protocol and schedule frozen."}],
            "metrics": summarize(sessions),
            "provenance": {
                "application": "mindlab-workbench/0.1.0",
                "protocol_version": PROTOCOL_VERSION,
                "renderer_version": RENDER_VERSION,
                "schedule_version": SCHEDULE_VERSION,
                "fixture_version": FIXTURE_VERSION if settings.source == "fixture" else None,
                "response_origin": "scripted_fixture" if settings.source == "fixture" else "model_output",
                "execution_mode": "fresh",
                "model": self.model_name if settings.source == "openai" else "FunctionModel",
                "packages": {
                    name: version(name) for name in ("pydantic-ai-slim", "pydantic", "openai", "fastapi")
                },
                "automatic_format_repair": False,
                "persona_regeneration": False,
                "sdk_retries": 0,
                "resume_supported": False,
                "replay_supported": False,
                "study_material": "User-authored protocol; example is an authored procedure fixture, not human data.",
            },
        }
        run["provenance"]["snapshot_hash"] = digest(
            {
                "protocol": run["protocol"],
                "settings": run["settings"],
                "mapping": run["mapping"],
                "schedule": run["planned_schedule"],
            }
        )
        self.store.create_run(run)
        self.current = run
        self.task = asyncio.create_task(self.execute(run, study, settings))
        return run

    def cancel(self, run_id):
        if not self.busy or self.current["id"] != run_id:
            return self.store.run(run_id)
        run = self.current
        if not run["cancel_requested"]:
            run["cancel_requested"] = True
            self.event(run, "cancel_requested", "No further attempts will be dispatched.")
        if self.pending is not None and not self.pending.done():
            self.pending.cancel()
        return run

    def event(self, run, kind, detail):
        run["events"].append({"at": now(), "kind": kind, "detail": detail})
        self.store.checkpoint(run)

    async def shutdown(self):
        if self.busy:
            # Shutdown is interruption, distinct from a researcher cancellation.
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def execute(self, run, study, settings):
        try:
            run["status"] = "running"
            self.event(run, "started", "Separate histories for every scheduled session.")
            for session in run["sessions"]:
                if run["cancel_requested"]:
                    break
                session["status"] = "running"
                history = []
                for stage in ("initial", "revision"):
                    if run["cancel_requested"]:
                        break
                    prompt = initial(study) if stage == "initial" else revision(study, session["arm"])
                    result = await self.stage(run, session, stage, prompt, history, study, settings)
                    if result is None:
                        session["status"] = "failed"
                        break  # Invalid/missing initial response cannot become a revision history.
                    token, history = result
                    field = "initial" if stage == "initial" else "revised"
                    session[field] = {"token": token, "choice_id": run["mapping"][token]}
                    session[f"{field}_correct"] = run["mapping"][token] == study.ground_truth
                    if stage == "revision":
                        session["changed"] = session["initial"]["token"] != token
                        session["status"] = "completed"
                    self.store.checkpoint(run)
            if run["cancel_requested"]:
                for session in run["sessions"]:
                    if session["status"] != "completed" and (
                        session["status"] in ("pending", "running")
                        or any(
                            a["session_id"] == session["id"] and a["status"] == "cancelled"
                            for a in run["attempts"]
                        )
                    ):
                        session["status"] = "cancelled"
                run["status"] = "cancelled"
            else:
                run["status"] = (
                    "completed_with_errors"
                    if any(s["status"] != "completed" for s in run["sessions"])
                    else "completed"
                )
            run["ended_at"] = now()
            self.event(run, "finished", run["status"])
        except asyncio.CancelledError:
            # Leave durable active state for recovery to reconcile. Never silently resume.
            if self.pending is not None and not self.pending.done():
                self.pending.cancel()
            raise
        except Exception as exc:
            if run["status"] not in TERMINAL:
                for a in run["attempts"]:
                    if a["status"] == "running":
                        a.update(status="error", ended_at=now(), error="Controller stopped unexpectedly.")
                for s in run["sessions"]:
                    if s["status"] in ("running", "pending"):
                        s["status"] = "interrupted"
                run.update(status="failed", ended_at=now())
                self.event(run, "controller_error", f"{type(exc).__name__}: inspect the recorded attempts.")

    async def stage(self, run, session, stage, prompt, history, study, settings):
        parent_attempt = None
        for number in range(1, settings.transport_retries + 2):
            if run["cancel_requested"]:
                return None
            attempt = {
                "id": uid("attempt"),
                "run_id": run["id"],
                "pair_id": session["pair_id"],
                "session_id": session["id"],
                "stage_id": f"{session['id']}-{stage}",
                "stage": stage,
                "number": number,
                "purpose": "transport_retry"
                if number > 1
                else ("independent_answer" if stage == "initial" else "scheduled_revision"),
                "retry_of": parent_attempt,
                "status": "running",
                "started_at": now(),
                "ended_at": None,
                "prompt": prompt,
                "request": None,
                "response": None,
                "wire_request": None,
                "wire_response": None,
                "choice": None,
                "error": None,
            }
            parent_attempt = attempt["id"]
            run["attempts"].append(attempt)
            run["realized_schedule"].append(
                {
                    "attempt_id": attempt["id"],
                    "session_id": session["id"],
                    "stage": stage,
                    "at": attempt["started_at"],
                }
            )
            self.store.checkpoint(run)

            def emit(field, value):
                # Credentials are never deliberately in bodies. Redact a literal echo as a final safeguard.
                serialized = json.dumps(value, ensure_ascii=False)
                if self.api_key:
                    serialized = serialized.replace(self.api_key, "[credential redacted]")
                attempt[field] = json.loads(serialized)
                self.store.checkpoint(run)

            retryable = False
            try:
                self.pending = asyncio.create_task(
                    respond(
                        prompt=prompt,
                        history=history,
                        output_type=response_type(study),
                        settings=settings,
                        profile=session["fixture"],
                        attempt_number=number,
                        emit=emit,
                        model_name=self.model_name,
                        api_key=self.api_key,
                    )
                )
                token, messages = await asyncio.wait_for(self.pending, timeout=settings.timeout_seconds)
                attempt.update(
                    status="valid",
                    ended_at=now(),
                    choice={"token": token, "choice_id": run["mapping"][token]},
                )
                self.store.checkpoint(run)
                return token, messages
            except asyncio.CancelledError:
                if not run["cancel_requested"]:
                    raise
                attempt.update(
                    status="cancelled",
                    error="Cancelled by researcher. A remote call may already have been received by its provider.",
                )
            except (TimeoutError, APITimeoutError):
                attempt.update(
                    status="timeout",
                    error="Attempt exceeded its configured deadline. No automatic timeout retry.",
                )
            except (FixtureConnectionError, APIConnectionError, ConnectionError):
                retryable = True
                attempt.update(
                    status="transport_error",
                    error="Transport failed; outcome retained. Remote delivery may be uncertain.",
                )
            except ModelHTTPError as exc:
                retryable = exc.status_code == 429 or exc.status_code >= 500
                attempt.update(
                    status="transport_error",
                    error=f"Provider HTTP {exc.status_code}. Response body excluded from records.",
                )
            except UnexpectedModelBehavior:
                attempt.update(
                    status="invalid",
                    error="Response did not satisfy the displayed answer schema. Raw response retained; no format repair.",
                )
            except Exception as exc:
                attempt.update(status="error", error=f"{type(exc).__name__}: participant invocation failed.")
            finally:
                self.pending = None
            attempt["ended_at"] = now()
            self.store.checkpoint(run)
            if not retryable:
                return None
        return None
