import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .conversation_evaluation import router as conversation_evaluation_router
from .exports import attempt_csv, session_csv, simulation_csv
from .measurement import router as measurement_router
from .practice import PracticeController
from .practice import router as practice_router
from .practice_review import router as practice_review_router
from .protocol import EXAMPLE, Launch, PreviewInput, Settings, Study, preview
from .runner import Runner
from .simulation import SimulationConfig, SimulationLaunch, SimulationRunner
from .store import Store

ROOT = Path(__file__).resolve().parents[2]


@asynccontextmanager
async def database_lease(path):
    """A local database has one running controller, including during recovery."""
    lock = Path(str(path) + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    handle = lock.open("a+b")
    try:
        if lock.stat().st_size == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        handle.close()


def create_app(db_path=None):
    path = Path(db_path or Path(os.getenv("MINDLAB_DATA_DIR", str(ROOT / "data"))) / "workbench.sqlite3")

    @asynccontextmanager
    async def lifespan(app):
        async with database_lease(path):
            store = Store(path)
            store.recover()
            enabled = os.getenv("MINDLAB_ENABLE_REMOTE") == "1"
            runner = Runner(
                store,
                os.getenv("MINDLAB_OPENAI_MODEL") if enabled else None,
                os.getenv("OPENAI_API_KEY") if enabled else None,
            )
            app.state.store = store
            app.state.runner = runner
            app.state.simulator = SimulationRunner(store)
            app.state.practice = PracticeController(store, runner.model_name, runner.api_key)
            yield
            await app.state.simulator.shutdown()
            await runner.shutdown()

    app = FastAPI(title="MindLab Workbench", version="0.1.0", lifespan=lifespan)
    app.include_router(practice_router)
    app.include_router(practice_review_router)
    app.include_router(measurement_router)
    app.include_router(conversation_evaluation_router)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"])

    @app.middleware("http")
    async def local_mutations(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin:
                parsed = urlparse(origin)
                if parsed.scheme not in ("http", "https") or parsed.hostname not in (
                    "127.0.0.1",
                    "localhost",
                    "::1",
                ):
                    return JSONResponse(
                        {"detail": "Only local browser origins are allowed."}, status_code=403
                    )
            if request.headers.get("content-type", "").split(";")[0] != "application/json":
                return JSONResponse({"detail": "Mutations require application/json."}, status_code=415)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(KeyError)
    async def not_found(request, exc):
        return JSONResponse({"detail": "Record not found."}, status_code=404)

    @app.get("/api/health")
    def health(request: Request):
        runner = request.app.state.runner
        return {
            "ok": True,
            "app": "MindLab Workbench",
            "version": "0.1.0",
            "remote_available": bool(runner.api_key and runner.model_name),
            "remote_model": runner.model_name if runner.api_key else None,
            "active_run": runner.current["id"] if runner.busy else None,
            "active_simulation": request.app.state.simulator.current_id
            if request.app.state.simulator.busy
            else None,
        }

    @app.get("/api/example", response_model=Study)
    def example():
        return EXAMPLE

    @app.get("/api/settings", response_model=Settings)
    def default_settings():
        return Settings()

    @app.post("/api/preview")
    def inspect(body: PreviewInput):
        try:
            return preview(body.study, body.example_token)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/studies")
    def studies(request: Request):
        return request.app.state.store.studies()

    @app.post("/api/studies", status_code=201)
    def save(body: Study, request: Request):
        return request.app.state.store.save_study(body)

    @app.get("/api/studies/{study_id}")
    def get_study(study_id: str, request: Request, revision: int | None = None):
        return request.app.state.store.study(study_id, revision)

    @app.put("/api/studies/{study_id}")
    def revise(study_id: str, body: Study, request: Request):
        request.app.state.store.study(study_id)
        return request.app.state.store.save_study(body, study_id)

    @app.get("/api/runs")
    def runs(request: Request):
        return [
            {
                k: r[k]
                for k in (
                    "id",
                    "study_id",
                    "revision",
                    "created_at",
                    "status",
                    "metrics",
                    "settings",
                    "provenance",
                )
            }
            | {"title": r["protocol"]["title"]}
            for r in request.app.state.store.runs()
        ]

    @app.post("/api/runs", status_code=202)
    async def launch(body: Launch, request: Request):
        store = request.app.state.store
        saved = store.study(body.study_id, body.revision)
        if request.app.state.simulator.busy:
            raise HTTPException(409, "A study simulation is running. Wait or cancel it first.")
        try:
            run = request.app.state.runner.launch(saved, body.settings)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"id": run["id"]}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, request: Request):
        return request.app.state.store.run(run_id)

    @app.post("/api/runs/{run_id}/cancel")
    async def cancel(run_id: str, request: Request):
        request.app.state.runner.cancel(run_id)
        return {"id": run_id, "requested": True}

    @app.get("/api/runs/{run_id}/export/{kind}")
    def export(run_id: str, kind: str, request: Request):
        run = request.app.state.store.run(run_id)
        if kind == "json":
            content, media = json.dumps(run, ensure_ascii=False, indent=2), "application/json"
        elif kind in ("sessions.csv", "attempts.csv"):
            content = session_csv(run) if kind == "sessions.csv" else attempt_csv(run)
            media = "text/csv; charset=utf-8"
        else:
            raise HTTPException(404, "Unknown export format.")
        return Response(
            content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{run_id}.{kind}"'},
        )

    @app.get("/api/simulation-settings", response_model=SimulationConfig)
    def simulation_defaults():
        return SimulationConfig()

    @app.get("/api/simulations")
    def simulations(request: Request):
        return [
            {key: value for key, value in run.items() if key not in ("repetitions", "aggregate", "events")}
            for run in request.app.state.store.simulations()
            if not run["provenance"].get("exercise")
        ]

    @app.post("/api/simulations", status_code=202)
    async def launch_simulation(body: SimulationLaunch, request: Request):
        if request.app.state.runner.busy:
            raise HTTPException(409, "A participant rehearsal is running. Wait or cancel it first.")
        saved = request.app.state.store.study(body.study_id, body.revision)
        try:
            run_id = request.app.state.simulator.launch(saved, body.config)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"id": run_id}

    @app.get("/api/simulations/{run_id}")
    def get_simulation(run_id: str, request: Request, summary_only: bool = False):
        run = request.app.state.store.simulation(run_id)
        if summary_only:
            run.pop("repetitions")
        return run

    @app.post("/api/simulations/{run_id}/cancel")
    async def cancel_simulation(run_id: str, request: Request):
        request.app.state.simulator.cancel(run_id)
        return {"id": run_id, "requested": True}

    @app.get("/api/simulations/{run_id}/export/{kind}")
    def export_simulation(run_id: str, kind: str, request: Request):
        run = request.app.state.store.simulation(run_id)
        if kind == "json":
            content, media = json.dumps(run, ensure_ascii=False, indent=2), "application/json"
        elif kind == "repetitions.csv":
            if run["provenance"].get("exercise"):
                raise HTTPException(422, "This exercise has nested results. Use the complete JSON export.")
            content, media = simulation_csv(run), "text/csv; charset=utf-8"
        else:
            raise HTTPException(404, "Unknown export format.")
        return Response(
            content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{run_id}.{kind}"'},
        )

    dist = ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def dashboard():
        if not (dist / "index.html").is_file():
            return JSONResponse(
                {"detail": "Build the dashboard with npm run build in frontend, then restart."},
                status_code=503,
            )
        return FileResponse(dist / "index.html")

    return app


app = create_app()
