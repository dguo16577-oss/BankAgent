"use client";
import { CatalogPage, OffersPage, SupportPage } from "./catalog-pages";
export function PublicCategoryPage({ route }: { route: string }) {
  if (route === "/support") return <SupportPage />;
  if (route === "/insights") return <SupportPage insights />;
  if (route === "/offers") return <OffersPage />;
  return <CatalogPage route={route} />;
}
