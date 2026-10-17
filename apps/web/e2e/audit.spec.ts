import { test, expect } from "@playwright/test";
import { signIn } from "./authenticated-test";
import { auditPage } from "./audit-helpers";
const publicPages = [
  "/",
  "/banking",
  "/cards",
  "/borrowing",
  "/investments",
  "/insurance",
  "/products/flexible-savings",
  "/cards/compare",
  "/rates",
  "/fees",
  "/support",
  "/support/lost-card",
  "/offers",
  "/insights",
  "/payments-fx",
  "/login",
];
const customerPages = [
  "/app/overview",
  "/app/accounts",
  "/app/accounts/acc_current",
  "/app/transactions",
  "/app/payments",
  "/app/payments/transfers/new",
  "/app/cards",
  "/app/cards/card_aster_debit",
  "/app/spending",
  "/app/wealth",
  "/app/wealth/products/product_bond",
  "/app/settings",
  "/app/agent",
];
for (const surface of ["public", "customer"])
  test(`M11 ${surface} accessibility and link audit`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (surface === "customer") await signIn(page);
    for (const route of surface === "public" ? publicPages : customerPages) {
      await test.step(route, async () => {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByRole("status").filter({ hasText: /Loading|Preparing/ }),
        ).toHaveCount(0);
        await auditPage(page);
        if (route === "/" || route === "/app/overview")
          await page.screenshot({
            path: `docs/screenshots/m11-${surface}-1440.png`,
            fullPage: true,
            animations: "disabled",
          });
      });
    }
  });
test("M11 public reference links resolve, including all products/articles/offers", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const links = await page.evaluate(async () => {
    const [nav, catalog, articles, search, offers] = await Promise.all(
      [
        "/public/navigation",
        "/public/catalog",
        "/public/support/articles",
        "/public/search?q=card",
        "/public/offers",
      ].map(async (p) => (await fetch(p)).json()),
    );
    return [
      ...new Set<string>([
        ...nav.groups.flatMap(
          (g: {
            route: string;
            sections: { links: { route: string }[] }[];
          }) => [
            g.route,
            ...g.sections.flatMap((s) => s.links.map((l) => l.route)),
          ],
        ),
        ...catalog.items.map((i: { slug: string }) => `/products/${i.slug}`),
        ...articles.items.map((i: { slug: string }) => `/support/${i.slug}`),
        ...search.items.map((i: { route: string }) => i.route),
        ...offers.items.map((i: { route: string }) => i.route),
      ]),
    ];
  });
  for (const route of links) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Content not found" }),
    ).toHaveCount(0);
  }
});
for (const width of [320, 390, 768, 1024, 1440])
  test(`M11 public controls and customer filters ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/cards/compare",
      "/products/flexible-savings",
      "/support",
      "/fees",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Search public website" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await auditPage(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Search public website" }),
    ).toBeFocused();
    await signIn(page);
    await page.goto("/app/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions", level: 1 }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/m11-transactions-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

test("M11 retired banking paths remain absent", async ({ request }) => {
  for (const route of [
    "/overview",
    "/accounts",
    "/payments",
    "/wealth",
    "/agent",
  ]) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(404);
  }
});
