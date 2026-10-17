import { expect, it } from "vitest";
import { catalog } from "./catalog";
import { articles } from "./support";
import { offers } from "./offers";
import { publicHome, publicNavigation } from "./fixtures";
import { searchPublic } from "./search";
import routes from "../../../../../docs/audit/routes.json";
import { getCatalog, getCatalogItem, getArticle } from "@/lib/api/public";
const valid = (route: string) => {
  const p = route.split(/[?#]/)[0];
  if (p.startsWith("/products/"))
    return catalog.some((c) => p === `/products/${c.slug}`);
  if (p.startsWith("/support/"))
    return articles.some((a) => p === `/support/${a.slug}`);
  return routes.some((r) => r.route === p);
};
it("M11 all Public references resolve to existing content and page routes", () => {
  for (const c of catalog) {
    for (const id of c.relatedItemIds)
      expect(catalog.some((i) => i.id === id)).toBe(true);
    for (const action of c.cta)
      expect(valid(action.route), action.route).toBe(true);
  }
  for (const a of articles)
    for (const slug of a.relatedArticles)
      expect(articles.some((i) => i.slug === slug)).toBe(true);
  for (const r of [
    ...offers.map((o) => o.route),
    ...publicHome.featuredServices.map((i) => i.route),
    ...publicHome.insights.map((i) => i.route),
    ...searchPublic("card").items.map((i) => i.route),
    ...publicNavigation.groups.flatMap((g) => [
      g.route,
      ...g.sections.flatMap((s) => s.links.map((l) => l.route)),
    ]),
  ])
    expect(valid(r), r).toBe(true);
});
it("M11 fee list projection matches authoritative detail without N+1 calls", async () => {
  const list = await getCatalog();
  for (const item of list.items)
    expect(item.fees).toEqual(catalog.find((c) => c.id === item.id)!.fees);
});
it("M11 public machine error codes survive the shared API client", async () => {
  await expect(getCatalogItem("missing")).rejects.toMatchObject({
    status: 404,
    code: "PUBLIC_CONTENT_NOT_FOUND",
  });
  await expect(getArticle("missing")).rejects.toMatchObject({
    status: 404,
    code: "PUBLIC_CONTENT_NOT_FOUND",
  });
});
