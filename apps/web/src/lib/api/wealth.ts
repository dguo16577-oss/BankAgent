import type { components, paths } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
type S = components["schemas"];
export type ProductFilters = NonNullable<
  paths["/customer/wealth/products"]["get"]["parameters"]["query"]
>;
export const getPortfolio = (signal?: AbortSignal) =>
  apiGet<S["PortfolioSummary"]>("/customer/wealth/portfolio", signal);
export const getProducts = (filters: ProductFilters, signal?: AbortSignal) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return apiGet<S["InvestmentProductsResponse"]>(
    `/customer/wealth/products?${query}`,
    signal,
  );
};
export const getProduct = (id: string, signal?: AbortSignal) =>
  apiGet<S["InvestmentProductDetail"]>(
    `/customer/wealth/products/${encodeURIComponent(id)}`,
    signal,
  );
export const getRiskProfile = (signal?: AbortSignal) =>
  apiGet<S["UserRiskProfile"]>("/customer/wealth/risk-profile", signal);
export const createSuitability = (
  request: S["CreateSuitabilityCheckRequest"],
) =>
  apiPost<S["SuitabilityCheck"]>(
    "/customer/wealth/suitability-checks",
    request,
  );
export const getSuitability = (id: string, signal?: AbortSignal) =>
  apiGet<S["SuitabilityCheck"]>(
    `/customer/wealth/suitability-checks/${encodeURIComponent(id)}`,
    signal,
  );
export const prepareInvestment = (
  request: S["CreateInvestmentOrderIntentRequest"],
) =>
  apiPost<S["InvestmentOrderIntent"]>(
    "/customer/investment-order-intents",
    request,
  );
export const getInvestmentIntent = (id: string, signal?: AbortSignal) =>
  apiGet<S["InvestmentOrderIntent"]>(
    `/customer/investment-order-intents/${encodeURIComponent(id)}`,
    signal,
  );
export const executeInvestment = (
  request: S["ExecuteInvestmentOrderRequest"],
  key: string,
) =>
  apiPost<S["InvestmentOrderReceipt"]>("/customer/investment-orders", request, {
    "Idempotency-Key": key,
  });
export const getInvestmentOrder = (id: string, signal?: AbortSignal) =>
  apiGet<S["InvestmentOrderReceipt"]>(
    `/customer/investment-orders/${encodeURIComponent(id)}`,
    signal,
  );
