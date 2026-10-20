// Eight real browser conversations through CopilotKit, MCP, DeepSeek and the
// isolated Spring/PostgreSQL bank. Records only sanitized task metadata.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const web = "http://localhost:3003";
const bank = "http://localhost:18080";
const cases = [
  ["B01", "灵活储蓄的示例利率有保证吗？请引用资料。", "search_bank_knowledge"],
  ["B02", "银行卡丢了应该怎么处理？请查银行说明。", "search_bank_knowledge"],
  ["B03", "列出我的账户和可用余额。", "list_accounts"],
  ["B04", "我有哪些人民币账户？", "list_accounts"],
  ["B05", "列出我名下银行卡及状态。", "list_cards"],
  ["B06", "我目前的信用卡状态是什么？", "list_cards"],
  [
    "B07",
    "我的余额是多少？灵活储蓄利率有保证吗？分别核对账户和条款。",
    "list_accounts",
  ],
  [
    "B08",
    "我有哪些卡？卡片丢失该怎么处理？请核对真实卡状态和说明。",
    "list_cards",
  ],
];

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const [id, prompt, expected] of cases.filter(
    ([id]) =>
      !process.env.MCP_BROWSER_CASE || id === process.env.MCP_BROWSER_CASE,
  )) {
    const context = await browser.newContext();
    let page;
    const network = [];
    try {
      await context.request.get(`${bank}/customer/session`);
      const csrf = (await context.cookies()).find(
        (item) => item.name === "XSRF-TOKEN",
      )?.value;
      if (!csrf) throw new Error("CSRF bootstrap failed");
      const login = await context.request.post(`${bank}/customer/auth/login`, {
        data: {
          email: "alex@aster.local",
          password: process.env.ASTER_DEMO_PASSWORD ?? "demo-password",
        },
        headers: { "X-XSRF-TOKEN": csrf },
      });
      if (login.status() !== 200)
        throw new Error(`Login HTTP ${login.status()}`);
      await context.request.get(`${bank}/customer/session`);
      const before = await (
        await context.request.get(`${bank}/customer/accounts`)
      ).json();
      page = await context.newPage();
      page.on("response", (response) => {
        if (response.status() >= 400)
          network.push(`${response.status()} ${response.url()}`);
      });
      page.on("requestfailed", (request) =>
        network.push(`${request.failure()?.errorText} ${request.url()}`),
      );
      page.on("pageerror", (error) =>
        network.push(`pageerror ${error.message}`),
      );
      await page.goto(`${web}/app/agent-copilot`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("heading", { name: /Aster banking assistant|智能银行助手/ })
        .waitFor({ timeout: 20000 });
      const run = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            "/api/copilotkit/agent/aster/run",
        { timeout: 180000 },
      );
      await page
        .getByRole("textbox", { name: /Your message|你的消息/ })
        .fill(prompt);
      await page.getByRole("button", { name: /Send|发送/ }).click();
      const runResponse = await run;
      let task;
      for (let attempt = 0; attempt < 300; attempt++) {
        const state = await (
          await context.request.get(`${web}/api/copilotkit/thread-state`)
        ).json();
        if (state.task?.taskId) {
          task = await (
            await context.request.get(
              `${web}/api/agent/tasks/${state.task.taskId}`,
            )
          ).json();
          if (task?.status && task.status !== "RUNNING") break;
        }
        await delay(400);
      }
      const tools = (task?.steps ?? []).map((step) => step.tool);
      const after = await (
        await context.request.get(`${bank}/customer/accounts`)
      ).json();
      if (tools.includes("search_bank_knowledge"))
        await page
          .getByRole("region", { name: "Knowledge sources" })
          .waitFor({ timeout: 12000 })
          .catch(() => {});
      const row = {
        id,
        status: task?.status ?? "NO_TASK",
        run_http: runResponse.status(),
        tools,
        expected_tool_seen: tools.includes(expected),
        balances_unchanged: JSON.stringify(before) === JSON.stringify(after),
        source_card_visible:
          (await page
            .getByRole("region", { name: "Knowledge sources" })
            .count()) > 0,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      const row = {
        id,
        status: "ERROR",
        error: String(error).slice(0, 300),
        url: page?.url(),
        body_excerpt: page
          ? (
              await page
                .locator("body")
                .innerText()
                .catch(() => "")
            ).slice(0, 350)
          : "",
        network: network.slice(0, 12),
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(
  "artifacts/p1-p2-mcp-browser-smoke.json",
  JSON.stringify({ cases: rows }, null, 2),
);
if (
  rows.some(
    (row) =>
      row.status !== "SUCCEEDED" ||
      !row.expected_tool_seen ||
      !row.balances_unchanged,
  )
)
  process.exitCode = 1;
