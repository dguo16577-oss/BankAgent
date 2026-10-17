"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSchedules,
  getSchedule,
  prepareSchedule,
  confirmSchedule,
  type ScheduleIntent,
} from "@/lib/api/schedules";
export const useSchedules = () =>
  useQuery({
    queryKey: ["scheduled-payments"],
    queryFn: ({ signal }) => getSchedules(signal),
    retry: false,
  });
export const useSchedule = (id: string) =>
  useQuery({
    queryKey: ["scheduled-payments", id],
    queryFn: ({ signal }) => getSchedule(id, signal),
    retry: false,
  });
export function useScheduleActions() {
  const cache = useQueryClient();
  return {
    prepare: useMutation({ mutationFn: prepareSchedule, retry: false }),
    confirm: useMutation({
      mutationFn: ({
        intent,
        key,
        actionAuthorizationId,
      }: {
        intent: ScheduleIntent;
        key: string;
        actionAuthorizationId?: string;
      }) => confirmSchedule(intent, key, actionAuthorizationId),
      retry: false,
      onSuccess: async () => {
        await cache.invalidateQueries({ queryKey: ["scheduled-payments"] });
      },
    }),
  };
}
