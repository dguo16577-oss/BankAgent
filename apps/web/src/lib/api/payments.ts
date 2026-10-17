import type { components } from "@/generated/customer-api";
import { apiGet, apiPost } from "./client";
export type Recipient = components["schemas"]["RecipientSummary"];
export type TransferIntent = components["schemas"]["TransferIntent"];
export type TransferReceipt = components["schemas"]["TransferReceipt"];
export type CreateIntentRequest =
  components["schemas"]["CreateTransferIntentRequest"];
export type ExecuteRequest = components["schemas"]["ExecuteTransferRequest"];
export const getRecipients = (search = "", signal?: AbortSignal) =>
  apiGet<components["schemas"]["RecipientsResponse"]>(
    `/customer/recipients?${new URLSearchParams({ search })}`,
    signal,
  );
export const createIntent = (body: CreateIntentRequest) =>
  apiPost<TransferIntent>("/customer/transfer-intents", body);
export const getIntent = (id: string, signal?: AbortSignal) =>
  apiGet<TransferIntent>(
    `/customer/transfer-intents/${encodeURIComponent(id)}`,
    signal,
  );
export const executeTransfer = (body: ExecuteRequest, key: string) =>
  apiPost<TransferReceipt>("/customer/transfers", body, {
    "Idempotency-Key": key,
  });
export const getTransfer = (id: string, signal?: AbortSignal) =>
  apiGet<TransferReceipt>(
    `/customer/transfers/${encodeURIComponent(id)}`,
    signal,
  );
