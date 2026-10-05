import json
import sys
from pathlib import Path

from workbench.api import create_app

path = Path(__file__).resolve().parents[1] / "docs" / "openapi.json"
content = json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n"
if "--check" in sys.argv:
    if path.read_text(encoding="utf-8") != content:
        raise SystemExit("OpenAPI is stale. Run scripts/export_contract.py and npm run contracts.")
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
