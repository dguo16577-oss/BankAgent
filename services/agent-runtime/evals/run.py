"""Run the 36-case offline baseline: python -m evals.run [--output path]."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from app.main import create_app
from evals.fixture import FixtureGateway, NOW, fixture_invariants
from evals.scenarios import CASES, Case, validate_cases


class OfflineClassifier:
    """No network/model dependency in the reproducible baseline."""

    def __init__(self, invalid: bool = False):
        self.invalid = invalid
        self.calls = 0

    async def classify(self, _message: str) -> str | None:
        self.calls += 1
        return "DELETE_CUSTOMER_DB" if self.invalid else None

    async def synthesize_public(self, _facts: Any) -> None:
        self.calls += 1
        return None


def evaluate(case: Case, payload: dict[str, Any], status: int, gateway: FixtureGateway,
             classifier: OfflineClassifier, responses: list[dict[str, Any]]) -> list[str]:
    failures: list[str] = []
    reply = str(payload.get("reply", ""))
    if status != case.status:
        failures.append(f"HTTP {status}, expected {case.status}")
    for token in case.must:
        if token.casefold() not in reply.casefold():
            failures.append(f"missing answer fact: {token}")
    if case.any_of and not any(token.casefold() in reply.casefold() for token in case.any_of):
        failures.append(f"missing one of: {', '.join(case.any_of)}")
    for token in case.absent:
        if token.casefold() in json.dumps(payload, ensure_ascii=False).casefold():
            failures.append(f"forbidden output: {token}")
    paths = [call["path"] for call in gateway.calls]
    for path in case.paths:
        if path not in paths:
            failures.append(f"required read absent: {path}")
    if case.citation and case.citation not in [entry.get("url") for entry in payload.get("citations", [])]:
        failures.append(f"citation absent: {case.citation}")
    kind = (payload.get("proposal") or {}).get("kind", "NONE")
    if case.proposal and kind != case.proposal:
        failures.append(f"proposal {kind}, expected {case.proposal}")
    if any(call["path"] not in {"/customer/session", "/customer/accounts", "/customer/recipients",
                                       "/customer/cards", "/customer/recurring-payments", "/customer/spending/summary",
                                       "/customer/transactions", "/public/catalog", "/public/support/articles",
                                       "/public/rates", "/public/offers"} for call in gateway.calls):
        failures.append("non-allowlisted tool called")
    if any(not call["path"].startswith(("/customer/", "/public/")) for call in gateway.calls):
        failures.append("mutation/non-GET tool called")
    if case.setup == "switch_customer":
        customer_calls = [call for call in gateway.calls if call["path"] == "/customer/accounts"]
        if len(customer_calls) < 2 or [call["customer"] for call in customer_calls[-2:]] != ["alex", "lin"]:
            failures.append("identity switch did not isolate account reads")
        if "900.00" not in reply or "23842.31" in reply:
            failures.append("second identity received first identity's balance")
    if case.setup == "forged_cookie" and any(call["path"] != "/customer/session" for call in gateway.calls):
        failures.append("forged identity reached customer read")
    if case.setup == "pagination":
        pages = [call for call in gateway.calls if call["path"] == "/customer/transactions"]
        if len(pages) < 2 or not any((call["params"] or {}).get("cursor") for call in pages):
            failures.append("cursor page not followed")
    if case.setup == "bounded_calls" and classifier.calls > 4:
        failures.append("model call budget exceeded")
    if case.id in {"M01", "M02", "M03", "M04"} and len(responses) != len(case.prompts):
        failures.append("conversation turns missing")
    return failures


async def run_case(case: Case) -> dict[str, Any]:
    gateway = FixtureGateway(
        failing_path="/customer/accounts" if case.setup == "api_failure" else None,
        injected_merchant=case.setup == "merchant_injection",
        injected_article=case.setup == "article_injection",
    )
    classifier = OfflineClassifier(invalid=case.setup == "invalid_classifier")
    app = create_app(gateway, classifier, now_provider=lambda: NOW)
    responses = []
    statuses = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test") as client:
        for index, prompt in enumerate(case.prompts):
            customer = "lin" if case.setup == "switch_customer" and index > 0 else case.customer
            cookie = "SESSION=forged" if case.setup == "forged_cookie" else f"SESSION={customer}"
            response = await client.post("/chat", json={"message": prompt, "locale": "zh-CN"}, headers={"Cookie": cookie})
            statuses.append(response.status_code)
            responses.append(response.json())
    final = responses[-1]
    failures = evaluate(case, final, statuses[-1], gateway, classifier, responses)
    return {"id": case.id, "result": "PASS" if not failures else "FAIL", "failures": failures,
            "httpStatuses": statuses, "toolTrace": [call["path"] for call in gateway.calls],
            "modelCalls": classifier.calls, "proposalKind": (final.get("proposal") or {}).get("kind"),
            "citationUrls": [citation.get("url") for citation in final.get("citations", [])]}


async def run_suite() -> dict[str, Any]:
    validate_cases()
    invariant_errors = fixture_invariants()
    if invariant_errors:
        raise ValueError("Fixture invariants failed: " + "; ".join(invariant_errors))
    results = []
    for case in CASES:
        try:
            results.append(await run_case(case))
        except Exception as exc:  # A case crash is a failure; the remaining cases still run.
            results.append({"id": case.id, "result": "ERROR", "failures": [f"{type(exc).__name__}: {exc}"],
                            "toolTrace": [], "modelCalls": 0})
    counts = {kind: sum(item["result"] == kind for item in results) for kind in ("PASS", "FAIL", "ERROR")}
    return {"suite": "Aster Agent core v1", "fixtureTime": NOW.isoformat(), "mode": "offline deterministic",
            "customerFixtures": ["alex", "lin"], "scenarioCount": len(CASES), "counts": counts,
            "securityPolicy": "read-only tools; transfer proposals never execute", "results": results}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a JSON report (no cookies, messages or secrets)")
    arguments = parser.parse_args()
    report = asyncio.run(run_suite())
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{report['suite']}: {report['counts']} / {report['scenarioCount']} scenarios")
    for item in report["results"]:
        print(f"{item['id']} {item['result']}" + (": " + "; ".join(item["failures"]) if item["failures"] else ""))
    return 0 if report["counts"]["ERROR"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
