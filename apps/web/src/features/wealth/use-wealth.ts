"use client";
import { refreshAfterConflict } from "@/lib/api/conflict";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@/generated/customer-api";
import {
  getPortfolio,
  getProducts,
  getProduct,
  getRiskProfile,
  createSuitability,
  getSuitability,
  prepareInvestment,
  getInvestmentIntent,
  executeInvestment,
  getInvestmentOrder,
  type ProductFilters,
} from "@/lib/api/wealth";
export const usePortfolio = () =>
  useQuery({
    queryKey: ["portfolio"],
    queryFn: ({ signal }) => getPortfolio(signal),
    retry: false,
  });
export const useProducts = (filters: ProductFilters = {}) =>
  useQuery({
    queryKey: ["wealth-products", filters],
    queryFn: ({ signal }) => getProducts(filters, signal),
    retry: false,
  });
export const useProduct = (id: string) =>
  useQuery({
    queryKey: ["wealth-product", id],
    queryFn: ({ signal }) => getProduct(id, signal),
    retry: false,
  });
export const useRiskProfile = () =>
  useQuery({
    queryKey: ["risk-profile"],
    queryFn: ({ signal }) => getRiskProfile(signal),
    retry: false,
  });
export const useCreateSuitability = () =>
  useMutation({ mutationFn: createSuitability, retry: false });
export const useSuitability = (id?: string) =>
  useQuery({
    queryKey: ["suitability", id],
    queryFn: ({ signal }) => getSuitability(id!, signal),
    enabled: !!id,
    retry: false,
    staleTime: 0,
  });
export const usePrepareInvestment = () =>
  useMutation({ mutationFn: prepareInvestment, retry: false });
export const useInvestmentIntent = (id: string) =>
  useQuery({
    queryKey: ["investment-intents", id],
    queryFn: ({ signal }) => getInvestmentIntent(id, signal),
    retry: false,
    staleTime: 0,
  });
export const useInvestmentOrder = (id: string) =>
  useQuery({
    queryKey: ["investment-orders", id],
    queryFn: ({ signal }) => getInvestmentOrder(id, signal),
    retry: false,
  });
export function useExecuteInvestment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      request,
      key,
    }: {
      request: components["schemas"]["ExecuteInvestmentOrderRequest"];
      key: string;
    }) => executeInvestment(request, key),
    retry: false,
    onError: (error) =>
      refreshAfterConflict(client, error, [
        "portfolio",
        "accounts",
        "overview",
        "wealth-products",
        "investment-intents",
      ]),
    onSuccess: async (receipt) => {
      client.removeQueries({ queryKey: ["transactions"] });
      client.setQueryData(["investment-orders", receipt.id], receipt);
      await Promise.all(
        [
          "portfolio",
          "accounts",
          "overview",
          "transaction",
          "spending",
          "investment-intents",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
}
