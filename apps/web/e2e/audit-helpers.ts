import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import routes from "../../../docs/audit/routes.json";
export async function auditPage(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  const links = await page
    .locator("a[href]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href")!),
    );
  for (const href of links) {
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const pathname = new URL(href, "http://localhost").pathname;
    expect(
      routes.some((r) =>
        new RegExp("^" + r.route.replace(/\[[^\]]+\]/g, "[^/]+") + "/?$").test(
          pathname,
        ),
      ),
      href,
    ).toBe(true);
  }
}
