"""Original synthetic 1PL exercise using the existing Monte Carlo worker and recorder."""

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, model_validator

from .knowledge import retrieve
from .protocol import StrictModel
from .simulation import distribution

VERSION = "synthetic-1pl-eap/1.0.0"
DIFFICULTIES = np.linspace(-3, 3, 41)
GRID = np.linspace(-5, 5, 201)
PROBABILITIES = 1 / (1 + np.exp(-(GRID[:, None] - DIFFICULTIES)))
LOG_P = np.log(PROBABILITIES)
LOG_Q = np.log1p(-PROBABILITIES)
PROTOCOL = {
    "version": VERSION,
    "origin": "Original synthetic binary item bank. No IPIP items or real test content.",
    "items": [
        {"id": f"synthetic-{i + 1:02}", "difficulty": float(b), "discrimination": 1, "guessing": 0}
        for i, b in enumerate(DIFFICULTIES)
    ],
    "response": "P(correct | theta,b) = (1-lapse)*logistic(theta-b) + lapse*0.5",
    "population": "theta ~ Normal(config.population_mean, config.population_sd); not a norm group",
    "estimator": "EAP on 201 equally spaced nodes [-5,5], N(0,1) prior; assumes lapse=0",
    "interval": "Equal-tail 95% posterior credible interval on the grid; reported coverage is empirical simulator coverage, not a confidence guarantee",
    "selection": "spread: fixed equally spaced item indices; adaptive: unused item nearest current EAP (max information at point estimate), lower index on ties",
    "pairing": "Within each repetition, designs share theta and one uniform potential response per item. Different repetitions are independent.",
    "limits": "Known item parameters, unidimensional local independence, no calibration error, content balancing or actual fairness evaluation. Short tests and prior mismatch can shrink estimates. Grid truncation affects extreme values. Lapse is synthetic response noise, not a diagnosis or validity scale.",
}


class MeasurementConfig(StrictModel):
    repetitions: int = Field(default=200, strict=True, ge=1, le=1000)
    short_length: int = Field(default=5, strict=True, ge=2, le=30)
    long_length: int = Field(default=15, strict=True, ge=2, le=30)
    seed: int = Field(default=42, strict=True, ge=0, le=2**32 - 1)
    population_mean: float = Field(default=0, ge=-2, le=2, allow_inf_nan=False)
    population_sd: float = Field(default=1, ge=0.25, le=2, allow_inf_nan=False)
    lapse: float = Field(default=0, ge=0, le=0.5, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.short_length >= self.long_length:
            raise ValueError("The comparison length must be longer than the short test.")
        return self


def posterior(log_weights):
    weights = np.exp(log_weights - np.max(log_weights))
    weights /= weights.sum()
    cumulative = weights.cumsum()
    return (
        float(weights @ GRID),
        float(GRID[np.searchsorted(cumulative, 0.025)]),
        float(GRID[np.searchsorted(cumulative, 0.975)]),
    )


def measure(theta, uniforms, length, selection, lapse=0):
    log_weights = -(GRID**2) / 2
    selected, responses, path = [], [], []
    fixed = np.rint(np.linspace(0, 40, length)).astype(int)
    for step in range(length):
        estimate, _, _ = posterior(log_weights)
        candidates = [i for i in range(41) if i not in selected]
        item = (
            int(fixed[step])
            if selection == "spread"
            else min(candidates, key=lambda i: (abs(DIFFICULTIES[i] - estimate), i))
        )
        probability = (1 - lapse) / (1 + np.exp(-(theta - DIFFICULTIES[item]))) + lapse * 0.5
        response = bool(uniforms[item] < probability)
        log_weights = log_weights + (LOG_P[:, item] if response else LOG_Q[:, item])
        selected.append(item)
        responses.append(int(response))
        path.append(posterior(log_weights)[0])
    estimate, low, high = posterior(log_weights)
    return {
        "selection": selection,
        "length": length,
        "estimate": estimate,
        "error": estimate - theta,
        "low": low,
        "high": high,
        "covered": low <= theta <= high,
        "item_indices": selected,
        "responses": responses,
        "estimate_path": path,
    }


def repetition(config, index):
    rng = np.random.Generator(np.random.PCG64(np.random.SeedSequence(config.seed, spawn_key=(700, index))))
    theta = float(rng.normal(config.population_mean, config.population_sd))
    uniforms = rng.random(41)
    return {
        "repetition": index + 1,
        "theta": theta,
        "designs": [
            measure(theta, uniforms, length, selection, config.lapse)
            for length in (config.short_length, config.long_length)
            for selection in ("spread", "adaptive")
        ],
    }


def aggregate(rows):
    if not rows:
        return []
    summaries = []
    for design in rows[0]["designs"]:
        selected = [
            d
            for row in rows
            for d in row["designs"]
            if (d["length"], d["selection"]) == (design["length"], design["selection"])
        ]
        errors = np.array([d["error"] for d in selected])
        coverage = float(np.mean([d["covered"] for d in selected]))
        summaries.append(
            {
                "length": design["length"],
                "selection": design["selection"],
                "n": len(selected),
                "bias": float(errors.mean()),
                "rmse": float(np.sqrt(np.mean(errors**2))),
                "coverage": coverage,
                "coverage_mc_se": float(np.sqrt(coverage * (1 - coverage) / len(selected))),
                "mean_interval_width": float(np.mean([d["high"] - d["low"] for d in selected])),
                "error_distribution": distribution(errors.tolist()),
                "exposure": [
                    sum(i in d["item_indices"] for d in selected) / len(selected) for i in range(41)
                ],
            }
        )
    return summaries


router = APIRouter(prefix="/api/measurement", tags=["Synthetic measurement"])


@router.get("/definition")
def definition():
    return {
        "protocol": PROTOCOL,
        "defaults": MeasurementConfig().model_dump(),
        "references": retrieve(["measurement"]),
    }


@router.get("/runs")
def runs(request: Request):
    return [
        {k: r[k] for k in ("id", "created_at", "status", "config")}
        for r in request.app.state.store.simulations()
        if r["provenance"].get("exercise") == "measurement"
    ]


@router.post("/runs", status_code=202)
async def launch(config: MeasurementConfig, request: Request):
    if request.app.state.runner.busy:
        raise HTTPException(409, "Another rehearsal is running.")
    try:
        run_id = request.app.state.simulator.launch_exercise(
            "measurement",
            config,
            PROTOCOL,
            {
                "model_version": VERSION,
                "response_origin": "synthetic_measurement",
                "generator": "NumPy PCG64; SeedSequence(seed, spawn_key=(700, repetition_index))",
                "limitations": PROTOCOL["limits"],
                "references": retrieve(["measurement"]),
            },
            repetition,
            aggregate,
        )
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"id": run_id}
