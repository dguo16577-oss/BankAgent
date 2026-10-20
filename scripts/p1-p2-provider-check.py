"""Read-only DeepSeek API account check; never prints the API credential."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
key_file = os.getenv("DEEPSEEK_API_KEY_FILE")
if not key_file:
    raise RuntimeError("Set DEEPSEEK_API_KEY_FILE to an ignored local file")
key = Path(key_file).read_text(encoding="utf-8").strip()
if not key:
    raise RuntimeError("DeepSeek key file is empty")

base = "https://api.deepseek.com"  # DeepSeekClassifier's default endpoint.
with httpx.Client(timeout=20, follow_redirects=False) as client:
    response = client.get(base + "/user/balance", headers={"Authorization": "Bearer " + key})
body = response.json() if "json" in response.headers.get("content-type", "") else {}
result = {
    "configured_provider": "DeepSeek official API",
    "configured_base_url": base,
    "balance_endpoint_http_status": response.status_code,
    "is_available": body.get("is_available") if isinstance(body, dict) else None,
    "balance_infos": body.get("balance_infos", []) if isinstance(body, dict) else [],
    "proxy_env_names": sorted(name for name in os.environ if name.upper() in
                              {"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"}),
    "model_acceptance": ("MODEL_PROVIDER_BLOCKED" if response.status_code == 200
                         and body.get("is_available") is False else
                         "AVAILABLE_FOR_TEST" if response.status_code == 200
                         and body.get("is_available") is True else "CHECK_REQUIRED"),
}
(ROOT / "artifacts" / "p1-p2-provider-check.json").write_text(
    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
