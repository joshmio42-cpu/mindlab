import csv
import io
import json


def safe_cell(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    if isinstance(value, str) and (
        value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n"))
    ):
        return "'" + value
    return value


def csv_document(rows, columns):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\r\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: safe_cell(row.get(key)) for key in columns})
    return buffer.getvalue()


def session_csv(run):
    labels = {o["id"]: o["text"] for o in run["protocol"]["options"]}
    rows = []
    for session in run["sessions"]:
        row = {
            "run_id": run["id"],
            "study_id": run["study_id"],
            "revision": run["revision"],
            "protocol_hash": run["protocol_hash"],
            "title": run["protocol"]["title"],
            "session_id": session["id"],
            "response_origin": run["provenance"]["response_origin"],
            "execution_mode": "fresh",
            **session,
        }
        for field in ("initial", "revised"):
            answer = session[field]
            row[f"{field}_token"] = answer["token"] if answer else None
            row[f"{field}_choice_id"] = answer["choice_id"] if answer else None
            row[f"{field}_text"] = labels[answer["choice_id"]] if answer else None
        rows.append(row)
    columns = [
        "run_id",
        "study_id",
        "revision",
        "protocol_hash",
        "title",
        "pair_id",
        "session_id",
        "arm",
        "order",
        "fixture",
        "status",
        "response_origin",
        "execution_mode",
        "initial_token",
        "initial_choice_id",
        "initial_text",
        "initial_correct",
        "revised_token",
        "revised_choice_id",
        "revised_text",
        "revised_correct",
        "changed",
    ]
    return csv_document(rows, columns)


def attempt_csv(run):
    rows = [
        {
            **a,
            "attempt_id": a["id"],
            "protocol_hash": run["protocol_hash"],
            "response_origin": run["provenance"]["response_origin"],
            "execution_mode": "fresh",
        }
        for a in run["attempts"]
    ]
    columns = [
        "run_id",
        "protocol_hash",
        "pair_id",
        "session_id",
        "stage_id",
        "attempt_id",
        "stage",
        "number",
        "purpose",
        "retry_of",
        "status",
        "response_origin",
        "execution_mode",
        "started_at",
        "ended_at",
        "choice",
        "error",
        "prompt",
        "request",
        "response",
        "wire_request",
        "wire_response",
    ]
    return csv_document(rows, columns)


def simulation_csv(run):
    from .simulation import METRICS

    columns = [
        "run_id",
        "study_id",
        "revision",
        "protocol_hash",
        "config_hash",
        "title",
        "status",
        "response_origin",
        "model_version",
        "numpy_version",
        "seed",
        "initial_correctness",
        "baseline_change",
        "peer_adoption",
        "planned_repetitions_per_size",
        "completed_repetitions_all_sizes",
        "participants_per_condition",
        "total_sample_size",
        "repetition",
    ]
    for arm in ("control", "treatment"):
        columns.extend(
            f"{arm}_{metric}_{field}" for metric in METRICS for field in ("count", "denominator", "rate")
        )
    columns.extend(f"difference_{metric}_pp" for metric in METRICS)
    rows = []
    for result in run["repetitions"]:
        row = {
            "run_id": run["id"],
            "study_id": run["study_id"],
            "revision": run["revision"],
            "protocol_hash": run["protocol_hash"],
            "config_hash": run["config_hash"],
            "title": run["protocol"]["title"],
            "status": run["status"],
            "response_origin": run["provenance"]["response_origin"],
            "model_version": run["provenance"]["model_version"],
            "numpy_version": run["provenance"]["packages"]["numpy"],
            **{
                key: run["config"][key]
                for key in ("seed", "initial_correctness", "baseline_change", "peer_adoption")
            },
            "planned_repetitions_per_size": run["config"]["repetitions"],
            "completed_repetitions_all_sizes": run["completed_repetitions"],
            "participants_per_condition": result["participants_per_condition"],
            "total_sample_size": 2 * result["participants_per_condition"],
            "repetition": result["repetition"],
        }
        for arm in ("control", "treatment"):
            for metric in METRICS:
                for field in ("count", "denominator", "rate"):
                    row[f"{arm}_{metric}_{field}"] = result[arm][metric][field]
        row.update({f"difference_{metric}_pp": result["difference_pp"][metric] for metric in METRICS})
        rows.append(row)
    return csv_document(rows, columns)
