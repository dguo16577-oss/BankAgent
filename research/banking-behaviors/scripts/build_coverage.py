"""Build human and machine reports from the pinned audit, not an arbitrary case target."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from audit_config import DOMAINS, MISSING
from fetch_sources import ROOT, VERSION
from inspect_sources import write_json

PROJECT=ROOT.parents[1]
DOCS=PROJECT/"docs/research"

def load(name):return json.loads((ROOT/name).read_text(encoding="utf-8"))
def lines(name):return [json.loads(x) for x in (ROOT/name).read_text(encoding="utf-8").splitlines() if x]
def md(path, text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text.rstrip()+"\n",encoding="utf-8")
def cell(x):return str(x).replace("|"," / ").replace("\n"," ")
def table(headers, rows):
    return "| "+" | ".join(headers)+" |\n|"+"|".join("---" for _ in headers)+"|\n"+"".join("| "+" | ".join(cell(x) for x in row)+" |\n" for row in rows)
def refs(f):return ", ".join(sorted({s["dataset"] for s in f["sources"]})) or f["origin"]
def keys(f, language=False):
    return {(s["dataset"],i) for s in f["sources"] if (s["dataset"]=="banking77")==language for i in s["source_task_ids"]}

def main():
    families=lines("normalized/behavior-families.jsonl"); candidates=lines("normalized/candidate-families.jsonl"); variants=lines("normalized/candidate-variants.jsonl")
    all_variants=lines("reports/all-variant-clusters.jsonl")
    inventory=load("reports/source-inventory.json")["sources"]
    manifest=load("sources.yaml"); source_by_id={s["id"]:s for s in manifest["sources"]}
    notes=load("source-notes.json"); capdoc=load("aster-capabilities.json");caps={c["capability_id"]:c for c in capdoc["capabilities"]}
    licenses={"tau_indian":"MIT","tau_indian_data":"MIT; KB third-party provenance applies","indic":"MIT","indic_data":"CC-BY-4.0","agentdojo":"MIT","tau_knowledge":"MIT","banking77":"CC-BY-4.0","fintoolbench":"UNKNOWN","openbanking":"Open Banking Open Licence (declared; terms URL not revalidated)","tau_original":"MIT"}
    counts={"tau_indian_data":1000,"indic_data":799,"agentdojo":25,"tau_knowledge":97,"banking77":13083,"fintoolbench":295,"openbanking":0,"tau_original":0}
    for s in manifest["sources"]:
        s["license"]=licenses[s["id"]]
        s["expected_count"]=counts.get(s["id"])
        s["count_unit"]="code artifact; paired dataset has the task count" if s["id"] not in counts else "See source-inventory.json: units differ, never sum blindly"
        if s["id"]=="tau_indian":
            s["release_date"]="2026-08-30";s["release_date_note"]="CITATION.cff v1.0.0, distinct from pinned commit date"
    write_json(ROOT/"sources.yaml",manifest)
    baseline=load("reports/protected-files.json")
    code_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/"scripts").glob("*.py"))}
    metadata={"retrieval_date":"2026-09-29","script_version":VERSION,"script_sha256":code_hashes,"manifest_sha256":hashlib.sha256((ROOT/"sources.yaml").read_bytes()).hexdigest(),"filtering":"Six-domain banking behavior, not mere keyword finance; market research excluded; Banking77 language only; unknown rights not redistributed", "dedup":"Explicit outcome mappings in audit_config.py/normalize_sources.py. Identity, amount, dates and failure axes are variants. Source tasks can support multiple families; counts distinguish unique records and memberships."}
    required={c for f in families for c in f["required_capabilities"]}
    domains={}
    for domain in DOMAINS:
        fs=[f for f in families if f["primary_domain"]==domain]
        behavior=set().union(*(keys(f) for f in fs)) if fs else set()
        language=set().union(*(keys(f,True) for f in fs)) if fs else set()
        domains[domain]={"unique_source_records_non_language":len(behavior),"language_utterances":len(language),"families":len(fs),"adaptability":dict(Counter(f["aster_adaptability"] for f in fs)),"support":dict(Counter(f["current_aster_support"] for f in fs)),"multi_source_families":sum(len({s["dataset"] for s in f["sources"] if s["source_task_ids"]})>1 for f in fs),"candidate_variant_clusters":sum(v["family_id"] in {f["family_id"] for f in fs} for v in variants)}
        domains[domain]["banking_records_only"]=sum(sid!="fintoolbench" and not (sid=="agentdojo" and tid.startswith("InjectionTask")) for sid,tid in behavior)
        domains[domain]["research_queries_excluded"]=sum(sid=="fintoolbench" for sid,tid in behavior)
        domains[domain]["attack_goals_separate"]=sum(sid=="agentdojo" and tid.startswith("InjectionTask") for sid,tid in behavior)
    core=[f for f in candidates if f["manual_ui_required"]=="YES" and f["origin"] not in ("ASTER_GAP_HYPOTHESIS",)]
    composite=[f for f in candidates if f["primary_domain"]=="CROSS_DOMAIN" and f.get("cross_domain_kind")=="MULTI_BUSINESS_DOMAIN"]
    robustness={v["family_id"] for v in variants if v["behavior_label"]=="ROBUSTNESS"}
    security={v["family_id"] for v in variants if v["behavior_label"]=="SECURITY_ADVERSARIAL"}
    knowledge={v["family_id"] for v in variants if v["kind"]=="KNOWLEDGE_POLICY"}
    # Reproducible greedy cover over currently usable candidate primitives; not a claim of mathematical optimality.
    usable=[f for f in candidates if f["current_aster_support"]=="SUPPORTED" and f["manual_ui_required"]!="NO"]
    uncovered=set(c for f in usable for c in f["required_capabilities"])
    minimal=[]
    while uncovered:
        chosen=sorted(usable,key=lambda f:(-len(set(f["required_capabilities"])&uncovered),f["family_id"]))[0]
        minimal.append(chosen["family_id"]);uncovered-=set(chosen["required_capabilities"]);usable.remove(chosen)
    balanced=sorted({f["family_id"] for f in candidates if f["current_aster_support"]=="SUPPORTED" or f["family_id"] in robustness or f in composite})
    all_source_records=set().union(*(keys(f) for f in families))
    native_groups={(s["dataset"],s["source_family"]) for f in families for s in f["sources"] if s["source_task_ids"]}
    stats={**metadata,"sources_inspected":len(notes),"artifact_sources":len(manifest["sources"]),"raw_counts":{"behavior_tasks":1000+799+97+16,"adversarial_goals":9,"language_utterances":13083,"financial_research_queries":295,"spec_operations":89,"banking_behavior_note":"1912 includes safety/refusal cases inside Indic; not all are normal tasks. Adversarial goals are separate.","all_non_language_records":len(all_source_records)},"families":len(families),"candidate_families":len(candidates),"candidate_variant_clusters":len(variants),"origins":dict(Counter(f["origin"] for f in families)),"adaptability":dict(Counter(f["aster_adaptability"] for f in families)),"support":dict(Counter(f["current_aster_support"] for f in families)),"capability_primitives":{"inventoried":len(caps),"required_by_families":len(required),"required_existing":sum(caps[c]["current_status"]=="SUPPORTED" for c in required),"required_missing":sum(caps[c]["current_status"]=="MISSING" for c in required),"required_out_of_scope":sum(caps[c]["current_status"]=="OUT_OF_SCOPE" for c in required)},"native_source_group_keys":len(native_groups),"multi_source_families":sum(len({s["dataset"] for s in f["sources"] if s["source_task_ids"]})>1 for f in families),"domains":domains,"layers":{"core_manual":len(core),"composite":len(composite),"robustness":len(robustness),"security":len(security),"knowledge_policy":len(knowledge)},"selection_modes":{"MINIMAL_CORE":minimal,"BALANCED":balanced,"EXTENDED":[f["family_id"] for f in candidates]},"selection_note":"Family IDs, not final runnable tasks. Layers overlap. Minimal is a deterministic greedy upper bound covering available candidate primitives, not proof of a minimum or complete six-domain coverage."}
    write_json(ROOT/"reports/statistics.json",stats)
    stamp=f"检索日期：2026-09-29。脚本版本：{VERSION}；固定 commit、数据 SHA 与逐文件 SHA-256 见 [sources.yaml](../../research/banking-behaviors/sources.yaml)。脚本哈希及输入/输出计数见 [statistics.json](../../research/banking-behaviors/reports/statistics.json)。\n\n筛选与去重：先读取原生任务/工具/评分结构，再按业务结果归一化；金额、身份、日期与异常处理留作变体。不同来源可共享同一族，单任务也可支持多个族。人工语义映射完整保存在脚本中，可复算但仍需评审。\n"
    audit="# B0 — 银行行为数据来源审计\n\n"+stamp+"\n## 边界与关键发现\n\n- 本次只做下载、静态解析、溯源和候选映射；没有运行上游 Agent，也没有评分模型。\n- 缓存在用户目录 `.cache/aster-b0`，项目只保留清单、索引、规则与报告；上游代码从未导入执行。\n- 银行业务对话、攻击目标、语言样本和规范操作不能相加后称为同一种任务。\n- 当前应用是含申请扩展的 Customer 1.10.0 / Public 冻结合同，共 51 个已实现操作；不是历史 M24 的 48 个。\n- tau3/tau2 banking_knowledge 是同一来源的不同发布名称；不得重复计数。\n\n"
    for sid,n in notes.items():
        audit+=f"## {n['name']}\n\n"
        fields=[("组织/作者",n["authors"]),("论文",f"[论文]({n['paper']})" if n["paper"] else "未验证独立论文；不以推测补全"),("发布时间/版本说明",n["publication_note"]),("许可证",n["license"]),("原生单位与核验计数",json.dumps(inventory.get(sid,{}),ensure_ascii=False)),("格式",n["format"]),("任务结构",n["schema"]),("工具数量与口径",n["tool_count"]),("语言",n["language"]),("真实/合成来源",n["origin"]),("初态",n["initial_state"]),("可变状态",n["mutable_state"]),("预期终态",n["expected_final_state"]),("预期工具调用",n["expected_tool_calls"]),("多轮",n["multi_turn"]),("政策",n["policy"]),("安全",n["security"]),("评分",n["grader"]),("Aster 适用性",n["suitability"]),("限制",n["limitations"])]
        audit+=table(["项目","核验结果"],fields)+"\n### 固定来源与实际读取文件\n\n"
        for aid in n["artifacts"]:
            s=source_by_id[aid]; url=s.get("dataset_url",s.get("repository_url"))
            audit+=f"- [{aid}]({url})：`{s['version']}`，版本时间 `{s['version_date']}`；下载 {len(s['files'])} 个固定文件。\n"
            matches=[f for f in s["files"] if f["path"] in n["evidence"] or f["path"] in ("DATA_LICENSE.md","tau2/domains/indian_banking/tasks.json","tau2/domains/indian_banking/db.json")]
            for f in matches:audit+=f"  - [{f['path']}]({f['url']})\n"
        examples=[(f["family_id"],e) for f in families for e in f["examples"] if e["dataset"]==sid][:4]
        if examples:
            audit+="\n代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：\n\n"
            audit+=table(["族","来源 ID","转述","原文件"],[(fid,e["task_id"],e["paraphrase"],f"[定位]({e['provenance']})") for fid,e in examples])+"\n"
    audit+="""## 扩展搜索与排除日志

- [t54 FinAgent-Bench 官方介绍](https://docs.t54.ai/docs/research/finagent-bench)链接的 `t54-labs/FinAgent-Bench` 仓库返回 404。只有介绍页，未下载任务；版本、许可、计数均 UNKNOWN，不进入归一化计数。不能把网站宣传当作已验证数据。
- 原始 tau-bench 的 README 和 airline/retail task 文件已检查；无 banking 域，方法可参考，任务不重复计入。
- FinToolBench 确实有实际问题与工具清单，但面向公司报表/市场研究，且许可证未明确；不为填补 Wealth 数量而强行纳入。
- Open Banking 规范提供计划付款与授权生命周期证据，没有任务初态、终态评分或对话，因此只作为规范派生设计资料。
- 检索入口覆盖 NPCI/Hugging Face、AgentDojo、Sierra、Banking77、banking agent benchmarks、financial tool-use、Open Banking。不是宣称穷尽所有公开金融数据。

## 授权与地区适配

只复用可核实授权的结构或转述，原始案例和规范均不 vendoring。Indic/BANKING77 需要 CC BY 归属与改编说明；TauIndian 的 KB 引用不能自动继承仓库 MIT；FinToolBench 的不明授权阻止原文再分发。规范的授权链接目前解析异常，保持未核实结论。

INR→CNY 不是完整适配。UPI/IFSC/印度存款税与老年利率、英国 IBAN/TPP/SCA、美国信用卡奖励与信用局程序必须分别判断。FD/RD 不等于 Aster 的 MONEY_MARKET/BOND/CASH_MANAGEMENT 投资；永久停卡不等于冻结；取消银行扣款不等于取消商家订阅合同。

## 可复现运行

```powershell
python -m pip install -r research/banking-behaviors/scripts/requirements.txt
python research/banking-behaviors/scripts/fetch_sources.py
python research/banking-behaviors/scripts/inspect_sources.py
python research/banking-behaviors/scripts/normalize_sources.py
python research/banking-behaviors/scripts/build_coverage.py
python research/banking-behaviors/scripts/validate_audit.py
python research/banking-behaviors/scripts/verify_scope.py
```

普通复算不要使用 `--lock` 或重新 discovery；它们用于未来新审计，不是本次固定版本复现。需要 Python 3.10+、curl、PyYAML；无需 Hugging Face Token、专有 API 或上游依赖。断网时已有完整缓存可复算；缺失来源会报错，不静默少算。
"""
    md(DOCS/"banking-behavior-source-audit.md",audit)
    coverage="# B0 — 六域行为覆盖\n\n"+stamp
    coverage+="\n## 数量口径\n\n"+table(["输入/输出","数量/含义"],[("银行任务/案例",1912),("另列 AgentDojo 攻击目标",9),("另列 BANKING77 语言样本",13083),("另列 FinToolBench 研究查询（不纳入核心）",295),("另列规范操作",89),("归一化族（含排除项与 Aster 提案）",len(families)),("推荐候选族",len(candidates)),("候选变体簇（不是最终测试用例）",len(variants)),("所需能力原语",len(required))])
    coverage+="\n## 六域汇总\n\n非语言记录列包含安全/研究记录，按来源 ID 去重；一个原始任务可能跨域，六行不能直接相加。语言样本单列，不代表可执行业务。\n\n"
    coverage+=table(["域","原始非语言记录","语言样本","族","DIRECT","ADAPTABLE","PARTIAL","支持","部分","缺失","排除/评测层","跨来源重复族","候选变体簇"],[(d,v["unique_source_records_non_language"],v["language_utterances"],v["families"],v["adaptability"].get("DIRECT",0),v["adaptability"].get("ADAPTABLE",0),v["adaptability"].get("PARTIAL",0),v["support"].get("SUPPORTED",0),v["support"].get("PARTIALLY_SUPPORTED",0),v["support"].get("MISSING",0),v["support"].get("OUT_OF_SCOPE",0),v["multi_source_families"],v["candidate_variant_clusters"]) for d,v in domains.items()])
    coverage+="\n## 族矩阵\n\n✓ 表示主域；次域在 JSONL 中保留。支持状态按 Aster 目标语义评估，不意味着可直接执行上游工具。安全/知识专属条目 OUT_OF_SCOPE 指当前手动产品范围，不意味着没有研究价值。\n\n"
    headers=["Family","Payments","Spending/Transactions","Wealth","Cards","Recurring/DD","Cross","Read","Mutation","Multi-tool","Clarification","Failure","Step-up/Risk","Security","Knowledge/Policy","Aster","Manual UI","Sources"]
    rs=[]
    for f in families:
        rs.append([f["family_id"]]+["✓" if f["primary_domain"]==d else "" for d in DOMAINS]+["✓" if f["operation_type"] in ("READ","MIXED") else "", "✓" if f["operation_type"] in ("MUTATE","MIXED") else "", "✓" if "MULTI_TOOL_PLAN" in f["agent_reasoning"] else "",f["clarification"],",".join(f["failure_modes"]),f["authorization"]+"/"+f["risk"],"✓" if "SECURITY_ADVERSARIAL" in f["suite_labels"] else "","✓" if "KNOWLEDGE_RETRIEVAL" in f["agent_reasoning"] else "",f["current_aster_support"],f["manual_ui_required"]+"/"+f["manual_ui_coverage"],refs(f)])
    coverage+=table(headers,rs)
    coverage+="\n## 跨域、变体与去重\n\n"
    coverage+=table(["组合","出处","所需原语","当前支持"],[(f["family_id"],f["origin"],", ".join(f["required_capabilities"]),f["current_aster_support"]) for f in families if f["primary_domain"]=="CROSS_DOMAIN"])
    coverage+="""
真正组合可来自交易→付款、异常交易→卡片保护/争议、账户→投资、消费→周期扣款停止。安全和知识也是独立轴，不因使用身份检查就把每条任务算成跨业务域。`cross_domain_kind` 区分多业务域组合与平台支持类条目。

四个明确 ASTER_COMPOSED：SPENDING_TO_RECURRING_STOP、ACCOUNT_TO_INVESTMENT、CARD_ANOMALY_PROTECT、BUDGET_TO_SCHEDULE。它们从来源支持的原语与 Aster 当前流程组合，**不是从公开数据直接复用的任务**。

重复例子：TauIndian `sqfrz`/`edgbcarddisamb` 与 Indic freeze 类工具共享 CARD_FREEZE；`sqmand`/`sq2mandaudit`/`edgamandwrong` 共享 RECURRING_STOP；Banking77 的同主题只增加语言证据。冻结与永久停卡、自愿销卡、补卡不合并；存款与基金认购不合并；退款与向朋友退回款项不合并。

有用变体：可用余额不足、卡片同名消歧、取消错误 mandate ID 的纠正、已停止/已永久停卡的重复请求、开启与关闭渠道的认证差异。Aster 的过期 intent、旧状态冲突、会话变化、同键重试/异键重复，需要本地编写测试，不伪装成上游现成案例。
"""
    coverage+="\n## 提议套件层\n\n层可重叠，不相加形成总任务数。\n\n"+table(["层","可用候选族数"],stats["layers"].items())
    coverage+="\n## 三种选择模式（仅推荐候选）\n\n"
    for mode,ids in stats["selection_modes"].items():
        coverage+=f"### {mode} — {len(ids)} 个族\n\n"+", ".join(f"`{x}`" for x in ids)+"\n\n"
    coverage+="MINIMAL_CORE 用确定性贪心覆盖当前可操作候选所需的原语，不宣称数学最优，也不把缺失能力当作已覆盖。BALANCED 增加有证据的异常与组合，含尚需开发的能力；EXTENDED 保留所有高/中价值 DIRECT/ADAPTABLE 及组合候选，扩展安全与知识。三者都不是可立即执行或最终冻结的 case 清单。\n"
    md(DOCS/"banking-behavior-coverage.md",coverage)
    gap="# B0 — Aster 能力差距分析\n\n"+stamp+"\n## 当前应用核对结论\n\n"
    gap+="Customer 42 + Public 9 = 51 个合同操作均在实现矩阵标记 IMPLEMENTED_POSTGRESQL。能力清单还读取了实际 Java Service/Controller 和 Web feature 文件。支持表示本地演示业务实现和合理手动 UI 同时存在，不表示接入真实银行清算或已经重新完成整套运行时验收。\n\n"
    gap+="- 产品页申请已内嵌，登录携带原页面返回地址；不再把“进入个人中心”当作申请流程。申请只到 SUBMITTED，审批/发卡/放款未实现。\n- Transfers 只有 CNY 即时出账和已有收款人；列表/search 不等于创建收款人。\n- Cards 可冻结、解冻、四渠道开关；无数额限额、永久停卡、补卡或销卡。\n- Recurring 可停止银行管理的未来扣款，detected-only 不可直接停止；不会取消商家合同。\n- Wealth 风险档案只读、适当性检查和 CNY 认购可用；问卷、赎回和真实 NAV 不可用。\n- Spending 支持自定义至 366 天窗口，不把“年度报表”一律写成全缺失；PDF/CSV 对账单交付和异常/重复检测才是缺口。\n- 本次没有证据证明仍存在“API 已完成但申请 UI 强制跳个人中心”的旧问题。投资产品没有专门并排比较界面，但人可以分别查看详情；这属于体验改进候选，不自动要求新 API。\n\n"
    for domain in DOMAINS:
        fs=[f for f in families if f["primary_domain"]==domain and f["current_aster_support"] in ("MISSING","PARTIALLY_SUPPORTED")]
        gap+=f"## {domain}\n\n"
        if not fs:gap+="没有普通产品缺口族；评测/政策层另列。\n\n";continue
        rr=[]
        for f in fs:
            needed=[c for c in f["required_capabilities"] if caps[c]["current_status"]!="SUPPORTED"]
            existing=[c for c in f["required_capabilities"] if caps[c]["current_status"]=="SUPPORTED"]
            useful=str(sum(v["family_id"]==f["family_id"] and v["provenance"]=="SOURCE_OBSERVED" for v in all_variants))+" observed / "+str(sum(v["family_id"]==f["family_id"] for v in variants))+" candidate"
            rec="MUST_CONSIDER" if any(MISSING[c][1]=="MUST_CONSIDER" for c in needed) else "SHOULD_CONSIDER" if any(MISSING[c][1]=="SHOULD_CONSIDER" for c in needed) else "OPTIONAL"
            if all(caps[c]["current_status"]=="OUT_OF_SCOPE" for c in needed):rec="OUT_OF_SCOPE"
            auth="现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant"
            rr.append([f["family_id"],refs(f),useful,", ".join(existing) or "无",f["manual_ui_coverage"],", ".join(needed),"是：新执行原语（检测/报表另行设计）","预计需要持久化生命周期；检测查询可能不需要新表",auth,f["agent_value"],f["implementation_cost"],rec])
        gap+=table(["族","来源证据","候选变体簇","现有后端原语","UI","缺失原语","新 API","DB 判断（设计前估计）","授权适配","Agent 价值","成本","建议"],rr)+"\n"
    gap+="## 缺口原语清单（不把场景数当 API 数）\n\n"
    gap+=table(["原语","域","状态","建议","成本","定义"],[(c["capability_id"],c["domain"],c["current_status"],c.get("recommendation"),c.get("implementation_cost"),c["limitations"]) for c in caps.values() if c["current_status"]!="SUPPORTED"])
    gap+=f"\n归一化 {len(families)} 个族，依赖 {len(required)} 个不同能力原语；其中现有 {stats['capability_primitives']['required_existing']}、缺失 {stats['capability_primitives']['required_missing']}、当前范围外 {stats['capability_primitives']['required_out_of_scope']}。候选变体簇 {len(variants)} 个不是同样数量的新功能。\n"
    gap+="""
## 建议的下一步顺序（本轮不实施）

1. 评审 B0 语义映射，尤其“永久停卡/补卡/争议”和“计划付款”的产品边界。逐族确认人能否完成底层动作。
2. 优先考虑收款人创建、计划付款生命周期、交易争议收件与状态、遗失卡保护/补卡。新增能力必须同时给出手动 Web 流程。
3. 补齐风险档案评估，再决定是否扩展投资生命周期；当前外部 Wealth 数据明显弱于 Cards/Recurring，宜自行编写适当性与资金一致性场景。
4. 高风险付款若需要 Step-Up，先设计付款资源绑定，不借用只服务 Card Intent 的授权。Protective freeze/stop 不应因安全测试数量而被强制升级认证。
5. 后续才能编写可执行 behavior cases 和 Agent composite；继续区分正常、鲁棒性、安全、知识层。

不要为了数据集扩张支票、印度专属 UPI、保险、金抵押贷款、信用局后台操作、PIN/秘密收集、奖励账本或市场数据订阅。不要在 B0 实现 Agent、RAG、LLM 或改 frozen API。

所有 DB/API 成本都是初步架构判断，不是迁移方案。未进行活数据库变更、真实交易或新应用功能开发。
"""
    md(DOCS/"aster-capability-gap-analysis.md",gap)
    report="# B0 — Banking Scenario Dataset Audit & Capability Mapping\n\n状态：**RECOMMENDED CANDIDATE SET；未冻结。STOP AT B0。**\n\n"+stamp
    report+="## 核心结论\n\n"
    report+=f"已核查 {len(notes)} 个来源（其中原始 tau 为血缘筛查、Open Banking 为规范），固定 {len(manifest['sources'])} 组代码/数据工件。主要银行任务共 1,912；另外有 9 个攻击目标、13,083 条语言样本和 295 条不纳入核心的金融研究查询。归一化得到 {len(families)} 个族，推荐 {len(candidates)} 个候选族及 {len(variants)} 个候选变体簇。需要 {len(required)} 个不同能力原语，不是数百个新功能。\n\n"
    report+=table(["分类","计数"],[("Adaptability",json.dumps(stats["adaptability"],ensure_ascii=False)),("当前支持",json.dumps(stats["support"],ensure_ascii=False)),("来源/提案",json.dumps(stats["origins"],ensure_ascii=False)),("跨来源重合的族",stats["multi_source_families"]),("原生 source-family/signature/intent 键",len(native_groups)),("依赖能力原语",json.dumps(stats["capability_primitives"],ensure_ascii=False))])
    report+="\n## 36 项交付问题索引\n\n"
    answers=[
    ("调查和实际下载了哪些数据、版本许可计数？","见来源审计的 8 个完整来源记录及 sources.yaml，含代码/数据分离许可证与文件哈希。t54 仓库不可用未计入。"),
    ("可执行行为、可变状态、终态评分？","TauIndian、AgentDojo、tau banking_knowledge 有工具环境与状态判定。Indic 是脚本 mock+工具/响应判定，部分合并写状态，不能当完整银行 DB 终态基准。"),
    ("安全与知识？","AgentDojo 攻击目标和 Indic 安全轴分开；tau knowledge 的 97 个任务都有文档和动作要求。无纯 QA 任务被冒充缺失 Web 功能。"),
    ("任务、族、原语数量？",f"1912 银行任务/案例；{len(families)} 总族；{len(required)} 所需原语；语言、攻击目标、研究查询另列，不相加成可执行任务数。"),
    ("六域分布、重复、适配分类？","见本报告统计及覆盖矩阵；源 ID 跨域可以重合。上游 50 TauIndian family、100 Indic tool signature、77 language intent 不同单位，不能做虚假的统一重复率。"),
    ("当前支持、UI、后端、授权差距？","见 capability gap 与逐族 JSONL。51/51 API 已有实现不代表所有用户目标完成。申请原页流程已存在；审批不在现有范围。付款 Step-Up 尚无专用授权绑定。"),
    ("Payments 最强来源？","AgentDojo：历史款项/账单到付款及计划修改；Open Banking 补生命周期设计。NPCI 当前套件没有通用立即转账执行工具。"),
    ("Spending 最强来源？","AgentDojo 提供小型消费统计，Indic 强交易查询异常；年度报表、类别分析、重复检测需要 Aster 补充，不能依赖市场报表数据。"),
    ("Wealth 最强来源？","TauIndian 资金/存款决策链最接近，但仅部分适配。真正基金认购/风险问卷/赎回缺乏强直接来源，需要 Aster-authored。FinToolBench 不替代这些能力。"),
    ("Cards 最强来源？","TauIndian 正常状态操作+Indic 鲁棒性+tau knowledge 复杂服务政策，三者互补。永久 block 与可逆 freeze 严格分开。"),
    ("Recurring 最强来源？","TauIndian mandate cancel + Indic 消歧/错误处理；AgentDojo standing-order 创建/修改补充。商家合同取消未被证明可复用。"),
    ("Cross-domain 最强来源？","AgentDojo transaction→payment 与 relocation；TauIndian fraud chain；四项 Aster 组合明确标记 ASTER_COMPOSED。"),
    ("公开数据的洞与需要自己写的场景？","CNY/decimal string、intentHash、CSRF/session、single-use AAL2、幂等冲突、基于待处理金额的可用余额、检测来源不可变更、投资与消费隔离、申请停在待审核。"),
    ("套件分层与模式？",json.dumps(stats["layers"],ensure_ascii=False)+"；模式为贪心最小可用覆盖 / 平衡 / 扩展，各为候选族而非已冻结 runnable cases。"),
    ("下一步与明确不做？","先人工评审映射与产品缺口，再决定 B1；本轮不改业务、API、DB、部署，也不实现 Agent。"),
    ("授权/再分发风险？","Indic 与 Banking77 CC BY；TauIndian KB 第三方素材；FinToolBench UNKNOWN；Open Banking 授权页面异常。仓库不存原始案例或长段原文。"),
    ("精确文件？","见下方生成文件清单；来源 manifest 含逐文件 checksum。"),
    ]
    report+=table(["问题（覆盖请求中的 1–36 项）","答案/定位"],answers)
    report+="\n## 六域计数\n\n"+table(["域","总族","支持","部分","缺失","范围外/评测"],[(d,v["families"],v["support"].get("SUPPORTED",0),v["support"].get("PARTIALLY_SUPPORTED",0),v["support"].get("MISSING",0),v["support"].get("OUT_OF_SCOPE",0)) for d,v in domains.items()])
    report+="\n## 数据与判断的局限\n\n- 这是逐文件/逐记录静态审计，不是上游 benchmark 跑分。不会宣称 Aster Agent 通过任何任务。\n- 映射有显式人工规则；知识任务可支持多族，Indic 多工具按末端主要业务结果归类，完整 source IDs 保留以便后续复核。\n- 变体簇还需改写初态、工具适配和断言，不能把变体簇计数当 runnable case 数；最终以统计文件实际值为准。\n- SUPPORTED 是目标原语与手动流程可用；某个上游变体仍可能超出范围，例如虚拟卡发卡、永久停卡或外部支付清算。\n- 模拟和真实后端路径从当前源码核对；本轮未操作数据库或重新验证每条浏览器业务路径。\n\n"
    report+="## 完整性验证与合同\n\n受保护文件哈希逐项前后比较，详细结果见 `reports/validation.json`。本轮只新增 research 和研究文档；合同检查结果另见 validation。\n\n"
    validation_path=ROOT/"reports/validation.json"
    if validation_path.exists():
        validation=json.loads(validation_path.read_text(encoding="utf-8"))
        report+=f"最近一次审计校验：{validation['result']}，{validation['check_count']} 项检查通过；{validation['artifact_files_verified']:,} 个来源文件哈希核验；{validation['protected_files_unchanged']} 个受保护文件未变。`pnpm contract:check`：{validation['contract_check']['status']}。未运行应用回归或上游模型评测。\n\n"
    report+=table(["合同","本轮前文件字节 SHA-256"],[(p,h) for p,h in baseline.items() if p.endswith(("customer.yaml","public.yaml","freeze.json"))])
    report+="\n上表是原文件字节哈希；`contract:check` 使用冻结合同的规范化哈希，两者口径不同。\n\n"
    freeze=json.loads((PROJECT/"contracts/openapi/freeze.json").read_text(encoding="utf-8"))
    report+=table(["合同", "冻结规范化 SHA-256"],[(name,entry["sha256"]) for name,entry in freeze.items()])
    report+="\n## 交付文件\n\n"
    files=[p.relative_to(PROJECT).as_posix() for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    files += ["docs/research/banking-behavior-source-audit.md","docs/research/banking-behavior-coverage.md","docs/research/aster-capability-gap-analysis.md","docs/milestones/b0-report.md"]
    report+="\n".join("- `"+p+"`" for p in sorted(set(files)))+"\n\nNO APPLICATION CODE CHANGED.\nNO CONTRACT CHANGED.\nNO DATABASE SCHEMA CHANGED.\nNO AGENT IMPLEMENTED.\n\nSTOP AT B0.\n"
    md(PROJECT/"docs/milestones/b0-report.md",report)
    print("SOURCES INSPECTED:",len(notes),"RAW BANKING TASKS: 1912 + 9 attack goals; language 13083 separate")
    print("NORMALIZED UNIQUE FAMILIES:",len(families),"CANDIDATES:",len(candidates))
    for d,v in domains.items():print(d,v["families"],v["support"])
    print("ASTER CURRENT SUPPORT:",stats["support"])
    print("RECOMMENDED NEXT STEP: Review candidate mappings and missing primitives; no B1 implementation.")
    print("NO APPLICATION CODE CHANGED. NO CONTRACT CHANGED. NO DATABASE SCHEMA CHANGED. NO AGENT IMPLEMENTED. STOP AT B0.")

if __name__=="__main__":main()
