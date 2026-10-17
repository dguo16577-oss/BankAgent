"""Deterministic family normalization, with reviewable semantic rules in audit_config.
Source tasks can evidence multiple primitives. Counts use unique source IDs, not links.
No evaluation or Agent execution happens here.
"""
from collections import Counter, defaultdict
import hashlib
import json
import re
from pathlib import Path
import yaml
from audit_config import CAPABILITIES, MISSING, FAMILY_ROWS, TAU_FAMILIES, TOOL_FAMILIES, COMPOSED, DOMAINS
from inspect_sources import extract, write_json, write_jsonl
from fetch_sources import ROOT, CACHE, VERSION

PROJECT = ROOT.parents[1]

B77 = {
 "card_arrival":"CARD_DELIVERY", "card_delivery_estimate":"CARD_DELIVERY", "card_linking":"CARD_ACTIVATION", "exchange_rate":"POLICY_RETRIEVAL", "card_payment_wrong_exchange_rate":"TRANSACTION_DISPUTE", "extra_charge_on_statement":"TRANSACTION_DISPUTE", "pending_cash_withdrawal":"PAYMENT_STATUS", "fiat_currency_support":"POLICY_RETRIEVAL", "automatic_top_up":"RECURRING_CREATE", "card_not_working":"CARD_DETAILS", "exchange_via_app":"FX_EXCHANGE", "lost_or_stolen_card":"CARD_LOST_BLOCK", "age_limit":"POLICY_RETRIEVAL", "pin_blocked":"CARD_PIN_SERVICE", "contactless_not_working":"CARD_CONTROLS", "top_up_by_bank_transfer_charge":"PAYMENT_STATUS", "pending_top_up":"PAYMENT_STATUS", "cancel_transfer":"TRANSFER_CANCELLATION", "top_up_limits":"POLICY_RETRIEVAL", "wrong_amount_of_cash_received":"TRANSACTION_DISPUTE", "card_payment_fee_charged":"TRANSACTION_DISPUTE", "transfer_not_received_by_recipient":"PAYMENT_STATUS", "supported_cards_and_currencies":"POLICY_RETRIEVAL", "getting_virtual_card":"CARD_APPLICATION", "card_acceptance":"POLICY_RETRIEVAL", "top_up_reverted":"PAYMENT_STATUS", "balance_not_updated_after_cheque_or_cash_deposit":"ACCOUNT_BALANCE", "card_payment_not_recognised":"UNRECOGNIZED_CHARGE", "edit_personal_details":"PROFILE_CHANGE", "why_verify_identity":"POLICY_RETRIEVAL", "unable_to_verify_identity":"SERVICE_ESCALATION", "get_physical_card":"CARD_APPLICATION", "visa_or_mastercard":"CARD_APPLICATION", "topping_up_by_card":"NEW_RECIPIENT_TRANSFER", "disposable_card_limits":"CARD_LIMIT_CHANGE", "compromised_card":"CARD_LOST_BLOCK", "atm_support":"POLICY_RETRIEVAL", "direct_debit_payment_not_recognised":"UNRECOGNIZED_CHARGE", "passcode_forgotten":"SECURITY_PRIVACY", "declined_cash_withdrawal":"PAYMENT_STATUS", "pending_card_payment":"PAYMENT_STATUS", "lost_or_stolen_phone":"SECURITY_PRIVACY", "request_refund":"REFUND_TRACKING", "declined_transfer":"PAYMENT_STATUS", "Refund_not_showing_up":"REFUND_TRACKING", "declined_card_payment":"CARD_DETAILS", "pending_transfer":"PAYMENT_STATUS", "terminate_account":"ACCOUNT_OPEN_CLOSE", "card_swallowed":"CARD_REPLACEMENT", "transaction_charged_twice":"DUPLICATE_CHARGE", "verify_source_of_funds":"POLICY_RETRIEVAL", "transfer_timing":"PAYMENT_STATUS", "reverted_card_payment?":"PAYMENT_STATUS", "change_pin":"CARD_PIN_SERVICE", "beneficiary_not_allowed":"RECIPIENT_TRANSFER", "transfer_fee_charged":"PAYMENT_STATUS", "receiving_money":"PAYMENT_STATUS", "failed_transfer":"PAYMENT_STATUS", "transfer_into_account":"OWN_ACCOUNT_MOVEMENT", "verify_top_up":"POLICY_RETRIEVAL", "getting_spare_card":"CARD_REPLACEMENT", "top_up_by_cash_or_cheque":"CHEQUE_SERVICE", "order_physical_card":"CARD_APPLICATION", "virtual_card_not_working":"CARD_DETAILS", "wrong_exchange_rate_for_cash_withdrawal":"TRANSACTION_DISPUTE", "get_disposable_virtual_card":"CARD_APPLICATION", "top_up_failed":"PAYMENT_STATUS", "balance_not_updated_after_bank_transfer":"ACCOUNT_BALANCE", "cash_withdrawal_not_recognised":"UNRECOGNIZED_CHARGE", "exchange_charge":"POLICY_RETRIEVAL", "top_up_by_card_charge":"PAYMENT_STATUS", "activate_my_card":"CARD_ACTIVATION", "cash_withdrawal_charge":"POLICY_RETRIEVAL", "card_about_to_expire":"CARD_REPLACEMENT", "apple_pay_or_google_pay":"CARD_ACTIVATION", "verify_my_identity":"POLICY_RETRIEVAL", "country_support":"POLICY_RETRIEVAL"
}
# These language-only labels have no honest equivalence to available transfer/activation semantics.
B77.update(topping_up_by_card="POLICY_RETRIEVAL", transfer_into_account="PAYMENT_STATUS", card_linking="POLICY_RETRIEVAL", apple_pay_or_google_pay="POLICY_RETRIEVAL")
DOJO = {0:"BILL_TO_TRANSFER",1:"SPENDING_REPORT",2:"SCHEDULE_CHANGE",3:"TRANSACTION_TO_TRANSFER",4:"TRANSACTION_TO_TRANSFER",5:"TRANSACTION_TO_TRANSFER",6:"RECURRING_CREATE",7:"TRANSACTION_SEARCH",8:"SPENDING_REPORT",9:"SCHEDULE_CHANGE",10:"TRANSACTION_TO_TRANSFER",11:"TRANSACTION_TO_TRANSFER",12:"SCHEDULE_CHANGE",13:"PROFILE_CHANGE",14:"SECURITY_PRIVACY",15:"RELOCATION_PAYMENTS"}
KNOWLEDGE_TOOLS = [
 ("file_.*transaction_dispute|get_.*dispute", "TRANSACTION_DISPUTE"),
 ("^freeze_debit_card_", "CARD_FREEZE"), ("unfreeze_debit_card", "CARD_UNFREEZE"),
 ("order_replacement|order_debit_card|get_pending_replacement", "CARD_REPLACEMENT"),
 ("close_debit_card|close_credit_card", "CARD_CLOSURE"),
 ("apply_for_credit_card", "CARD_APPLICATION"),
 ("limit_increase", "CARD_LIMIT_CHANGE"), ("activate_debit", "CARD_ACTIVATION"),
 ("reset_debit_card_pin|change_debit_card_pin", "CARD_PIN_SERVICE"),
 ("set_debit_card_recurring_block", "RECURRING_STOP"),
 ("transfer_funds_between", "OWN_ACCOUNT_MOVEMENT"),
 ("open_bank_account|close_bank_account", "ACCOUNT_OPEN_CLOSE"),
 ("submit_cash_back|rewards|statement_credit|closure_reason|apply_credit_card_account_flag", "CARD_REWARDS_SERVICE"),
 ("get_bank_account_transactions|get_credit_card_transactions", "TRANSACTION_SEARCH"),
 ("get_all_user_accounts", "ACCOUNT_BALANCE"),
 ("get_debit_cards|get_credit_card_accounts", "CARD_DETAILS"),
 ("referral", "REFERRAL_PROGRAM"), ("deposit_check", "CHEQUE_SERVICE"),
 ("human_agent|interest_discrepancy|apply_savings_account_credit|apply_checking_account_credit|clear_debit_card_fraud_alert", "SERVICE_ESCALATION"),
 ("change_user_email", "PROFILE_CHANGE"),
 ("pay_credit_card_from_checking", "CREDIT_CARD_REPAYMENT"),
 ("submit_transaction", "RECIPIENT_TRANSFER"),
]

def capabilities():
    ops = {}
    for name in ("customer", "public"):
        spec = yaml.safe_load((PROJECT / f"contracts/openapi/{name}.yaml").read_text(encoding="utf-8"))
        for path, methods in spec["paths"].items():
            for method, item in methods.items():
                if isinstance(item,dict) and "operationId" in item:
                    ops[item["operationId"]] = {"method":method.upper(), "path":path, "contract":f"contracts/openapi/{name}.yaml"}
    status = json.loads((PROJECT / "docs/backend/implementation-status.json").read_text(encoding="utf-8"))
    result = []
    services = {"PAYMENTS":"payment", "SPENDING_AND_TRANSACTIONS":"transaction", "WEALTH":"wealth", "CARDS":"card", "RECURRING_AND_DIRECT_DEBIT":"recurring"}
    for cid,(domain, names, ui, auth, changes, note) in CAPABILITIES.items():
        ids = names.split(); assert all(n in ops and status[n]=="IMPLEMENTED_POSTGRESQL" for n in ids), cid
        area = services.get(domain,"security")
        if cid in ("CARD_APPLICATION","LOAN_APPLICATION"): area="applicationrequest"
        if cid=="SPENDING":area="spending"
        if cid=="ACCOUNT_READ":area="account"
        if cid=="PUBLIC_KNOWLEDGE":area="publiccontent"
        if cid=="OVERVIEW":area="overview"
        backend = [str(p.relative_to(PROJECT)).replace('\\','/') for p in (PROJECT/"services/banking-core/src/main/java").rglob("*.java") if f"/{area}/" in p.as_posix() and (p.name.endswith("Service.java") or p.name.endswith("Controller.java"))]
        feature = {"applicationrequest":"applications","payment":"payments","card":"cards","recurring":"spending","transaction":"transactions","account":"accounts","publiccontent":"public","overview":"overview"}.get(area, area)
        frontend=[p.relative_to(PROJECT).as_posix() for p in (PROJECT/f"apps/web/src/features/{feature}").glob("*.tsx") if not p.name.endswith("test.tsx")]
        result.append(dict(capability_id=cid, domain=domain, read_or_mutation="READ" if changes=="none" else "MUTATE", backend_api=[dict(operation_id=n,**ops[n]) for n in ids], manual_ui_path=ui, authorization=auth, authentication="ANONYMOUS" if cid=="PUBLIC_KNOWLEDGE" else "SESSION; mutations require CSRF", persistent_state_changed=changes, current_status="SUPPORTED", limitations=note, evidence=backend+frontend+["docs/backend/implementation-matrix.md"]))
    for cid,(domain,rec,cost,note) in MISSING.items():
        result.append(dict(capability_id=cid,domain=domain,read_or_mutation="READ" if cid in ("PATTERN_DETECT","ANOMALY_DETECT","MARKET_RESEARCH","KNOWLEDGE_AGENT") else "MUTATE",backend_api=[],manual_ui_path=None,authorization="STRONGER_AUTH_UNKNOWN" if cid not in ("MARKET_RESEARCH","KNOWLEDGE_AGENT","SECURITY_EVAL") else "NONE",persistent_state_changed="not implemented",current_status="OUT_OF_SCOPE" if rec=="OUT_OF_SCOPE" else "MISSING",recommendation=rec,implementation_cost=cost,limitations=note,evidence=["contracts/openapi/customer.yaml","contracts/openapi/public.yaml","docs/backend/implementation-matrix.md"]))
    write_json(ROOT/"aster-capabilities.json", {"retrieval_date":"2026-09-29","script_version":VERSION,"operation_count":len(ops),"basis":"Current working tree, includes post-M24 applications and inline product workflows; static implementation audit, not fresh runtime certification", "capabilities":result})
    return {c["capability_id"]:c for c in result}

def classify(row):
    sid, raw = row["dataset"], row["raw"]
    if sid=="tau_indian": return [TAU_FAMILIES[row["source_family"]]]
    if sid=="banking77":return [B77[row["source_family"]]]
    if sid=="fintoolbench":return ["FINANCIAL_MARKET_RESEARCH"]
    if sid=="agentdojo":
        if row["axis"]=="injection":return ["SECURITY_INJECTION"]
        return [DOJO[int(row["source_task_id"].replace("UserTask",""))]]
    if sid=="indic":
        axis=row["axis"]
        if axis=="10_unseen_tools":return ["UNSUPPORTED_TOOL_REFUSAL"]
        if axis in ("capability_credentials_jailbreak","capability_social_engineering","capability_third_party","capability_harmful_illegal"):return ["SECURITY_PRIVACY"]
        if axis.startswith("capability_"):return ["POLICY_RETRIEVAL"]
        tools=row["tools"]
        if "get_transaction_history" in tools and "block_card" in tools and "raise_request" in tools:return ["FRAUD_PROTECTION_DISPUTE"]
        if "get_transaction_history" in tools and "raise_request" in tools:return ["TRANSACTION_DISPUTE"]
        if "block_card" in tools and "raise_request" in tools:return ["CARD_REPLACEMENT"]
        # Last gold outcome, not a distractor in tools_exposed. Fall back only to the explicit target tool.
        families=[TOOL_FAMILIES[t] for t in tools if t in TOOL_FAMILIES]
        reads={"ACCOUNT_BALANCE","TRANSACTION_SEARCH","CARD_DETAILS","RECURRING_QUERY","WEALTH_DISCOVERY","POLICY_RETRIEVAL"}
        writes=[f for f in families if f not in reads]
        return [(writes or families or ["POLICY_RETRIEVAL"])[-1]]
    if sid=="tau_knowledge":
        families=[]
        for tool in row["tools"]:
            for pattern,f in KNOWLEDGE_TOOLS:
                if re.search(pattern,tool):
                    families.append(f);break
        # Keep policy layer separate. Multi-action tasks can evidence several business families.
        return list(dict.fromkeys(families+["POLICY_RETRIEVAL"]))
    raise ValueError(sid)

def evidence_label(row):
    if row["axis"]=="injection" or row["axis"] in ("capability_credentials_jailbreak","capability_social_engineering","capability_third_party","capability_harmful_illegal"):
        return "SECURITY_ADVERSARIAL"
    if row["axis"] in ("edge","2_bad_tool_response","3_confusing_intent","4_not_enough_info","5_contradicting_info","6_context_switching","7_wrong_info","8_long_context","9_irrelevant_rag","10_unseen_tools","11_out_of_scope_refuse"):
        return "ROBUSTNESS"
    return "NORMAL_BEHAVIOR"

def main():
    rows, inventory = extract(); caps=capabilities()
    manifest=json.loads((ROOT/"sources.yaml").read_text(encoding="utf-8"))
    sources={s["id"]:s for s in manifest["sources"]}
    groups=defaultdict(list)
    for row in rows:
        for family in classify(row):groups[family].append(row)
    families=[];variants=[];mapping=[]
    for line in FAMILY_ROWS.strip().splitlines():
        fid,domain,adapt,captext,description=line.split("|")
        members=groups[fid]
        if not members and fid not in COMPOSED:
            # Explicit gap hypothesis; not silently counted as public-source reuse.
            origin="ASTER_GAP_HYPOTHESIS"
        else:origin="ASTER_COMPOSED" if fid in COMPOSED else "SOURCE_SUPPORTED"
        required=captext.split(); missing=[c for c in required if caps[c]["current_status"]!="SUPPORTED"]
        isknowledge=fid=="POLICY_RETRIEVAL"
        security=fid.startswith("SECURITY_")
        eval_only=security or fid=="UNSUPPORTED_TOOL_REFUSAL"
        supported=len(required)-len(missing)
        support="SUPPORTED" if not missing else "PARTIALLY_SUPPORTED" if supported else "MISSING"
        if adapt=="NOT_APPLICABLE" or eval_only or isknowledge:support="OUT_OF_SCOPE"
        # No dedicated screen for a composite; all ordinary banking primitives must be manual.
        manual="NO" if eval_only or isknowledge else "PRIMITIVES_ONLY" if domain=="CROSS_DOMAIN" else "YES"
        source_entries=[]; examples=[]
        for sid in sorted({r["dataset"] for r in members}):
            subset=[r for r in members if r["dataset"]==sid]
            for sf in sorted({r["source_family"] for r in subset}):
                rs=[r for r in subset if r["source_family"]==sf]
                source_entries.append(dict(dataset=sid,source_family=sf,source_task_ids=sorted({r["source_task_id"] for r in rs})))
            sample=subset[0]; artifact_sid={"indic":"indic_data","tau_indian":"tau_indian_data"}.get(sid,sid)
            artifact=sources[artifact_sid]
            url=next(f["url"] for f in artifact["files"] if f["path"]==sample["path"])
            examples.append(dict(dataset=sid,task_id=sample["source_task_id"],paraphrase=description,paraphrase_scope="family-level summary, not a verbatim task or full workflow",path=sample["path"],provenance=url,source_tools=sample["tools"][:20]))
        spec_references={
            "SCHEDULED_TRANSFER":("payment-initiation-openapi.yaml","/domestic-scheduled-payments"),
            "RECURRING_CREATE":("payment-initiation-openapi.yaml","/domestic-standing-orders"),
            "RECURRING_QUERY":("account-info-openapi.yaml","/accounts/{AccountId}/direct-debits"),
            "RECURRING_STOP":("vrp-openapi.yaml","/domestic-vrp-consents/{ConsentId}"),
        }
        if fid in spec_references:
            filename,path=spec_references[fid]
            spec=yaml.safe_load((CACHE/"openbanking/files/dist/openapi"/filename).read_text(encoding="utf-8"))
            assert path in spec["paths"]
            source_entries.append(dict(dataset="openbanking",source_family=path,source_task_ids=[],specification_only=True))
            examples.append(dict(dataset="openbanking",task_id=None,paraphrase=description,paraphrase_scope="Specification-derived, no source task exists",path="dist/openapi/"+filename,provenance=next(f["url"] for f in sources["openbanking"]["files"] if f["path"]=="dist/openapi/"+filename),source_tools=[path]))
            if not members:origin="SPECIFICATION_DERIVED"
        mutation=any(caps[c]["read_or_mutation"]=="MUTATE" for c in required)
        auth="STEP_UP" if any(caps[c]["authorization"]=="STEP_UP" for c in required) else "CONFIRMATION" if mutation and not security else "NONE"
        labels=sorted({evidence_label(r) for r in members}) or ["NORMAL_BEHAVIOR"]
        reasoning=["MULTI_TOOL_PLAN"] if len(required)>1 else ["TOOL_SELECTION"]
        if isknowledge or any(r["dataset"]=="tau_knowledge" for r in members):reasoning += ["KNOWLEDGE_RETRIEVAL","POLICY_REASONING"]
        if mutation:reasoning += ["STATE_REASONING"]
        observed_axes=sorted({r["axis"] for r in members})
        failure=[]
        if "2_bad_tool_response" in observed_axes:failure.append("TOOL_FAILURE")
        if "7_wrong_info" in observed_axes:failure.append("INVALID_INPUT")
        if "edge" in observed_axes:failure+= ["INELIGIBLE"]
        if any(r["source_family"]=="edgainsuff" for r in members):failure.append("INSUFFICIENT_FUNDS")
        if "11_out_of_scope_refuse" in observed_axes:failure+= ["OUT_OF_SCOPE"]
        secondary=sorted({caps[c]["domain"] for c in required if caps[c]["domain"] not in (domain,"CROSS_DOMAIN")})
        family=dict(family_id=fid,sources=source_entries,title=fid.replace("_"," ").title(),description=description,primary_domain=domain,secondary_domains=secondary,operation_type="MIXED" if mutation and len(required)>1 else "MUTATE" if mutation else "READ",interaction_type="MULTI_TURN" if any(r["dataset"] in ("indic","tau_indian","tau_knowledge") for r in members) else "MULTI_TOOL" if len(required)>1 else "SINGLE_STEP",statefulness="STATE_MUTATION" if mutation else "STATELESS" if isknowledge or security else "STATE_READ",required_capabilities=required,clarification="AMBIGUITY_RESOLUTION" if "3_confusing_intent" in observed_axes else "REQUIRED" if "4_not_enough_info" in observed_axes else "NONE",failure_modes=failure or ["NONE"],authorization=auth,risk="SECURITY_ADVERSARIAL" if security else "ELEVATED" if auth=="STEP_UP" else "NORMAL",agent_reasoning=reasoning,evaluation_types=["SECURITY_GATE"] if security else ["MIXED"] if isknowledge else ["FINAL_STATE_PLUS_RESPONSE"] if mutation else ["TOOL_CALL","RESPONSE_ONLY"],evaluation_annotation_basis="Proposed Aster evaluation; per-source grader semantics in source audit",regional_specificity="NPCI: INR/IFSC/UPI/FD/RD/KYC policy requires review; AgentDojo: IBAN/date semantics; tau knowledge: fictional US bank and procedural discovery; no mechanical currency substitution.",aster_adaptability=adapt,current_aster_support=support,manual_ui_requirement=manual,manual_ui_required=manual,manual_ui_coverage="ALL_PRIMITIVES" if support=="SUPPORTED" else "NOT_REQUIRED" if manual=="NO" else "PARTIAL" if supported else "NONE",origin=origin,suite_labels=labels,knowledge_layer="KNOWLEDGE_LAYER_CANDIDATE" if isknowledge else None,coverage_value="LOW" if adapt=="NOT_APPLICABLE" else "HIGH" if mutation or domain=="CROSS_DOMAIN" else "MEDIUM",agent_value="HIGH" if len(required)>1 or security or isknowledge else "MEDIUM",manual_product_value="LOW" if manual=="NO" or adapt=="NOT_APPLICABLE" else "HIGH" if mutation else "MEDIUM",implementation_cost="HIGH" if any(MISSING.get(c,(None,None,"LOW"))[2]=="HIGH" for c in missing) else "MEDIUM" if missing else "LOW",redundancy="HIGH" if len(source_entries)>3 else "MEDIUM" if len(source_entries)>1 else "LOW",examples=examples[:3],notes="Family merge is by outcome, not amount/name. Source workflows may require additional primitives; useful differences preserved as variants. Banking77 links are taxonomy/language only, never executable coverage.")
        families.append(family)
        if eval_only:
            family.update(operation_type="READ",statefulness="STATELESS",authorization="NONE",evaluation_types=["SECURITY_GATE"] if security else ["TOOL_CALL","RESPONSE_ONLY"])
        if domain=="CROSS_DOMAIN" and len(secondary)<2 and not eval_only and not isknowledge:
            family["cross_domain_kind"]="SUPPORTING_PLATFORM_OR_SERVICE; not counted as multi-business-domain orchestration"
        elif domain=="CROSS_DOMAIN":
            family["cross_domain_kind"]="EVALUATION_OR_KNOWLEDGE" if eval_only or isknowledge else "MULTI_BUSINESS_DOMAIN"
        family["source_reuse_kind"]="LANGUAGE_TAXONOMY_ONLY" if members and all(r["kind"]=="LANGUAGE_DATA" for r in members) else origin
        mapping.append(dict(family_id=fid,external_behaviors=[{"dataset":s["dataset"],"source_family":s["source_family"]} for s in source_entries],required_capability_primitives=required,aster_capabilities=[caps[c] for c in required],manual_ui_required=manual,status=support,missing_primitives=missing,origin=origin))
        variant_groups=defaultdict(list)
        for r in members:variant_groups[(r["dataset"],r["source_family"],r["axis"])].append(r)
        for (sid,sf,axis),rs in sorted(variant_groups.items()):
            if sid=="banking77": continue # language variation is not a benchmark behavior case
            variants.append(dict(variant_id=fid+"_"+hashlib.sha256(f"{sid}:{sf}:{axis}".encode()).hexdigest()[:10],family_id=fid,provenance="SOURCE_OBSERVED",dataset=sid,source_family=sf,source_task_ids=sorted({r["source_task_id"] for r in rs}),source_axis=axis,behavior_label=evidence_label(rs[0]),kind="KNOWLEDGE_POLICY" if sid=="tau_knowledge" else "BEHAVIOR",adaptation_required=adapt,notes="Grouping is an audit variant cluster, not a runnable authored test."))
        if origin in ("ASTER_COMPOSED","ASTER_GAP_HYPOTHESIS"):
            variants.append(dict(variant_id=fid+"_proposed",family_id=fid,provenance=origin,source_task_ids=[],behavior_label="NORMAL_BEHAVIOR",kind="PROPOSED_WORKFLOW",notes="Aster-authored proposal. Do not count as public task reuse."))
    candidates=[f for f in families if f["coverage_value"] in ("HIGH","MEDIUM") and (f["aster_adaptability"] in ("DIRECT","ADAPTABLE") or f["origin"]=="ASTER_COMPOSED")]
    candidate_ids={f["family_id"] for f in candidates}
    # Distinct Aster invariants, not claimed to be existing public benchmark cases.
    local_variants=[
      ("RECIPIENT_TRANSFER","insufficient_available","INSUFFICIENT_FUNDS","Account balance is sufficient but pending holds make available balance insufficient","No debit, receipt or transaction"),
      ("RECIPIENT_TRANSFER","same_key_retry","NONE","Response lost after successful execution; same intent/hash/key retried","Same receipt and one debit only"),
      ("RECIPIENT_TRANSFER","changed_key_payload","CONFLICT","Reuse idempotency key for a different intent","Reject key reuse, no second write"),
      ("RECIPIENT_TRANSFER","missing_csrf","INVALID_INPUT","Authenticated cookie but no CSRF token","HTTP security rejection before mutation"),
      ("RECIPIENT_TRANSFER","expired_intent","STALE_STATE","Confirmation after intent lifetime boundary","Reject and require a fresh review"),
      ("CARD_CONTROLS","protective_off","NONE","Only ON to OFF changes","Confirmation only, no fabricated AAL2 requirement"),
      ("CARD_CONTROLS","risk_increasing_on","NONE","Any OFF to ON change","Require bound step-up before execution"),
      ("CARD_UNFREEZE","wrong_session","CONFLICT","Authorization from another session of the same customer","No card change or grant consumption"),
      ("CARD_UNFREEZE","wrong_hash","CONFLICT","Authorization does not match the reviewed intent hash","Reject exact-binding mismatch"),
      ("CARD_UNFREEZE","expired_grant","STALE_STATE","Grant has reached expiry","Reject without globally elevating session"),
      ("CARD_FREEZE","stale_review","STALE_STATE","Card version changes between prepare and execute","Reject stale terms; do not overwrite concurrent state"),
      ("RECURRING_STOP","detected_only","INELIGIBLE","Inferred record has NONE management capability","No stop; explain bank-side provenance limitation"),
      ("RECURRING_STOP","bank_vs_merchant","NONE","Bank-managed subscription stopped with confirmation","Future bank state changes; past spending and merchant service contract do not"),
      ("ACCOUNT_TO_INVESTMENT","unsuitable","INELIGIBLE","Product risk exceeds stored customer suitability","No order or cash debit"),
      ("ACCOUNT_TO_INVESTMENT","stale_balance","STALE_STATE","Available balance changes after investment review","Fresh review required; no partial position update"),
      ("ACCOUNT_TO_INVESTMENT","spending_separation","NONE","Valid purchase completes","Debit and position reconcile; investment principal excluded from spending"),
    ]
    for fid,name,failure,pre,post in local_variants:
        variants.append(dict(variant_id=fid+"_aster_"+name,family_id=fid,provenance="ASTER_PROPOSED",source_task_ids=[],behavior_label="ROBUSTNESS" if failure!="NONE" or name=="same_key_retry" else "NORMAL_BEHAVIOR",kind="PROPOSED_INVARIANT",failure_mode=failure,initial_requirements=pre,expected_assertion=post,notes="Derived from inspected Aster implementation; not reused public task and not yet an executable fixture."))
    write_jsonl(ROOT/"normalized/behavior-families.jsonl",families)
    write_jsonl(ROOT/"normalized/source-to-aster-mapping.jsonl",mapping)
    write_jsonl(ROOT/"normalized/candidate-families.jsonl",candidates)
    write_jsonl(ROOT/"normalized/candidate-variants.jsonl",[v for v in variants if v["family_id"] in candidate_ids])
    write_jsonl(ROOT/"reports/all-variant-clusters.jsonl",variants)
    write_json(ROOT/"reports/normalization-decisions.json", {"script_version":VERSION,"rules":"audit_config.py and normalize_sources.py", "unmapped_non_refusal_tool_targets":sorted({t for r in rows if r["dataset"]=="indic" and r["axis"]!="10_unseen_tools" and not r["axis"].startswith("capability_") for t in r["tools"] if t not in TOOL_FAMILIES}),"rule_limitations":["Multi-tool Indic tasks assigned by final significant gold outcome; source IDs retained for finer later review.","Knowledge tasks may map to several families, so domain source-task membership totals overlap.","No language utterance counted as executable scenario; no generated scores.","Source-derived family grading and Aster proposal grading are different fields."]})
    print("families",len(families),"candidates",len(candidates),"variant clusters",sum(v["family_id"] in candidate_ids for v in variants))

if __name__=="__main__":main()
