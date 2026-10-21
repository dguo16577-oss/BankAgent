# RC demo script — gated single-Agent demonstration

2026-10-21. **The full RC demonstration is not accepted.** Multi-Agent stays off. Do not perform the financial fault scripts on the retained bank.

## Start and verify

Use the existing `start.cmd` / `start.ps1` and `START-README.md`. Wait until its resource checks pass. For the retained stack:

```powershell
& .\start.ps1 start -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge -NoBuild
```

This starts the images currently under the deployment tags. First verify actual image IDs and compare with the closure report; this command alone does not prove the source fix was deployed. Never use `down -v`.

Intended addresses, only usable after successful service restoration:

- Bank: http://127.0.0.1:18088/
- Copilot: http://127.0.0.1:18088/app/agent-copilot
- Legacy: http://127.0.0.1:18088/app/agent

## Bounded demo sequence

1. Log in with documented simulator credentials. Check account/transaction pages.
2. On single-Agent Copilot, ask for account balance and recent transactions. Check tool results and amounts. If the original DeepSeek route cannot connect, stop model demonstrations and explicitly show the error; do not substitute scripted text as a real answer.
3. Ask for category spending and switch table/chart. Do not claim AB17 until real request counts are recorded.
4. Ask a bank policy question and expand actual source/version. Health checks alone do not satisfy MCP/RAG acceptance.
5. Ask where the transfer page is. Navigation must not create a financial intent.
6. On a disposable bank only, ask “给张三转100元，再给李四转200元。” Both goals must remain visible. Each stage requires separate review/authorization; preparation never means execution. Stop at PREPARE or cancel unless a dedicated side-effect test is explicitly underway.
7. Separately cancel one pending action and verify the other goal is retained; cancel the whole task using its distinct control when finished.
8. Read-only history after re-login: no old token/hash/grant may be exposed or re-enabled. This demo remains blocked until the final receipt gateway correction is built and verified in the actual browser.
9. Do not demonstrate multi-Agent as stable: MA01 latest completed multi comparison failed; MA03/06 latest attempts were transport blocked.

## Rollback

Old images and both databases are retained. After saving current tags, restore the pre-closure tags and use the same start script:

```powershell
docker image tag aster-web:rc-final-20261021 aster-web:v1.1-dev
docker image tag aster-agent-runtime:rc-final-20261021 aster-agent-runtime:v1.1-dev
& .\start.ps1 restart -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge -NoBuild
```

Rollback does not erase data or make old outstanding S1/R1 gaps disappear. Resource/network failures are blockers, not permission to skip guards.
