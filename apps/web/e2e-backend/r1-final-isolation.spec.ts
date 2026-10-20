import { execFileSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { completeVerification } from "../e2e-shared/verification";

const origin = process.env.ASTER_E2E_WEB_ORIGIN ?? "http://127.0.0.1:18102";
const agentOrigin =
  process.env.ASTER_E2E_AGENT_ORIGIN ?? "http://127.0.0.1:18103";
const postgres = process.env.ASTER_E2E_POSTGRES_CONTAINER;

function sql(statement: string) {
  if (!postgres) throw new Error("Isolated PostgreSQL container is required");
  return execFileSync(
    "docker",
    [
      "exec",
      postgres,
      "psql",
      "-U",
      "asterbank",
      "-d",
      "asterbank",
      "-Atc",
      statement,
    ],
    {
      encoding: "utf8",
      timeout: 15_000,
    },
  ).trim();
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in to demo" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function amount(context: BrowserContext, id: string) {
  const response = await context.request.get("/customer/accounts");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    accounts: { id: string; balance: { amount: string } }[];
  };
  return Number(
    body.accounts.find((account) => account.id === id)?.balance.amount,
  );
}

test("R12 two customers advance independently with owned bank and Agent state", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Add only to this disposable PostgreSQL fixture: one Lin card and one Lin-owned
  // recipient routed to Alex. No production or original-project state is touched.
  sql(
    "insert into cards(card_id,customer_id,display_name,masked_number,scheme,card_type,status,linked_account_id,linked_account_name,linked_account_masked_number,online_payments,international_payments,atm_withdrawals,contactless,business_version,row_version,display_order,updated_at) select 'card_lin_r12','usr_aster_lin','Lin Demo Debit','••9944','VISA','DEBIT','ACTIVE','acc_lin_current','Lin Current','•••• 6201',true,false,true,true,0,0,1,current_timestamp where not exists(select 1 from cards where card_id='card_lin_r12')",
  );
  sql(
    "insert into recipients(recipient_id,customer_id,display_name,bank_name,masked_identifier,currency,destination_ref,status,created_at,version) values('recipient_alex_r12','usr_aster_lin','Alex Chen','Aster Demo Bank','•••• 1048','CNY','demo-alex-r12','ACTIVE',current_timestamp,0) on conflict do nothing",
  );
  sql(
    "insert into demo_internal_destinations(destination_ref,target_customer_id,target_account_id) values('demo-alex-r12','usr_aster_alex','acc_current') on conflict do nothing",
  );

  const alex = await browser.newContext({ baseURL: origin });
  const lin = await browser.newContext({ baseURL: origin });
  try {
    const a = await alex.newPage();
    const b = await lin.newPage();
    await Promise.all([
      login(a, "alex@aster.local"),
      login(b, "lin@aster.local"),
    ]);
    const alexBefore = await amount(alex, "acc_current");
    const linBefore = await amount(lin, "acc_lin_current");
    await Promise.all([
      a.goto("/app/agent-copilot"),
      b.goto("/app/agent-copilot"),
    ]);
    await a
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill("锁定我的尾号8821银行卡，然后查看最近交易。");
    await b
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill("给 Alex Chen 转100元，然后查询余额。");
    await Promise.all([
      a.getByRole("button", { name: /send|发送/i }).click(),
      b.getByRole("button", { name: /send|发送/i }).click(),
    ]);
    const aReview = a.getByRole("region", { name: "Bank action review" });
    const bReview = b.getByRole("region", { name: "Bank action review" });
    await Promise.all([
      expect(aReview).toContainText("CARD_ACTION", { timeout: 120_000 }),
      expect(bReview).toContainText("TRANSFER", { timeout: 120_000 }),
    ]);
    const aState = (await (
      await alex.request.get("/api/copilotkit/thread-state")
    ).json()) as { task: { taskId: string; status: string } };
    const bState = (await (
      await lin.request.get("/api/copilotkit/thread-state")
    ).json()) as { task: { taskId: string; status: string } };
    expect(aState.task.taskId).not.toBe(bState.task.taskId);
    expect(
      (
        await lin.request.get(`/api/agent/tasks/${aState.task.taskId}`)
      ).status(),
    ).not.toBe(200);
    expect(
      (
        await alex.request.get(`/api/agent/tasks/${bState.task.taskId}`)
      ).status(),
    ).not.toBe(200);
    const aIntent = (await (
      await alex.request.get(`/api/agent/tasks/${aState.task.taskId}`)
    ).json()) as { confirmation: { id: string } };
    expect(
      (
        await lin.request.get(
          `/customer/card-action-intents/${aIntent.confirmation.id}`,
        )
      ).status(),
    ).not.toBe(200);
    expect(
      (await lin.request.get("/customer/cards/card_aster_debit")).status(),
    ).not.toBe(200);
    expect(
      (await alex.request.get("/customer/cards/card_lin_r12")).status(),
    ).not.toBe(200);
    const aThread = sql(
      `select thread_id from agent_state.threads where task_id='${aState.task.taskId}'`,
    );
    const bThread = sql(
      `select thread_id from agent_state.threads where task_id='${bState.task.taskId}'`,
    );
    expect(aThread).not.toBe(bThread);
    const foreignA = await lin.request.get(
      `${agentOrigin}/agent/ag-ui/thread-state/${aThread}`,
    );
    const foreignB = await alex.request.get(
      `${agentOrigin}/agent/ag-ui/thread-state/${bThread}`,
    );
    expect(foreignA.status()).toBe(200);
    expect(foreignB.status()).toBe(200);
    expect((await foreignA.json()).task).toBeNull();
    expect((await foreignB.json()).task).toBeNull();
    console.log(
      "R12: distinct tasks, threads and intents; cross-customer reads denied",
    );

    await aReview
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click();
    await expect(
      a.getByRole("status", { name: "Task progress" }),
    ).toContainText(/Completed|已完成/, { timeout: 120_000 });
    await bReview
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click();
    await completeVerification(b);
    await expect(
      b.getByRole("status", { name: "Task progress" }),
    ).toContainText(/Completed|已完成/, { timeout: 120_000 });
    expect(
      sql("select status from cards where card_id='card_aster_debit'"),
    ).toBe("FROZEN");
    expect(sql("select status from cards where card_id='card_lin_r12'")).toBe(
      "ACTIVE",
    );
    expect(
      sql("select count(*) from transfers where customer_id='usr_aster_lin'"),
    ).toBe("1");
    expect(await amount(alex, "acc_current")).toBe(alexBefore + 100);
    expect(await amount(lin, "acc_lin_current")).toBe(linBefore - 100);
    console.log(
      "R12: two independent goals completed; one transfer; no cross-customer card change",
    );
  } finally {
    await alex.close();
    await lin.close();
  }
});

test("R12 two tabs cannot debit twice for the same prepared transfer", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: origin });
  try {
    const first = await context.newPage();
    await login(first, "alex@aster.local");
    const before = await amount(context, "acc_current");
    const transferCountBefore = Number(
      sql("select count(*) from transfers where customer_id='usr_aster_alex'"),
    );
    await first.goto("/app/agent-copilot");
    await first
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill("给 Lin Wei 转10元。");
    await first.getByRole("button", { name: /send|发送/i }).click();
    const firstReview = first.getByRole("region", {
      name: "Bank action review",
    });
    await expect(firstReview).toContainText("TRANSFER", { timeout: 120_000 });
    const second = await context.newPage();
    await second.goto("/app/agent-copilot");
    const secondReview = second.getByRole("region", {
      name: "Bank action review",
    });
    await expect(secondReview).toContainText("TRANSFER", { timeout: 30_000 });
    await Promise.all([
      firstReview
        .getByRole("button", { name: /verify and confirm|核对并确认/i })
        .click(),
      secondReview
        .getByRole("button", { name: /verify and confirm|核对并确认/i })
        .click(),
    ]);
    await Promise.allSettled([
      completeVerification(first),
      completeVerification(second),
    ]);
    await expect
      .poll(
        () =>
          Number(
            sql(
              "select count(*) from transfers where customer_id='usr_aster_alex'",
            ),
          ),
        {
          timeout: 30_000,
        },
      )
      .toBe(transferCountBefore + 1);
    expect(await amount(context, "acc_current")).toBe(before - 10);
    console.log(
      "R12: two browser tabs confirmed one intent; exactly one transfer and 10 CNY debit",
    );
  } finally {
    await context.close();
  }
});
