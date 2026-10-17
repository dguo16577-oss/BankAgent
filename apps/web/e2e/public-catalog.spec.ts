import { test, expect } from "@playwright/test";
import { signIn } from "./authenticated-test";
for (const width of [320, 390, 768, 1440]) {
  test(`M10 anonymous catalog and knowledge journey at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/customer/"))
        requests.push(r.url());
    });
    const fits = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    const shot = async (name: string) => {
      await fits();
      await page.screenshot({
        path: `docs/screenshots/m10-${name}-${width}.png`,
        fullPage: name !== "search",
        animations: "disabled",
        style: "nextjs-portal {display:none!important}",
      });
    };
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Everyday banking, built around you.",
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Explore banking", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Banking", exact: true }),
    ).toBeVisible();
    await shot("banking");
    await page
      .getByRole("link", { name: "Explore Flexible Savings", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Flexible Savings", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: "CNY 0 per month" }),
    ).toBeVisible();
    await shot("savings");
    await page
      .getByRole("link", { name: "Explore Everyday Account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/products\/everyday-account$/);
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", {
        name: "Cards Find a card for your everyday life.",
        exact: false,
      })
      .click();
    await page
      .getByRole("link", { name: "Compare cards", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Compare cards", level: 1 }),
    ).toBeVisible();
    const boxes = page.getByRole("checkbox");
    await expect(boxes).toHaveCount(4);
    for (let i = 0; i < 3; i++) await boxes.nth(i).check();
    await expect(boxes.nth(3)).toBeDisabled();
    await expect(
      page.getByText("CNY 300 example", { exact: true }),
    ).toBeVisible();
    await shot("compare");
    await page.goto("/");
    await page.getByRole("button", { name: "Search public website" }).click();
    const dialog = page.getByRole("dialog", { name: "Search Aster" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Search public website" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Search public website" }).click();
    await dialog.getByRole("searchbox").fill("lost card");
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      dialog.getByRole("link", { name: "What to do if your card is lost" }),
    ).toBeVisible();
    await shot("search");
    await dialog
      .getByRole("link", { name: "What to do if your card is lost" })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "What to do if your card is lost",
        level: 1,
      }),
    ).toBeVisible();
    await shot("support-detail");
    expect(
      requests.every((url) => new URL(url).pathname === "/customer/session"),
    ).toBe(true);
    await signIn(page);
    const loggedOutSession = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/customer/session" && r.status() === 401,
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await loggedOutSession;
    requests.length = 0;
    await page.goto("/rates");
    await expect(
      page.getByText("Illustrative demo rates, not live quotes."),
    ).toBeVisible();
    await expect(page.getByText(/Source: DEMO_RATE/)).toBeVisible();
    await shot("rates");
    await page.goto("/support");
    await page
      .getByRole("searchbox", { name: "Search support" })
      .fill("pending");
    await expect(
      page.getByRole("link", {
        name: "Explore Understanding pending card payments",
      }),
    ).toBeVisible();
    await shot("support");
    await page.goto("/fees");
    await expect(
      page.getByRole("heading", { name: "Everyday Account", exact: true }),
    ).toBeVisible();
    await fits();
    expect(
      requests.every((url) => new URL(url).pathname === "/customer/session"),
    ).toBe(true);
    await page.goto("/app/accounts");
    await expect(page).toHaveURL(/\/login/);
  });
}
