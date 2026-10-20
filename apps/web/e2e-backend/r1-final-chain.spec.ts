import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { completeVerification } from "../e2e-shared/verification";

const origin = process.env.ASTER_E2E_WEB_ORIGIN ?? "http://127.0.0.1:18089";

test("R1 real-model card, mandate and transfer chain confirms each action", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ baseURL: origin });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Sign in to demo" }).click();
    await expect(page).toHaveURL(/\/$/);

    const accountBalance = async () => {
      const response = await context.request.get("/customer/accounts");
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        accounts: { id: string; balance: { amount: string } }[];
      };
      return body.accounts.find((item) => item.id === "acc_current")?.balance
        .amount;
    };
    const before = await accountBalance();
    await page.goto("/app/agent-copilot");
    await page
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill(
        "先锁定我的尾号1937银行卡，然后取消 Rent 银行代扣，最后给张三转100元。",
      );
    await page.getByRole("button", { name: /send|发送/i }).click();
    const review = page.getByRole("region", { name: "Bank action review" });
    await expect(review).toContainText("CARD_ACTION", { timeout: 120_000 });
    console.log("R1 chain: card prepared");
    expect(await accountBalance()).toBe(before);
    await review
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click({ timeout: 20_000 });

    await expect(review).toContainText("RECURRING_STOP", { timeout: 120_000 });
    console.log("R1 chain: card confirmed, mandate prepared");
    expect(await accountBalance()).toBe(before);
    if (process.env.ASTER_E2E_RESTART_AGENT_CONTAINER) {
      const priorResponse = await context.request.get(
        "/api/copilotkit/thread-state",
      );
      expect(priorResponse.status()).toBe(200);
      const prior = (await priorResponse.json()) as {
        task: { taskId: string; status: string };
      };
      expect(prior.task.status).toBe("WAITING_CONFIRMATION");
      const priorTaskResponse = await context.request.get(
        `/api/agent/tasks/${prior.task.taskId}`,
      );
      expect(priorTaskResponse.status()).toBe(200);
      const priorTask = (await priorTaskResponse.json()) as {
        confirmation: { id: string };
      };
      execFileSync(
        "docker",
        ["restart", process.env.ASTER_E2E_RESTART_AGENT_CONTAINER],
        {
          timeout: 30_000,
          stdio: "ignore",
        },
      );
      await expect
        .poll(
          async () =>
            (
              await context.request.get("/api/copilotkit/thread-state")
            ).status(),
          { timeout: 30_000 },
        )
        .toBe(200);
      await page.reload();
      await expect(review).toContainText("RECURRING_STOP", { timeout: 30_000 });
      const resumedResponse = await context.request.get(
        "/api/copilotkit/thread-state",
      );
      const resumed = (await resumedResponse.json()) as {
        task: { taskId: string; status: string };
      };
      const resumedTaskResponse = await context.request.get(
        `/api/agent/tasks/${resumed.task.taskId}`,
      );
      const resumedTask = (await resumedTaskResponse.json()) as {
        confirmation: { id: string };
      };
      expect(resumed.task.taskId).toBe(prior.task.taskId);
      expect(resumed.task.status).toBe("WAITING_CONFIRMATION");
      expect(resumedTask.confirmation.id).toBe(priorTask.confirmation.id);
      console.log("R1 chain: restart preserved task and mandate intent");
    }
    await review
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click({ timeout: 20_000 });
    await completeVerification(page);

    await expect(review).toContainText("TRANSFER", { timeout: 120_000 });
    console.log("R1 chain: mandate confirmed, transfer prepared");
    expect(await accountBalance()).toBe(before);
    await review
      .getByRole("button", { name: /verify and confirm|核对并确认/i })
      .click({ timeout: 20_000 });
    await completeVerification(page);

    await expect(
      page.getByRole("status", { name: "Task progress" }),
    ).toContainText(/Completed|已完成/, { timeout: 120_000 });
    const state = await context.request.get("/api/copilotkit/thread-state");
    expect(state.status()).toBe(200);
    const body = (await state.json()) as {
      task: { status: string; completedActionCount: number };
    };
    expect(body.task.status).toBe("SUCCEEDED");
    expect(body.task.completedActionCount).toBe(3);
    console.log("R1 chain: three bank actions confirmed, task succeeded");

    const card = await context.request.get("/customer/cards/card_aster_credit");
    const mandate = await context.request.get(
      "/customer/recurring-payments/rec_rent",
    );
    expect(card.status()).toBe(200);
    expect(mandate.status()).toBe(200);
    expect((await card.json()).status).toBe("FROZEN");
    expect((await mandate.json()).status).toBe("STOPPED");
    expect(Number(await accountBalance())).toBe(Number(before) - 100);
  } finally {
    await context.close();
  }
});
