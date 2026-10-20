import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { completeVerification } from "../e2e-shared/verification";

const origin = process.env.ASTER_E2E_WEB_ORIGIN ?? "http://127.0.0.1:18096";
const postgres = process.env.ASTER_E2E_POSTGRES_CONTAINER;

test("R10 bank rejection preserves first action and stops later transfer", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  if (!postgres) throw new Error("Isolated PostgreSQL container is required");
  const context = await browser.newContext({ baseURL: origin });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Sign in to demo" }).click();
    await expect(page).toHaveURL(/\/$/);

    const balance = async () => {
      const response = await context.request.get("/customer/accounts");
      const body = (await response.json()) as {
        accounts: { id: string; balance: { amount: string } }[];
      };
      return body.accounts.find((item) => item.id === "acc_current")?.balance
        .amount;
    };
    const before = await balance();
    await page.goto("/app/agent-copilot");
    await page
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill(
        "先锁定我的尾号1937银行卡，然后取消 Rent 银行代扣，最后给张三转100元。",
      );
    await page.getByRole("button", { name: /send|发送/i }).click();
    const review = page.getByRole("region", { name: "Bank action review" });
    await expect(review).toContainText("CARD_ACTION", { timeout: 120_000 });
    await review
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click();
    await expect(review).toContainText("RECURRING_STOP", { timeout: 120_000 });

    const stateResponse = await context.request.get(
      "/api/copilotkit/thread-state",
    );
    const state = (await stateResponse.json()) as {
      task: { taskId: string; status: string };
    };
    expect(state.task.status).toBe("WAITING_CONFIRMATION");
    const taskResponse = await context.request.get(
      `/api/agent/tasks/${state.task.taskId}`,
    );
    const task = (await taskResponse.json()) as {
      confirmation: { id: string };
    };
    console.log("R10: first card action confirmed; mandate intent prepared");

    const changed = execFileSync(
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
        "update recurring_payments set status='STOPPED', next_expected_at=null, business_version=business_version+1 where recurring_payment_id='rec_rent' and status='ACTIVE' returning status",
      ],
      { encoding: "utf8", timeout: 15_000 },
    ).trim();
    expect(changed).toContain("STOPPED");
    console.log("R10: bank mandate changed before old intent confirmation");

    await review
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click();
    await completeVerification(page);
    await expect
      .poll(
        async () => {
          const response = await context.request.get(
            `/api/agent/tasks/${state.task.taskId}`,
          );
          const current = (await response.json()) as { status: string };
          return current.status;
        },
        { timeout: 30_000 },
      )
      .toMatch(/PARTIAL|FAILED|BLOCKED_PROVIDER/);
    const finalResponse = await context.request.get(
      `/api/agent/tasks/${state.task.taskId}`,
    );
    const final = (await finalResponse.json()) as {
      status: string;
      completed_actions: unknown[];
      failed_actions: unknown[];
      message: string;
    };
    expect(final.status).toBe("PARTIAL");
    expect(final.completed_actions).toHaveLength(1);
    expect(final.failed_actions).toHaveLength(1);
    await expect(
      page.getByRole("status", { name: "Task progress" }),
    ).toContainText(/Partially completed|部分完成/);
    await expect(page.getByLabel("Bank task result")).toContainText(/银行拒绝/);
    await expect(review).toHaveCount(0);
    const bankCard = await context.request.get(
      "/customer/cards/card_aster_credit",
    );
    expect((await bankCard.json()).status).toBe("FROZEN");
    expect(await balance()).toBe(before);
    const transferCount = execFileSync(
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
        "select count(*) from transfers where customer_id='usr_aster_alex'",
      ],
      { encoding: "utf8", timeout: 15_000 },
    ).trim();
    expect(transferCount).toBe("0");
    const intent = await context.request.get(
      `/customer/recurring-payment-action-intents/${task.confirmation.id}`,
    );
    expect((await intent.json()).status).not.toBe("EXECUTED");
    console.log(
      "R10: PARTIAL, first action retained, second rejected, no transfer",
    );
  } finally {
    await context.close();
  }
});
