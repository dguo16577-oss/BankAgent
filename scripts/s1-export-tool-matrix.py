"""Export the actual Agent v2 registry with its security-facing capability metadata."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.agent_v2.tools import ToolRegistry  # noqa: E402
from app.banking import BankingGateway  # noqa: E402
from app.mcp_pilot import PILOT_TOOLS, PROVIDERS  # noqa: E402


def evidence(name: str) -> str:
    explicit = {
        "prepare_transfer": "Observed owned account + verified recipient; user amount/note",
        "prepare_scheduled_transfer": "Same as transfer + valid user time",
        "prepare_cancel_scheduled_transfer": "Observed schedule + version",
        "prepare_split_request": "Owned account + calculated shares + verified recipients",
        "prepare_cancel_split_request": "Observed owner split + version",
        "prepare_card_action": "Observed and inspected owned card; controls/limits inspection when relevant",
        "prepare_card_application": "Observed catalog product/account + user contact email",
        "prepare_credit_limit_application": "Observed and inspected owned credit card",
        "prepare_investment_purchase": "Observed account/product + SUITABLE bank decision + user amount",
        "prepare_investment_redemption": "Observed holding/account + active risk assessment + user amount",
        "prepare_stop_recurring_payment": "Inspected BANK_MANAGED mandate",
        "prepare_renewal_reminder": "Observed bank mandate or exact detected pattern evidence",
        "search_bank_knowledge": "PUBLIC/effective document filter; citation is explanatory only",
        "resolve_recipient": "Owned recipient catalog; ambiguity retained",
        "list_transactions": "Observed account/card filter; bounded cursor",
        "summarize_spending": "Observed account/card and merchant; bounded bank transactions",
        "detect_transaction_anomalies": "Observed account/card; bounded bank transactions",
    }
    if name in explicit:
        return explicit[name]
    if name.startswith("get_") or name.startswith("compare_"):
        return "Previously observed canonical object; Spring ownership for customer objects"
    if name.startswith("prepare_"):
        return "Observed canonical object and exact user-authorized terms"
    if name.startswith("calculate_") or name.startswith("detect_"):
        return "Bounded bank data and deterministic computation"
    return "Authenticated customer session; Spring owner scope where applicable"


def object_scope(name: str) -> str:
    if "knowledge" in name:
        return "PUBLIC document/version"
    if "product" in name and not name.startswith("prepare_investment"):
        return "Public catalog/product"
    for token, label in (("card", "Owned card/application"), ("account", "Owned account"),
                         ("transaction", "Owned transaction"), ("spending", "Owned transaction"),
                         ("recipient", "Owned saved recipient"), ("recurring", "Owned mandate"),
                         ("reminder", "Owned reminder"), ("schedule", "Owned schedule"),
                         ("split", "Owned bill/request"), ("holding", "Owned holding"),
                         ("investment", "Owned investment"), ("transfer", "Owned transfer/intent")):
        if token in name:
            return label
    return "Authenticated customer or public catalog"


def exposure(name: str) -> str:
    if name == "search_bank_knowledge":
        return "<=10 PUBLIC chunks, <=1200 chars/chunk (MCP cap)"
    if name == "list_transactions":
        return "Bounded masked transaction pages; untrusted note/title"
    if name in {"list_accounts", "get_account"}:
        return "Masked account + balance"
    if "card" in name:
        return "Masked card + owner-visible control/limits"
    if name.startswith("prepare_"):
        return "Reviewable intent snapshot; no credential/cookie to model"
    return "Tool output schema only; no session or credential"


def main() -> None:
    registry = ToolRegistry(BankingGateway())
    rows = registry.visible()
    assert len(rows) == 50, f"Registry changed to {len(rows)} tools; re-audit the matrix"
    assert not any(row["name"].startswith("execute_") for row in rows)
    lines = ["# Agent v2 tool capability matrix", "",
             "Generated from the live `ToolRegistry.visible()` definitions by `scripts/s1-export-tool-matrix.py`.",
             "The registry currently exposes **50 tools**: READ, ANALYZE or PREPARE only. Execution methods exist behind the trusted confirmation runtime and are not model-visible. Three read-only names can be routed through the optional in-process MCP pilot when enabled; all others use fixed BankingGateway/knowledge methods.", "",
             "`Required evidence` describes runtime preconditions plus Spring's final object-level check; it is not a grant from the LLM. All customer-scoped tools derive the customer from the verified Spring session, never a model-provided customer ID. `PREPARE` creates an ActionIntent but never performs the business action. Human confirmation and, where required, step-up authorization are separate.", "",
             "| Tool | Provider | Capability / risk | Customer scope | Object scope | Class | Required evidence | Authorization | Maximum data exposure |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in rows:
        name = row["name"]
        provider = ("MCP pilot: " + PROVIDERS[name] + " (optional)") if name in PILOT_TOOLS else (
            "Knowledge Service" if name == "search_bank_knowledge" else "BankingGateway / Spring")
        customer = "PUBLIC" if name == "search_bank_knowledge" or ("product" in name and name.startswith(("list_", "get_", "compare_"))) else "Spring session owner"
        klass = row["category"]
        authorization = ("User confirm + Spring step-up/policy (operation-specific)" if klass == "PREPARE"
                         else "Active Spring session + object authorization")
        lines.append("| " + " | ".join([
            f"`{name}`", provider, f"{', '.join(row['required_capabilities']) or 'public'} / {row['risk_class']}",
            customer, object_scope(name), klass, evidence(name), authorization, exposure(name)]) + " |")
    lines += ["", "## Registry/schema source", "",
              "Input schemas are Pydantic `model_json_schema()` for each definition; output schemas are the named fields in `OUTPUT_FIELDS`. Both are included in the actual planner-visible registry. See [tools.py](../../services/agent-runtime/app/agent_v2/tools.py). This matrix does not replace Spring authorization tests or an audit of each output field's value-level minimization.", "",
              "## Explicitly absent", "",
              "No `execute_transfer`, `execute_payment`, raw REST, arbitrary URL, SQL or admin tool is present in the 50 model-visible definitions. The runtime's trusted execution path is [runtime.py](../../services/agent-runtime/app/agent_v2/runtime.py).", ""]
    out = ROOT / "docs" / "security" / "tool-capability-matrix.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} ({len(rows)} tools)")


if __name__ == "__main__":
    main()
