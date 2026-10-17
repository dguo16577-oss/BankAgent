"use client";
import type { components } from "@/generated/customer-api";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createChallenge,
  getChallenge,
  verifyChallenge,
  login,
  logout,
} from "@/lib/api/security";
export const useLogin = () =>
  useMutation({
    mutationFn: async (body: Parameters<typeof login>[0]) => {
      try {
        return await login(body);
      } finally {
        body.password = "";
      }
    },
    retry: false,
    gcTime: 0,
  });
export const useLogout = () => useMutation({ mutationFn: logout });
export const useCreateChallenge = () =>
  useMutation({ mutationFn: createChallenge });
export const useChallenge = (id: string) =>
  useQuery({
    queryKey: ["step-up", id],
    queryFn: ({ signal }) => getChallenge(id, signal),
    enabled: !!id,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
export const useVerifyChallenge = (id: string) =>
  useMutation({
    mutationFn: (request: components["schemas"]["VerifyStepUpRequest"]) =>
      verifyChallenge(id, request).finally(() => {
        request.code = "";
        request.password = "";
      }),
    retry: false,
    gcTime: 0,
  });
