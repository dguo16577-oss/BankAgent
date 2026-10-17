"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApplications,
  getApplication,
  submitApplication,
  type ApplicationSubmission,
} from "@/lib/api/applications";
export const useApplications = () =>
  useQuery({
    queryKey: ["applications"],
    queryFn: ({ signal }) => getApplications(signal),
  });
export const useApplication = (id: string) =>
  useQuery({
    queryKey: ["applications", id],
    queryFn: ({ signal }) => getApplication(id, signal),
    retry: false,
  });
export function useSubmitApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      request,
      key,
    }: {
      request: ApplicationSubmission;
      key: string;
    }) => submitApplication(request, key),
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }),
  });
}
