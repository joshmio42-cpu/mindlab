"""Offline Monte Carlo model. No participant/model adapter is called here."""

import asyncio
import platform
import threading
import time
from typing import Annotated

import numpy as np
from pydantic import Field, model_validator

from .protocol import StrictModel, Study, digest, mapping
from .store import now, uid

MODEL_VERSION = "independent-conformity/1.0"
METRICS = ("initial_accuracy", "final_accuracy", "answer_change", "peer_selection", "adoption")
PRIMARY = "peer_selection"
MAX_PARTICIPANTS = 20_000_000
SampleSize = Annotated[int, Field(strict=True, ge=1, le=10_000)]


class SimulationConfig(StrictModel):
    participants_per_condition: SampleSize = 100
    repetitions: int = Field(default=500, strict=True, ge=1, le=2000)
    initial_correctness: float = Field(default=0.7, ge=0, le=1, allow_inf_nan=False)
    baseline_change: float = Field(default=0.1, ge=0, le=1, allow_inf_nan=False)
    peer_adoption: float = Field(default=0.3, ge=0, le=1, allow_inf_nan=False)
    seed: int = Field(default=42, strict=True, ge=0, le=2**32 - 1)
    comparison_sizes: list[SampleSize] = Field(default_factory=list, max_length=5)

    @property
    def sizes(self):
        return sorted(set([self.participants_per_condition, *self.comparison_sizes]))

    @model_validator(mode="after")
    def bounded_work(self):
        if len(self.comparison_sizes) != len(set(self.comparison_sizes)):
            raise ValueError("Comparison sample sizes must be unique.")
        if 2 * sum(self.sizes) * self.repetitions > MAX_PARTICIPANTS:
            raise ValueError(
                "Use at most 20,000,000 simulated participants across all sizes and repetitions."
            )
        return self


class SimulationLaunch(StrictModel):
    study_id: str
    revision: int = Field(ge=1)
    config: SimulationConfig = Field(default_factory=SimulationConfig)


def indices(study):
    ids = [option.id for option in study.options]
    peer_ids = {peer.choice_id for peer in study.peers}
    if len(peer_ids) != 1:
        raise ValueError("Study rehearsal requires all scripted peers to select the same answer.")
    peer = next(iter(peer_ids))
    if peer == study.ground_truth:
        raise ValueError("Study rehearsal requires a scripted peer answer different from the correct answer.")
    return ids.index(study.ground_truth), ids.index(peer)


def generate_group(rng, n, options, correct, peer, config, treatment):
    """Fixed draw order is part of MODEL_VERSION; return temporary arrays only."""
    correct_draw = rng.random(n) < config.initial_correctness
    wrong = rng.integers(0, options - 1, size=n)
    wrong += wrong >= correct  # Uniform among every option except the answer key.
    initial = np.where(correct_draw, correct, wrong)
    change = rng.random(n) < config.baseline_change
    offsets = rng.integers(1, options, size=n)
    final = np.where(change, (initial + offsets) % options, initial)
    adoption = rng.random(n) < config.peer_adoption
    if treatment:
        final = np.where(adoption, peer, final)
    return initial, final


def score(initial, final, correct, peer):
    eligible = initial != peer
    n = len(initial)

    def rate(mask, denominator=n):
        count = int(np.count_nonzero(mask))
        return {
            "count": count,
            "denominator": int(denominator),
            "rate": count / denominator if denominator else None,
        }

    return {
        "initial_accuracy": rate(initial == correct),
        "final_accuracy": rate(final == correct),
        "answer_change": rate(initial != final),
        "peer_selection": rate(final == peer),
        "adoption": rate(eligible & (final == peer), int(np.count_nonzero(eligible))),
    }


def repetition(study, config, n, index):
    correct, peer = indices(study)
    result = {"participants_per_condition": n, "repetition": index + 1}
    for arm_index, arm in enumerate(("control", "treatment")):
        sequence = np.random.SeedSequence(config.seed, spawn_key=(n, index, arm_index))
        rng = np.random.Generator(np.random.PCG64(sequence))
        initial, final = generate_group(rng, n, len(study.options), correct, peer, config, arm == "treatment")
        result[arm] = score(initial, final, correct, peer)
    result["difference_pp"] = {
        metric: 100 * (result["treatment"][metric]["rate"] - result["control"][metric]["rate"])
        if result["treatment"][metric]["rate"] is not None and result["control"][metric]["rate"] is not None
        else None
        for metric in METRICS
    }
    return result


def distribution(values):
    data = [value for value in values if value is not None]
    if not data:
        return {"count": 0, "mean": None, "low": None, "high": None, "sd": None}
    low, high = np.quantile(data, [0.025, 0.975], method="linear")
    return {
        "count": len(data),
        "mean": float(np.mean(data)),
        "low": float(low),
        "high": float(high),
        "sd": float(np.std(data, ddof=0)),
    }


def aggregate(rows, sizes):
    output = []
    for n in sizes:
        selected = [row for row in rows if row["participants_per_condition"] == n]
        entry = {"participants_per_condition": n, "completed_repetitions": len(selected)}
        for arm in ("control", "treatment"):
            entry[arm] = {
                metric: distribution([row[arm][metric]["rate"] for row in selected])
                | {
                    "numerator_total": sum(row[arm][metric]["count"] for row in selected),
                    "denominator_total": sum(row[arm][metric]["denominator"] for row in selected),
                }
                for metric in METRICS
            }
        entry["difference_pp"] = {
            metric: distribution([row["difference_pp"][metric] for row in selected]) for metric in METRICS
        }
        values = [row["difference_pp"][PRIMARY] for row in selected]
        entry["histogram"] = []
        if values:
            lower, upper = max(-100, min(values) - 1), min(100, max(values) + 1)
            counts, edges = np.histogram(values, bins=20, range=(lower, upper))
            entry["histogram"] = [
                {"low": float(edges[i]), "high": float(edges[i + 1]), "count": int(count)}
                for i, count in enumerate(counts)
            ]
        output.append(entry)
    return output


class SimulationRunner:
    def __init__(self, store):
        self.store = store
        self.task = None
        self.current_id = None
        self.stop = threading.Event()
        self.interrupted = threading.Event()

    @property
    def busy(self):
        return self.task is not None and not self.task.done()

    def launch(self, saved, config):
        if self.busy:
            raise RuntimeError("A study simulation is already running. Wait or cancel it first.")
        study = Study.model_validate(saved["study"])
        _, peer = indices(study)
        timestamp = now()
        run = {
            "id": uid("sim"),
            "study_id": saved["id"],
            "revision": saved["revision"],
            "protocol": saved["study"],
            "protocol_hash": saved["hash"],
            "mapping": mapping(study),
            "peer_choice_id": study.options[peer].id,
            "config": config.model_dump(),
            "config_hash": digest(config.model_dump()),
            "sample_sizes": config.sizes,
            "planned_repetitions": config.repetitions * len(config.sizes),
            "completed_repetitions": 0,
            "status": "queued",
            "created_at": timestamp,
            "updated_at": timestamp,
            "ended_at": None,
            "cancel_requested": False,
            "error": None,
            "repetitions": [],
            "aggregate": aggregate([], config.sizes),
            "events": [{"at": timestamp, "kind": "created"}],
            "provenance": {
                "response_origin": "probability_simulation",
                "model_version": MODEL_VERSION,
                "generator": "NumPy Generator(PCG64)",
                "seed_sequence": "SeedSequence(seed, spawn_key=(participants_per_condition, zero_based_repetition, arm_index))",
                "arm_indices": {"control": 0, "treatment": 1},
                "packages": {"numpy": np.__version__, "python": platform.python_version()},
                "quantile_method": "linear",
                "interval": "95% simulation interval",
                "primary_comparison": "treatment minus control final peer-answer selection, percentage points",
                "adoption_metric": "final peer answer among initial non-peer answers; null if no eligible participants",
                "limitations": "Fixed homogeneous probabilities; uniform alternative answers; no text comprehension, human evidence, or measured AI-model behavior. No statistical test or power analysis.",
                "participants_retained": False,
                "resume_supported": False,
            },
        }
        self.store.create_simulation(run)
        self.current_id = run["id"]
        self.stop.clear()
        self.interrupted.clear()
        self.task = asyncio.create_task(asyncio.to_thread(self.execute, run, study, config))
        return run["id"]

    def cancel(self, run_id):
        self.store.simulation(run_id)  # Verify the ID even for a completed run.
        if self.busy and self.current_id == run_id:
            self.stop.set()

    def launch_exercise(self, kind, config, protocol, provenance, row_function, summary_function):
        """Share the bounded worker, cancellation, durable records and exports with new labs."""
        if self.busy:
            raise RuntimeError("A simulation is already running. Wait or cancel it first.")
        timestamp = now()
        run = {
            "id": uid("sim"),
            "study_id": f"exercise:{kind}",
            "revision": 1,
            "protocol": protocol,
            "protocol_hash": digest(protocol),
            "mapping": {},
            "peer_choice_id": None,
            "config": config.model_dump(),
            "config_hash": digest(config.model_dump()),
            "sample_sizes": [],
            "planned_repetitions": config.repetitions,
            "completed_repetitions": 0,
            "status": "queued",
            "created_at": timestamp,
            "updated_at": timestamp,
            "ended_at": None,
            "cancel_requested": False,
            "error": None,
            "repetitions": [],
            "aggregate": summary_function([]),
            "events": [{"at": timestamp, "kind": "created"}],
            "provenance": {
                **provenance,
                "exercise": kind,
                "packages": {"numpy": np.__version__, "python": platform.python_version()},
            },
        }
        self.store.create_simulation(run)
        self.current_id = run["id"]
        self.stop.clear()
        self.interrupted.clear()
        rows = (row_function(config, index) for index in range(config.repetitions))
        self.task = asyncio.create_task(asyncio.to_thread(self.execute_rows, run, rows, summary_function))
        return run["id"]

    async def shutdown(self):
        if self.busy:
            self.interrupted.set()
            self.stop.set()
            await self.task

    def checkpoint(self, run, sizes):
        run["completed_repetitions"] = len(run["repetitions"])
        run["aggregate"] = aggregate(run["repetitions"], sizes)
        self.store.checkpoint_simulation(run)

    def execute(self, run, study, config):
        rows = (
            repetition(study, config, n, index) for index in range(config.repetitions) for n in config.sizes
        )
        self.execute_rows(run, rows, lambda rows: aggregate(rows, config.sizes))

    def execute_rows(self, run, rows, summary_function):
        def checkpoint():
            run["completed_repetitions"] = len(run["repetitions"])
            run["aggregate"] = summary_function(run["repetitions"])
            self.store.checkpoint_simulation(run)

        try:
            run["status"] = "running"
            run["events"].append({"at": now(), "kind": "started"})
            checkpoint()
            last_checkpoint = time.monotonic()
            iterator = iter(rows)
            while not self.stop.is_set():
                try:
                    row = next(iterator)
                except StopIteration:
                    break
                run["repetitions"].append(row)
                if time.monotonic() - last_checkpoint >= 0.25:
                    checkpoint()
                    last_checkpoint = time.monotonic()
            if self.interrupted.is_set():
                run["status"] = "interrupted"
            elif self.stop.is_set():
                run["status"] = "cancelled"
                run["cancel_requested"] = True
            else:
                run["status"] = "completed"
        except Exception as exc:
            run["status"] = "failed"
            run["error"] = (
                f"{type(exc).__name__}: simulation stopped; only completed repetitions are retained."
            )
        run["ended_at"] = now()
        run["events"].append({"at": now(), "kind": run["status"]})
        checkpoint()
