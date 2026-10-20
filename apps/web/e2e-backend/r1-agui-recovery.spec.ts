import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const webOrigin = process.env.ASTER_E2E_WEB_ORIGIN ?? "http://localhost:18088";

test("AG-UI reload restores the same prepared bank action without a debit", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: webOrigin });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Sign in to demo" }).click();
    await expect(page).toHaveURL(/\/$/);

    const balance = async () => {
      const response = await context.request.get("/customer/accounts");
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        accounts: { id: string; balance: { amount: string } }[];
      };
      return body.accounts.find((account) => account.id === "acc_current")
        ?.balance.amount;
    };
    const before = await balance();

    await page.goto("/app/agent-copilot");
    await expect(
      page.getByRole("heading", { name: /banking assistant|智能银行助手/i }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill("Transfer 1 CNY to Lin Wei");
    await page.getByRole("button", { name: /send|发送/i }).click();
    await expect(
      page.getByRole("region", { name: "Bank action review" }),
    ).toBeVisible({ timeout: 120_000 });

    const stateResponse = await context.request.get(
      "/api/copilotkit/thread-state",
    );
    expect(stateResponse.status()).toBe(200);
    const state = (await stateResponse.json()) as {
      task: { taskId: string; status: string };
    };
    expect(state.task.status).toBe("WAITING_CONFIRMATION");
    expect(await balance()).toBe(before);

    await page.reload();
    await expect(
      page.getByRole("region", { name: "Bank action review" }),
    ).toBeVisible({ timeout: 30_000 });
    const recoveredResponse = await context.request.get(
      "/api/copilotkit/thread-state",
    );
    expect(recoveredResponse.status()).toBe(200);
    const recovered = (await recoveredResponse.json()) as {
      task: { taskId: string; status: string };
    };
    expect(recovered.task.taskId).toBe(state.task.taskId);
    expect(recovered.task.status).toBe("WAITING_CONFIRMATION");
    expect(await balance()).toBe(before);

    if (process.env.ASTER_E2E_RESTART_AGENT === "1") {
      execFileSync(
        "docker",
        ["restart", "aster-acceptance-20261012-agent-runtime-1"],
        {
          timeout: 30_000,
          stdio: "ignore",
        },
      );
      await expect
        .poll(
          async () => {
            const response = await context.request.get(
              "/api/copilotkit/thread-state",
            );
            return response.status();
          },
          { timeout: 30_000 },
        )
        .toBe(200);
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Bank action review" }),
      ).toBeVisible({ timeout: 30_000 });
      const restartedResponse = await context.request.get(
        "/api/copilotkit/thread-state",
      );
      const restarted = (await restartedResponse.json()) as {
        task: { taskId: string; status: string };
      };
      expect(restarted.task.taskId).toBe(state.task.taskId);
      expect(restarted.task.status).toBe("WAITING_CONFIRMATION");
      expect(await balance()).toBe(before);
    }
  } finally {
    await context.close();
  }
});

test("AG-UI recovers a read task after its live stream disconnects", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: webOrigin });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Sign in to demo" }).click();
    await expect(page).toHaveURL(/\/$/);
    const accountsBefore = await context.request.get("/customer/accounts");
    expect(accountsBefore.status()).toBe(200);
    const originalAccounts = await accountsBefore.json();

    await page.goto("/app/agent-copilot");
    await expect(
      page.getByRole("heading", { name: /banking assistant|智能银行助手/i }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /your message|你的消息/i })
      .fill(
        "Query my accounts, cards, spending this month, and investment holdings.",
      );
    const stream = page.waitForRequest(
      (request) =>
        request.url().includes("/api/copilotkit") &&
        request.method() === "POST",
    );
    await page.getByRole("button", { name: /send|发送/i }).click();
    await stream;
    let observedTaskId = "";
    await expect
      .poll(
        async () => {
          const response = await context.request.get(
            "/api/copilotkit/thread-state",
          );
          if (!response.ok()) return "";
          const value = (await response.json()) as {
            task?: { taskId?: string; status?: string };
          };
          observedTaskId =
            value.task?.status === "RUNNING" ? (value.task.taskId ?? "") : "";
          return observedTaskId;
        },
        { timeout: 30_000 },
      )
      .not.toBe("");

    await context.setOffline(true);
    await page.waitForTimeout(1000);
    await context.setOffline(false);
    await page.reload();
    await expect
      .poll(
        async () => {
          const response = await context.request.get(
            "/api/copilotkit/thread-state",
          );
          if (!response.ok()) return "HTTP_ERROR";
          const value = (await response.json()) as {
            task?: { taskId?: string; status?: string };
          };
          if (value.task?.taskId !== observedTaskId) return "WRONG_TASK";
          return value.task.status ?? "NO_STATUS";
        },
        { timeout: 90_000 },
      )
      .toBe("SUCCEEDED");
    await expect(page.getByText(/CNY Current/).first()).toBeVisible({
      timeout: 30_000,
    });
    const accountsAfter = await context.request.get("/customer/accounts");
    expect(accountsAfter.status()).toBe(200);
    expect(await accountsAfter.json()).toEqual(originalAccounts);
  } finally {
    await context.close();
  }
});
