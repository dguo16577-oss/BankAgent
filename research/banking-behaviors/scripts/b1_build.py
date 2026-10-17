"""B1 design evidence and coverage projections; never modifies B0 or product inputs."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from inspect_sources import extract
from fetch_sources import CACHE

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]

def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

def lines(path):
    return [json.loads(s) for s in (ROOT / path).read_text(encoding="utf-8").splitlines() if s]

def write(path, obj):
    (ROOT / path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def proposal(id, area, classification, b0, batch, scope, ui, parity, api, persistence, auth,
             depends=(), cost="MEDIUM", value="HIGH", states="READ_ONLY"):
    return dict(capability_id=id, area=area, recommendation=classification, b0_capabilities=b0.split(),
                implementation_batch=batch, accepted=classification in ("FOUNDATIONAL", "CORE"),
                proposed_scope=scope, manual_ui=ui, parity=parity, api_impact=api,
                database_impact=persistence, authorization=auth, depends_on=list(depends),
                implementation_cost=cost, agent_value=value, state_machine=states,
                design_only=True)

PROPOSALS = [
    proposal("RECIPIENT_RESOLVE", "RECIPIENT", "FOUNDATIONAL", "RECIPIENT_READ", "B1A",
             "Reuse owned list/name/bank search; selection by opaque ID; ambiguity requires explicit user choice. No phone directory.",
             "Payments > recipient selector", "MANUAL_EXACT", "Reuse GET /customer/recipients; future detail GET candidate", "Existing recipients; future owner/version/state fields",
             "AAL1; ALLOW reads; no action authorization", states="READ_ONLY"),
    proposal("RECIPIENT_CREATE", "RECIPIENT", "FOUNDATIONAL", "RECIPIENT_CREATE", "B1A",
             "Create an owned recipient referencing an opaque synthetic demo destination; active UNVERIFIED record; unique destination per owner.",
             "Payments > Add recipient; return to transfer form", "MANUAL_EXACT", "New recipient-action-intents prepare/GET then POST /customer/recipients executes CREATE; extend reads; no frozen contract change in B1", "Owner + opaque destination ref + createdAt + version + status; unique owner/destination",
             "AAL1+CSRF; CONFIRMATION; idempotency; no step-up at address-book creation; payment authorization remains separate",
             ("RECIPIENT_RESOLVE",), states="ABSENT -> ACTIVE; duplicate -> existing record/conflict, never a second destination"),
    proposal("RECIPIENT_DISABLE", "RECIPIENT", "CORE", "RECIPIENT_CREATE", "B1A",
             "Deactivate an address-book destination with explicit notice that due schedules will fail; do not delete history or edit routing identity.",
             "Payments > recipient detail", "MANUAL_EXACT", "New recipient action intent/execute design candidates", "Recipient ACTIVE/INACTIVE + version; immutable historical snapshots",
             "AAL1+CSRF; CONFIRMATION; intent + idempotency; no AAL2 for protective disable",
             ("RECIPIENT_CREATE",), states="ACTIVE -> INACTIVE terminal for first slice; no delete/reactivate"),
    proposal("RISK_POLICY", "RISK", "FOUNDATIONAL", "PAYMENT_RISK", "B1A",
             "Deterministic authorization decision with policy version and reason codes; preserve current card/recurring/wealth rules; no fraud scoring.",
             "Inside each action review/step-up workflow", "PRIMITIVES_ONLY", "No public risk endpoint; candidate extension to prepared intents", "Persist decision snapshot on intent/receipt and minimized SecurityEvent; no risk_decisions table",
             "ALLOW/CONFIRMATION/STEP_UP_AUTH/DENY; AAL2 never overrides invalid business state",
             cost="HIGH", states="Immutable decision snapshot; changes require new intent"),
    proposal("PAYMENT_AUTHORIZATION", "RISK", "FOUNDATIONAL", "PAYMENT_RISK", "B1A",
             "Payment-specific resource/hash/session-bound authorization; extend existing challenge/consume ports, never accept CARD_ACTION_INTENT for transfers.",
             "Transfer review > confirmation > step-up when required", "MANUAL_EXACT", "Extend existing transfer intent/execute and challenge resource enum in a later contract revision", "Existing challenges/authorizations/events; transfer policy/recipient-version snapshot",
             "AAL1+CSRF; amount/newness policy; single-use authorization consumed atomically with debit and receipt",
             ("RISK_POLICY", "RECIPIENT_CREATE"), cost="HIGH", states="Existing PREPARED/EXPIRED/EXECUTED and ACTIVE/CONSUMED/EXPIRED/REVOKED"),
    proposal("SCHEDULE_CREATE", "SCHEDULE", "CORE", "SCHEDULE_CREATE", "B1B",
             "One-time future CNY transfer; explicit date/time in Asia/Shanghai; no reserve, no merchant subscription or standing-order series.",
             "Payments > Schedule transfer > review", "MANUAL_EXACT", "New schedule-intents, schedule-actions, schedules list/detail candidates", "scheduled_payments with immutable approved terms, policy version, recipient version and dueAt",
             "AAL1+CSRF; CONFIRMATION or STEP_UP_AUTH by payment policy; intent and idempotency",
             ("RECIPIENT_CREATE", "PAYMENT_AUTHORIZATION"), cost="HIGH", states="ABSENT -> SCHEDULED -> EXECUTED | FAILED | CANCELLED"),
    proposal("SCHEDULE_EDIT", "SCHEDULE", "CORE", "SCHEDULE_EDIT", "B1B",
             "Before due: replace amount/date/recipient via new reviewed intent; cancel is protective; first slice one-time only.",
             "Payments > schedule detail > Edit/Cancel", "MANUAL_EXACT", "New schedule action intent/execute candidates", "Schedule version, amendment/cancel receipts; execution terms locked per version",
             "Edit: payment policy; cancel: CONFIRMATION; AAL1+CSRF; intent + idempotency",
             ("SCHEDULE_CREATE",), states="SCHEDULED vN -> SCHEDULED vN+1 | CANCELLED; terminal states immutable"),
    proposal("SCHEDULE_DUE_PROCESSOR", "SCHEDULE", "FOUNDATIONAL", "SCHEDULE_CREATE", "B1B",
             "Deterministic process-due service triggered by local/test operator with Clock; no public customer endpoint or background service promise.",
             "Customer sees schedule status/receipt; internal trigger is evaluation infrastructure", "EVALUATION_ONLY", "No new customer process-due endpoint", "unique schedule execution; row locks + atomic debit/transaction/receipt/final status",
             "Internal restricted runner executes persisted mandate, not an expired browser session or 2-minute grant",
             ("SCHEDULE_CREATE", "SCHEDULE_EDIT"), cost="HIGH", states="SCHEDULED -> EXECUTED or FAILED at due; infrastructure rollback leaves SCHEDULED"),
    proposal("DISPUTE_INTAKE", "DISPUTE", "CORE", "DISPUTE", "B1C",
             "Owned completed debit linked to a reviewed case; reason, text and status. No money movement, chargeback or guaranteed resolution.",
             "Transaction detail > Report a problem; case detail remains contextual", "MANUAL_EXACT", "New dispute-intents/disputes list/detail/cancel action candidates", "transaction_disputes, immutable original transaction reference; one active case per owner/transaction",
             "AAL1+CSRF; CONFIRMATION; intent + idempotency; no AAL2 for protective reporting",
             states="ABSENT -> OPEN -> CANCELLED; review/resolution deferred"),
    proposal("CARD_LOST_BLOCK", "CARD", "CORE", "CARD_BLOCK", "B1C",
             "Irreversible block for confirmed LOST/STOLEN; preserve ACTIVE/FROZEN/EXPIRED/CANCELLED existing enum semantics; propose BLOCKED separately.",
             "Card detail > Report lost/stolen > confirm card", "MANUAL_EXACT", "Extend existing card action intents/actions and status enum later", "Card status BLOCKED + immutable reason/event; existing version and receipts",
             "AAL1+CSRF; CONFIRMATION, no extra AAL2; existing intent/idempotency pattern",
             states="ACTIVE|FROZEN -> BLOCKED; BLOCKED cannot unfreeze or enable channels"),
    proposal("CARD_REPLACEMENT_REQUEST", "CARD", "CORE", "CARD_REPLACE", "B1C",
             "Submit request linked to blocked old card; no new synthetic card, PAN, delivery or activation.",
             "Card detail > Replace card; return to same card/request status", "MANUAL_EXACT", "New replacement request intent/submit/list/detail candidates; do not overload new-product applications", "card_replacement_requests, unique open request per old card, masked reference",
             "AAL1+CSRF; CONFIRMATION; intent + idempotency; request alone does not restore spending so no additional AAL2",
             ("CARD_LOST_BLOCK",), states="ABSENT -> REQUESTED -> CANCELLED; old card stays BLOCKED"),
    proposal("RECURRING_TRANSFER_SERIES", "SCHEDULE", "DEFER", "RECURRING_CREATE RECURRING_EDIT", None,
             "Monthly standing-order series and per-occurrence ledger need separate future design; strong source evidence but larger execution scope.",
             "Future Payments > standing orders", "MANUAL_EXACT", "Separate future series/occurrences, never reuse merchant mandate stop", "Series + unique series/due occurrence",
             "Payment policy at creation/amendment; persistent mandate for bounded occurrences",
             ("SCHEDULE_DUE_PROCESSOR",), cost="HIGH", states="Future ACTIVE/CANCELLED plus per-occurrence results; PAUSED/COMPLETED not accepted now"),
    proposal("INVESTMENT_RISK_ASSESSMENT", "RISK", "DEFER", "RISK_ASSESS", None,
             "Suitability questionnaire/profile update is not action authorization risk. No validated demo questionnaire/rubric in B0.",
             "Future Wealth > risk profile/assessment", "MANUAL_EXACT", "Future versioned assessment submission; existing GET risk profile stays", "Questionnaire/rubric version, answers and assessment snapshot; invalidate old suitability",
             "AAL1+CSRF; confirm truthful answers; step-up cannot make unsuitable products suitable",
             cost="HIGH", states="No new lifecycle frozen; questionnaire/scoring is a design blocker"),
    proposal("CARD_NUMERIC_LIMITS", "CARD", "DEFER", "CARD_LIMIT", None,
             "Numeric limits need an enforcement path; current four boolean controls do not implement amount limits.",
             "Future Card detail > limits", "MANUAL_EXACT", "Future card action extension only if limit enforcement exists", "Versioned currency/period limit + usage counters",
             "Decrease CONFIRMATION; increase STEP_UP_AUTH; ineligible DENY",
             ("RISK_POLICY",), cost="HIGH", states="Future versioned numeric state; not implemented or projected"),
]

# Conservative projections: intake does not complete scheme disputes or card delivery.
TRANSITIONS = {
 "B1A": {"NEW_RECIPIENT_TRANSFER":("SUPPORTED", "Owned create + existing immediate transfer"),
         "PAYMENT_RISK_ESCALATION":("SUPPORTED", "Payment-specific policy and authorization with both UI and atomic backend execution")},
 "B1B": {"SCHEDULED_TRANSFER":("SUPPORTED", "One-time date instruction AND deterministic due execution"),
         "SCHEDULE_CHANGE":("PARTIALLY_SUPPORTED", "One-time edits only; source rent standing-order variants remain blocked"),
         "BUDGET_TO_SCHEDULE":("SUPPORTED", "Manual spending/account primitives + one-time schedule; no Agent orchestration")},
 "B1C": {"CARD_LOST_BLOCK":("SUPPORTED", "Confirmed lost/stolen permanent lifecycle; source fraud-specific guesses not accepted"),
         "FRAUD_PROTECTION_DISPUTE":("SUPPORTED", "Locate owned debit, explicitly block reported stolen card, register linked dispute; no refund")},
}

REVIEWS = [
 ("agentdojo","UserTask2","SCHEDULE", "Rent notice changes an existing scheduled amount; evidence for amendments, not a due-job engine. External text never authorizes the write."),
 ("agentdojo","UserTask6","SCHEDULE", "History-derived amount for recurring instruction; recurring=true is not a merchant mandate or proof of occurrence execution."),
 ("agentdojo","UserTask9","SCHEDULE", "Upstream explicitly calls task underspecified; do not infer next rent from a previous payment without confirmation."),
 ("agentdojo","UserTask12","SCHEDULE", "Document-driven amendment; shares primitive with UserTask2 rather than a second implementation."),
 ("agentdojo","UserTask15","RECIPIENT", "New landlord destination plus standing-order edit and refund; supports recipient binding need, not a recipient CRUD/phone-verification API."),
 ("tau_indian","rl_edgablk2x_0005","CARD", "Read, confirm permanent block, verify; repeat block must not produce another mutation. Distinct from reversible freeze."),
 ("tau_indian","rl_sqdisp_0007","DISPUTE", "History -> stolen-card block -> transaction-linked unauthorized debit case. Reporting does not imply refund."),
 ("indic","cards.agentic.block_and_replacement.001","CARD", "Damaged-card block reference feeds replacement request; supports a request-only slice, although damaged replacement is deferred."),
 ("indic","cards.agentic.card_block_loss_correction.001","CARD", "Risky source assumption: channel capability alone does not prove which card suffered fraud. Aster requires explicit corrected card confirmation, never auto-switches target."),
 ("indic","csc.agentic.dispute_wrong_account.001","DISPUTE", "Resolve actual owned account and transaction before confirmed write; original customer label is not authoritative."),
 ("indic","csc.agentic.dispute_unauthorized.001","DISPUTE", "Locate specific debit then confirmed request; no promise of money returned."),
 ("tau_knowledge","task_077","CARD", "Lost wallet includes tier rules, replacements and activation; request intake is only partial. Do not import PIN/CVV questions or shipping rules."),
 ("tau_knowledge","task_080","DISPUTE", "Multiple cards plus disputes/provisional credits; source is richer than accepted intake and cannot be marked fully unlocked."),
 ("tau_knowledge","task_043","DISPUTE", "B0 broad tool mapping includes dispute-history and pending-replacement reads in a closure/retention task. Not direct evidence for creating either resource."),
 ("tau_knowledge","task_016","RECIPIENT", "B0 RECIPIENT_TRANSFER association is weak: gold user action is a third-party card purchase, not recipient creation or outgoing transfer. Do not count as direct CRUD evidence."),
]

def main():
    families=lines("normalized/behavior-families.jsonl")
    variants=lines("normalized/candidate-variants.jsonl")
    # Read all required B0 inputs; retain their checksums rather than rewriting them.
    inputs=["normalized/behavior-families.jsonl","normalized/candidate-families.jsonl",
            "normalized/candidate-variants.jsonl","normalized/source-to-aster-mapping.jsonl","aster-capabilities.json"]
    inputs_hash={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in inputs}
    raw,_=extract(); index={(r['dataset'],r['source_task_id']):r for r in raw}
    manifest=read("sources.yaml"); manifests={s['id']:s for s in manifest['sources']}
    sidmap={"tau_indian":"tau_indian_data","indic":"indic_data"}
    reviews=[]
    for dataset,id,area,finding in REVIEWS:
        r=index[(dataset,id)];source=manifests[sidmap.get(dataset,dataset)]
        artifact=next(a for a in source['files'] if a['path']==r['path'])
        assert hashlib.sha256((CACHE/source['id']/"files"/r['path']).read_bytes()).hexdigest()==artifact['sha256']
        reviews.append(dict(dataset=dataset,source_task_id=id,area=area,path=r['path'],url=artifact['url'],
                            version=source['version'],sha256=artifact['sha256'],finding=finding))
    write("reports/b1-source-review.json",reviews)
    state={f['family_id']:f['current_aster_support'] for f in families}; projections=[]
    before=Counter(state.values()); projections.append(dict(batch="BASELINE",counts=dict(before),changes=[]))
    for batch,changes in TRANSITIONS.items():
        events=[]
        for fid,(after,reason) in changes.items():
            events.append(dict(family_id=fid,before=state[fid],after=after,reason=reason));state[fid]=after
        projections.append(dict(batch=batch,counts=dict(Counter(state.values())),changes=events))
    mapping=[]
    for f in families:
        linked=[p for p in PROPOSALS if set(p['b0_capabilities'])&set(f['required_capabilities'])]
        vs=[v for v in variants if v['family_id']==f['family_id']]
        mapping.append(dict(family_id=f['family_id'],b0_status=f['current_aster_support'],origin=f['origin'],
            primary_domain=f['primary_domain'],b0_required_capabilities=f['required_capabilities'],
            proposals=[p['capability_id'] for p in linked],candidate_variant_ids=[v['variant_id'] for v in vs],
            candidate_variant_evidence=[{k:v.get(k) for k in ('variant_id','dataset','provenance','source_family','source_axis','source_task_ids')} for v in vs],
            source_refs=f['sources'],projected_status=state[f['family_id']],
            mapping_rule="B0 dependency intersection; reach does not prove source-task completion; see b1-source-review for caveats"))
    (ROOT/"b1-family-capability-map.jsonl").write_text(''.join(json.dumps(m,ensure_ascii=False)+'\n' for m in mapping),encoding='utf-8')
    # Lower-bound count only for specifically reviewed simple adapted outcomes.
    # Source-observed clusters with unreviewed extra requirements remain affected, not unlocked.
    eligible={v['variant_id'] for v in variants if v['family_id'] in
              {"NEW_RECIPIENT_TRANSFER","PAYMENT_RISK_ESCALATION","BUDGET_TO_SCHEDULE","FRAUD_PROTECTION_DISPUTE"}}
    for p in PROPOSALS:
        if p['capability_id'] in {'RECIPIENT_DISABLE','SCHEDULE_DUE_PROCESSOR','CARD_REPLACEMENT_REQUEST','INVESTMENT_RISK_ASSESSMENT','CARD_NUMERIC_LIMITS'}:
            p['agent_value']='MEDIUM'
        fs=[m for m in mapping if p['capability_id'] in m['proposals']]
        affected={vid for m in fs for vid in m['candidate_variant_ids']}
        improved=[m['family_id'] for m in fs if m['projected_status']!=m['b0_status']]
        full=[m['family_id'] for m in fs if m['projected_status']=='SUPPORTED' and m['b0_status']!='SUPPORTED']
        if p['capability_id']=='RECIPIENT_DISABLE':
            improved=[];full=[]
        p['coverage']=dict(affected_family_ids=[m['family_id'] for m in fs],affected_family_count=len(fs),
            affected_candidate_variant_ids=sorted(affected),affected_candidate_variant_count=len(affected),
            affected_domains=sorted({m['primary_domain'] for m in fs}),
            jointly_improved_family_ids=improved,jointly_fully_unlocked_family_ids=full,
            projected_adaptable_variant_lower_bound_ids=sorted(affected&eligible) if p['capability_id']!='RECIPIENT_DISABLE' else [],
            projected_adaptable_variant_lower_bound_count=len(affected&eligible) if p['capability_id']!='RECIPIENT_DISABLE' else 0,
            standalone_unlock_count=None,
            caveat="Joint batch prerequisites required; overlapping counts are not additive; not upstream benchmark passes. Disable is a protective extension, not a B0 creation requirement.")
        p['reuse_only_cross_domain_families']=(['CARD_FREEZE','CARD_UNFREEZE','CARD_CONTROLS','RECURRING_STOP','INVESTMENT_PURCHASE','CARD_APPLICATION'] if p['capability_id']=='RISK_POLICY' else [])
        p['design_document']='docs/research/'+{'RECIPIENT':'b1-recipient-management-design.md','SCHEDULE':'b1-scheduled-payments-design.md','DISPUTE':'b1-transaction-dispute-design.md','CARD':'b1-card-lifecycle-design.md','RISK':'b1-risk-policy-design.md'}[p['area']]
    proposal_doc=dict(stage="B1",date="2026-09-30",status="DESIGN_BOUNDARY_FREEZE_NOT_IMPLEMENTATION_AUTHORIZATION",
        b0_input_sha256=inputs_hash,capabilities=PROPOSALS,projection=projections,
        unchanged_scope="No application, contract, database or Agent implementation",
        policy_parameters=dict(status="PARAMETERS_REQUIRE_PRODUCT_APPROVAL_BEFORE_IMPLEMENTATION",currency="CNY",high_amount=None,new_recipient_hours=None,
            boundary="totalDebit >= approved H; recipient age < approved W; unknown age is new; amounts include fees",
            non_normative_test_examples=dict(high_amount="10000.00",new_recipient_hours=24),
            production="No benchmark evidence establishes numerical thresholds. Examples are test vectors, not frozen runtime policy."),
        unimplemented_missing_families=[m['family_id'] for m in mapping if m['b0_status']=='MISSING' and m['projected_status']=='MISSING'],
        source_review="reports/b1-source-review.json",projection_caveat="Conditional product capability projection only; all implementation/test gates remain unmet")
    write("b1-capability-proposals.json",proposal_doc)
    write("reports/b1-coverage-statistics.json",dict(projections=projections,
        affected_families=len({m['family_id'] for m in mapping if m['proposals']}),
        affected_variants=len({v for m in mapping if m['proposals'] for v in m['candidate_variant_ids']}),
        accepted_affected_families=len({f for p in PROPOSALS if p['accepted'] for f in p['coverage']['affected_family_ids']}),
        accepted_affected_variants=len({v for p in PROPOSALS if p['accepted'] for v in p['coverage']['affected_candidate_variant_ids']}),
        reviewed_adaptable_variant_lower_bound_ids=sorted(eligible),
        candidate_variant_count=len(variants),b0_families=len(families)))
    def table(headers,rows):
        return '| '+' | '.join(headers)+' |\n|'+ '|'.join(['---']*len(headers))+'|\n'+''.join('| '+' | '.join(str(x) for x in row)+' |\n' for row in rows)
    doc="""# B1 — Coverage Projection

日期：2026-09-30。**条件性设计预测，不是当前已实现结果，不改 B0 统计。**

## 统计规则

保持 B0 的 67 个族、498 个候选簇和当前 19/20/19/9。逐族从 B0 required_capabilities 与 B1 proposal 显式关系计算；来源读操作误映射等问题另记录，不偷偷修分母。

- affected：涉及该能力的 B0 族/候选簇，不保证实施一项即可完成。
- improved/full：**整个建议批次及前置**完成后的共同收益，不是单项独立贡献，不能相加。
- lower-bound variants：仅 4 个已审查的简单 Aster 适配目标，仍须编写初态/断言；不是上游 runnable case 已通过。
- recipient disable 是保护性扩展，关联创建族用于说明风险，单独解锁为零。
- Risk policy 在 Cards/Recurring/Wealth 的复用只保持现有语义，不额外增加支持族。
- 纯语言/规范来源可能没有 candidate variants，0 不等于没有产品价值。

## 每项能力涉及范围

"""
    doc+=table(['Capability','涉及族','涉及候选簇','联合改善族','联合完整族','变体下界'],[
        (p['capability_id'],p['coverage']['affected_family_count'],p['coverage']['affected_candidate_variant_count'],
         len(p['coverage']['jointly_improved_family_ids']),len(p['coverage']['jointly_fully_unlocked_family_ids']),
         p['coverage']['projected_adaptable_variant_lower_bound_count']) for p in PROPOSALS])
    doc+="\n所有提案（含 DEFER）去重涉及 20 族、104 个候选簇。它们不能被宣称为 104 个完整解锁变体。每一个 variant ID、source task ID、axis 和提案链接都保存在 [b1-family-capability-map.jsonl](../../research/banking-behaviors/b1-family-capability-map.jsonl)。预测以付款风险参数批准及后续全部验收门槛通过为前提。\n\n## 批次预测\n\n"
    doc+=table(['批次累计','SUPPORTED','PARTIAL','MISSING','OUT/EVAL'],[(p['batch'],p['counts']['SUPPORTED'],p['counts']['PARTIALLY_SUPPORTED'],p['counts']['MISSING'],p['counts']['OUT_OF_SCOPE']) for p in projections])
    doc+='\n'+table(['批次','族','转换','条件'],[(p['batch'],c['family_id'],c['before']+' → '+c['after'],c['reason']) for p in projections for c in p['changes']])
    doc+="""
不能增加的分数：CARD_REPLACEMENT 仍 PARTIAL（无发行/激活）；CARD_DELIVERY 仍 MISSING；TRANSACTION_DISPUTE/UNRECOGNIZED_CHARGE/DUPLICATE_CHARGE 仍 PARTIAL（没有调查结案/网络退单/自动判重）；RELOCATION_PAYMENTS 仍 PARTIAL（无 standing orders/地址更新）；BILL_TO_TRANSFER 仍 PARTIAL（没有可信账单导入）；RISK_ASSESSMENT 仍 MISSING（不是付款授权风险）。

SCHEDULE_CHANGE 从 MISSING 到 PARTIAL 只表示单次计划修改原语变得可用，**三个租金 standing-order 源簇仍未完整支持**。CARD_LOST_BLOCK 的完整状态按 Aster 明确选卡和 LOST/STOLEN 目标口径；源数据要求 fraud 推断或其他原因的变体不因此完成。

## 可进一步编写的 4 个变体下界

"""+'\n'.join('- `'+i+'`' for i in sorted(eligible))+"\n\n其中 3 个 Aster 提案与 1 个 TauIndian 流程簇在完成对应批次后具备最小原语。金额/币种、身份/隐私与断言仍需适配；不声称原上游行为评测已经运行。\n\n"
    reasons={
      'TRANSFER_CANCELLATION':'只取消未到期计划不等于撤回已经提交/完成的即时转账；缺少可撤回结算窗口。',
      'COLLECT_OR_SPLIT':'收款请求、参与人和偿付状态是另一个产品，现阶段价值不及核心付款。',
      'FX_EXCHANGE':'可执行汇率、报价有效期和双币种结算均未设计；估值汇率不能交易。',
      'LOAN_QUOTE_SERVICE':'贷款偿付/提前结清等地区规则超出当前申请受理范围。',
      'ACCOUNT_OPEN_CLOSE':'开户资格、关户清算与账户体系另行评审，不为 benchmark 增加。',
      'DEPOSIT_CLOSURE':'需要定期存款本金/利息/罚息模型；当前基金持仓不等价。',
      'DEPOSIT_RENEWAL':'依赖尚无的定期存款及到期生命周期。',
      'RISK_ASSESSMENT':'问卷/评分/有效期缺少依据，独立于授权 risk policy。',
      'INVESTMENT_REDEMPTION':'份额、估值日、流动性、清算周期另行设计。',
      'CARD_ACTIVATION':'本批不发行真实或合成新卡；没有可安全激活的生命周期。',
      'CARD_REWARDS_SERVICE':'奖励账本和留存政策不是当前重点。',
      'CARD_DELIVERY':'只受理请求，无物流；不能让 request status 冒充 delivery status。',
      'RECURRING_CREATE':'standing-order series/occurrence 暂缓；不复制 merchant subscription。',
      'RECURRING_MODIFY':'系列修改、下次日期与已执行 occurrence 需独立协议。',
      'SERVICE_ESCALATION':'域内 case 不等于通用客服/人工路由与 SLA。',
      'PROFILE_CHANGE':'真实联系方式/地址更新需验证和下游用途，首批不建立。',
      'DEPOSIT_REINVESTMENT':'依赖未接受的存款关闭/新开组合，不以投资认购替代。'}
    deferred=proposal_doc['unimplemented_missing_families']
    assert set(deferred)==set(reasons)
    doc+='## 原有 19 个 MISSING 的逐项处置\n\nSCHEDULED_TRANSFER 预测到 SUPPORTED，SCHEDULE_CHANGE 只到 PARTIAL；其余以下 17 个继续 MISSING。DEFER 并非永远不做；部分涉及外部网络或不同领域，必须有独立价值与设计批准。\n\n'
    doc+=table(['保持 MISSING 的族','理由'],[(fid,reasons[fid]) for fid in deferred])
    doc+='\n完整 67 行投影见机器映射；原 B0 来源、候选簇和支持标签完全保留。\n'
    (PROJECT/'docs/research/b1-coverage-projection.md').write_text(doc,encoding='utf-8')
    print("B1 CAPABILITY REVIEW COMPLETE")
    print("RECIPIENT MANAGEMENT: owned synthetic recipient create/detail/disable; no phone/KYC/routing edit.")
    print("SCHEDULED PAYMENTS: one-time CNY lifecycle + deterministic local/test due processing; recurring series deferred.")
    print("TRANSACTION DISPUTE: contextual intake/status/cancel only; no refund or chargeback.")
    print("CARD LIFECYCLE: permanent BLOCKED plus request-only replacement; no new card/activation/delivery.")
    print("RISK POLICY: deterministic bound authorization; numerical thresholds require approval; investment questionnaire deferred.")
    for category in ('FOUNDATIONAL','CORE','DEFER'):
        print(category+':',', '.join(p['capability_id'] for p in PROPOSALS if p['recommendation']==category))
    print("RECOMMENDED FIRST IMPLEMENTATION BATCH: B1A Payments foundation, after contract/policy approval; no implementation in B1.")
    for p in PROPOSALS:
        c=p['coverage'];print(p['capability_id'],p['recommendation'],"affected",c['affected_family_count'],"families",c['affected_candidate_variant_count'],"clusters")
    for p in projections:print(p['batch'],p['counts'])
    print("NO APPLICATION CODE CHANGED. NO CONTRACT CHANGED. NO DATABASE SCHEMA CHANGED. NO AGENT IMPLEMENTED. STOP AT B1.")

if __name__=='__main__': main()
