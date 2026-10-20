import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const origin = "http://localhost:3100";
const web = resolve("apps/web");
const standalone = resolve("apps/web/.next/standalone/apps/web");
const session = {
  id: "fixture",
  authenticated: true,
  user: { id: "fixture", name: "Fixture User", email: "fixture@example.test" },
  status: "ACTIVE",
  assuranceLevel: "AAL1",
  authenticatedAt: "2026-10-12T00:00:00Z",
  expiresAt: "2026-10-13T00:00:00Z",
  mode: "SIMULATED_AUTH",
};

function listen(port, handler) {
  const server = createServer(handler);
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveListen(server));
  });
}

const servers = [];
let agentCalls = 0;
let confirmCalls = 0;
let child;
let browser;
try {
  servers.push(
    await listen(18080, (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      if (
        request.url === "/customer/session" &&
        /SESSION=(fixture|bob)/.test(request.headers.cookie ?? "")
      ) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify(
            request.headers.cookie?.includes("SESSION=bob")
              ? {
                  ...session,
                  id: "bob",
                  user: { ...session.user, id: "bob", name: "Bob" },
                }
              : session,
          ),
        );
      } else {
        response.writeHead(401);
        response.end();
      }
    }),
  );
  servers.push(
    await listen(18001, async (request, response) => {
      if (!/SESSION=(fixture|bob)/.test(request.headers.cookie ?? "")) {
        response.writeHead(401);
        response.end();
        return;
      }
      if (
        request.url === `/agent/tasks/${"b".repeat(32)}` &&
        request.method === "GET"
      ) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            task_id: "b".repeat(32),
            status: "WAITING_CONFIRMATION",
            mode: "DEEPSEEK",
            message: "Review reminder",
            steps: [],
            confirmation_required: true,
            confirmation: {
              id: "reminder-fixture",
              intentHash: "c".repeat(64),
              patternReference: "subscription-fixture",
              actionType: "CREATE",
              expiresAt: "2026-10-13T00:00:00Z",
            },
            options: [],
          }),
        );
        return;
      }
      if (
        request.url === `/agent/tasks/${"b".repeat(32)}/confirm` &&
        request.method === "POST"
      ) {
        let body = "";
        for await (const part of request) body += part;
        const confirmation = JSON.parse(body);
        if (
          confirmation.intent_id !== "reminder-fixture" ||
          confirmation.intent_hash !== "c".repeat(64)
        ) {
          response.writeHead(400);
          response.end();
          return;
        }
        confirmCalls += 1;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            task_id: "b".repeat(32),
            status: "SUCCEEDED",
            mode: "DEEPSEEK",
            message: "Reminder created",
            steps: [],
            confirmation_required: false,
            options: [],
          }),
        );
        return;
      }
      if (request.url !== "/agent/ag-ui") {
        response.writeHead(404);
        response.end();
        return;
      }
      let raw = "";
      for await (const part of request) raw += part;
      const input = JSON.parse(raw);
      agentCalls += 1;
      const reminder = input.messages?.at(-1)?.content === "Set a reminder";
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        {
          type: "TOOL_CALL_START",
          toolCallId: "tool-1",
          toolCallName: reminder ? "prepare_renewal_reminder" : "list_accounts",
        },
        {
          type: "TOOL_CALL_ARGS",
          toolCallId: "tool-1",
          delta: '{"redacted":true}',
        },
        { type: "TOOL_CALL_END", toolCallId: "tool-1" },
        {
          type: "TOOL_CALL_RESULT",
          messageId: "result-1",
          toolCallId: "tool-1",
          content: "Completed",
          role: "tool",
        },
        {
          type: "STATE_SNAPSHOT",
          snapshot: {
            taskId: reminder ? "b".repeat(32) : "a".repeat(32),
            status: reminder ? "WAITING_CONFIRMATION" : "SUCCEEDED",
            confirmationRequired: reminder,
          },
        },
        {
          type: "TEXT_MESSAGE_START",
          messageId: "answer-1",
          role: "assistant",
        },
        {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: "answer-1",
          delta: reminder
            ? "Review reminder before bank submission"
            : request.headers.cookie?.includes("SESSION=bob")
              ? "Bob balance answer"
              : "Fixture balance answer",
        },
        { type: "TEXT_MESSAGE_END", messageId: "answer-1" },
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
      ];
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      });
      for (const event of events)
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      response.end();
    }),
  );
  mkdirSync(resolve(standalone, ".next/static"), { recursive: true });
  cpSync(resolve(web, ".next/static"), resolve(standalone, ".next/static"), {
    recursive: true,
  });
  cpSync(resolve(web, "public"), resolve(standalone, "public"), {
    recursive: true,
  });
  child = spawn(process.execPath, [resolve(standalone, "server.js")], {
    cwd: standalone,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: "3100",
      HOSTNAME: "127.0.0.1",
      AGENT_UI_V2_ENABLED: "true",
      ASTER_BANKING_CORE_URL: "http://127.0.0.1:18080",
      ASTER_AGENT_RUNTIME_URL: "http://127.0.0.1:18001",
      COPILOTKIT_TELEMETRY_DISABLED: "true",
    },
  });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (
      await fetch(origin)
        .then(() => true)
        .catch(() => false)
    ) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready) throw new Error("Next server did not start");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "SESSION",
      value: "fixture",
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/app/agent-copilot`);
  try {
    await page
      .getByRole("heading", { name: /Aster banking assistant|智能银行助手/ })
      .waitFor({ timeout: 15000 });
  } catch (cause) {
    console.error(
      "Browser URL",
      page.url(),
      "body",
      (await page.locator("body").innerText()).slice(0, 700),
      "errors",
      errors,
    );
    throw cause;
  }
  await page
    .getByRole("textbox", { name: /Your message|你的消息/ })
    .fill("Show my balance");
  await page.getByRole("button", { name: /Send|发送/ }).click();
  await page.getByText("Fixture balance answer").waitFor({ timeout: 20000 });
  await page.reload();
  await page.getByText("Fixture balance answer").waitFor({ timeout: 10000 });
  if (agentCalls !== 1)
    throw new Error(`Refresh repeated Agent execution: ${agentCalls}`);
  await context.addCookies([
    {
      name: "SESSION",
      value: "bob",
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
  await page.reload();
  await page
    .getByRole("heading", { name: /Aster banking assistant|智能银行助手/ })
    .waitFor();
  if (await page.getByText("Fixture balance answer").count())
    throw new Error("Cross-session transcript leaked");
  await page
    .getByRole("textbox", { name: /Your message|你的消息/ })
    .fill("Show my balance");
  await page.getByRole("button", { name: /Send|发送/ }).click();
  await page.getByText("Bob balance answer").waitFor({ timeout: 20000 });
  if (agentCalls !== 2)
    throw new Error(`Unexpected Agent executions: ${agentCalls}`);
  await page
    .getByRole("textbox", { name: /Your message|你的消息/ })
    .fill("Set a reminder");
  await page.getByRole("button", { name: /Send|发送/ }).click();
  const confirm = page.getByRole("button", {
    name: /Confirm reminder|确认提醒操作/,
  });
  await confirm.waitFor({ timeout: 10000 });
  if (confirmCalls !== 0)
    throw new Error("Reminder confirmed without user action");
  await confirm.click();
  for (let attempt = 0; attempt < 40 && confirmCalls === 0; attempt++)
    await delay(100);
  if (confirmCalls !== 1)
    throw new Error(`Expected one trusted confirmation, saw ${confirmCalls}`);
  await page
    .getByRole("status", { name: "Task progress" })
    .getByText(/Completed|已完成/)
    .waitFor({ timeout: 10000 });
  await page
    .getByRole("textbox", { name: /Your message|你的消息/ })
    .fill("Show my balance again");
  await page.getByRole("button", { name: /Send|发送/ }).click();
  for (let attempt = 0; attempt < 40 && agentCalls < 4; attempt++)
    await delay(100);
  if (agentCalls !== 4)
    throw new Error(`New turn after confirmation was not sent: ${agentCalls}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(
    "AG-UI browser fixture PASS: run/tool, refresh, cross-session isolation, trusted reminder confirmation, later turn",
  );
} finally {
  await browser?.close();
  child?.kill();
  for (const server of servers) await new Promise((done) => server.close(done));
}
