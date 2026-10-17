import { test, expect } from "@playwright/test";
import { signIn } from "./authenticated-test";
for (const width of [320, 390, 768, 1440]) {
  test(`public discovery, boundaries and customer login at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const customerRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/customer/"))
        customerRequests.push(request.url());
    });
    const fits = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    const capture = async (name: string, fullPage = true) =>
      page.screenshot({
        path: `docs/screenshots/m9-${name}-${width}.png`,
        fullPage,
        animations: "disabled",
        style: "nextjs-portal { display:none !important; }",
      });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Everyday banking, built around you.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await fits();
    await capture("home");
    if (width >= 1280) {
      const trigger = page
        .getByRole("navigation", { name: "Public navigation" })
        .getByRole("button", { name: "Banking", exact: true });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await expect(
        page
          .locator("#mega-banking")
          .getByRole("link", { name: "Current Account" }),
      ).toBeVisible();
      await fits();
      await capture("navigation", false);
      await page
        .locator("#mega-banking")
        .getByRole("link", { name: "Explore Banking", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const mobile = page.getByRole("navigation", {
        name: "Mobile public navigation",
      });
      await mobile
        .locator("summary")
        .filter({ hasText: /^Banking$/ })
        .click();
      await expect(
        mobile.getByRole("link", { name: "Current Account" }),
      ).toBeVisible();
      await fits();
      await capture("navigation", false);
      await mobile
        .getByRole("link", { name: "Explore Banking", exact: true })
        .click();
      await expect(mobile).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/banking$/);
    await expect(
      page.getByRole("heading", { name: "Banking", exact: true, level: 1 }),
    ).toBeVisible();
    await fits();
    await capture("banking");
    await page
      .getByRole("link", { name: "Aster Bank home", exact: true })
      .first()
      .click();
    await page
      .getByRole("main")
      .getByRole("link", { name: "Ask Aster", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/login\?reason=signed-out&next=%2Fapp%2Fagent/,
    );
    await expect(
      page.getByRole("heading", { name: "Welcome to Aster", level: 1 }),
    ).toBeVisible();
    await fits();
    expect(customerRequests.length).toBeGreaterThan(0);
    expect(
      customerRequests.every(
        (url) => new URL(url).pathname === "/customer/session",
      ),
    ).toBe(true);
    await page.getByLabel("Email", { exact: true }).fill("alex@aster.local");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Sign in to demo" }).click();
    await expect(page).toHaveURL(/\/app\/agent$/);
    await expect(
      page.getByRole("heading", { name: "Ask Aster about your banking" }),
    ).toBeVisible();
    await fits();
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Aster Bank", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Everyday banking, built around you.",
      }),
    ).toBeVisible();
    await page.goto("/cards");
    await expect(
      page.getByRole("heading", { name: "Cards", level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/not your personal cards/)).toBeVisible();
    await fits();
    await capture("public-cards");
    await page.goto("/app/cards");
    await expect(page.getByText("••8821", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await fits();
    await page.goto("/investments");
    await expect(
      page.getByRole("heading", { name: "Investments", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/separate from your personal portfolio/),
    ).toBeVisible();
    await fits();
    await page.goto("/app/wealth");
    await expect(
      page.getByRole("heading", { name: "Wealth", level: 1, exact: true }),
    ).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/cards");
    await expect(
      page.getByRole("heading", { name: "Cards", level: 1, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/cards$/);
    await page.goto("/app/cards");
    await expect(page).toHaveURL(/\/login/);
  });
}
for (const [path, title] of [
  ["banking", "Banking"],
  ["cards", "Cards"],
  ["borrowing", "Borrowing"],
  ["investments", "Investments"],
  ["insurance", "Insurance"],
  ["insights", "Insights"],
  ["offers", "Offers"],
  ["support", "Support"],
]) {
  test(`public /${path} does not redirect anonymous visitors`, async ({
    page,
  }) => {
    await page.goto(`/${path}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
  });
}
test("legacy Ask Aster link opens the authenticated agent", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app/agent");
  await expect(
    page.getByRole("heading", { name: "Ask Aster about your banking" }),
  ).toBeVisible();
  await page.goto("/ask");
  await expect(page).toHaveURL(/\/app\/agent$/);
  await expect(
    page.getByRole("heading", { name: "Ask Aster about your banking" }),
  ).toBeVisible();
});
