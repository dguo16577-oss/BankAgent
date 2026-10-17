vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { TransferService } from "@/mocks/bank/transfer-service";
import { RecurringService } from "@/mocks/bank/recurring-service";
import { ActionVerification } from "./action-verification";
import { SecurityService } from "@/mocks/bank/security-service";
import { completeVerification } from "@/test/verification-ui";
async function mount(passwordOnly = false) {
  const intent = passwordOnly
    ? await new RecurringService(bankingStore).prepare({
        recurringPaymentId: "rec_netflix",
        actionType: "STOP_FUTURE_PAYMENTS",
      })
    : await new TransferService(bankingStore).prepare({
        sourceAccountId: "acc_current",
        recipientId: "recipient_zhang",
        amount: { amount: "1.00", currency: "CNY" },
      });
  const confirmed = vi
    .fn<(_: string | undefined) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <ActionVerification
        action={
          passwordOnly ? "RECURRING_STOP_FUTURE_PAYMENTS" : "TRANSFER_EXECUTE"
        }
        resourceType={
          passwordOnly ? "RECURRING_PAYMENT_INTENT" : "TRANSFER_INTENT"
        }
        resourceId={intent.id}
        resourceHash={intent.intentHash}
        label="Confirm action"
        onVerified={confirmed}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Confirm action" }));
  await screen.findByRole("heading", { name: "Verify this action" });
  return confirmed;
}
it("password-only shows no SMS field, clears password and continues the original action", async () => {
  const confirmed = await mount(true);
  expect(
    screen.queryByLabelText("SMS verification code"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Account password")).toHaveAttribute(
    "type",
    "password",
  );
  expect(screen.getByLabelText("Account password")).toHaveValue("");
  await completeVerification();
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
  expect(bankingStore.read().demoSms).toEqual({});
});
it("OTP-only shows masked phone and demo delivery without asking for password", async () => {
  const confirmed = await mount();
  expect(screen.queryByLabelText("Account password")).not.toBeInTheDocument();
  expect(screen.getByText(/\*\*\*\*5678/)).toBeVisible();
  await completeVerification();
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
});
it("production profile hides the demo inbox control", async () => {
  server.use(
    http.get("/customer/security/profile", () =>
      HttpResponse.json({
        maskedPhone: "+86138****5678",
        phoneVerified: true,
        availableVerificationFactors: ["PASSWORD", "SMS_OTP"],
        demoSmsAvailable: false,
      }),
    ),
  );
  await mount();
  await screen.findByLabelText("SMS verification code");
  expect(
    screen.queryByRole("button", { name: "View simulated SMS" }),
  ).not.toBeInTheDocument();
  expect(() =>
    new SecurityService(bankingStore, () => "012345", false).message("missing"),
  ).toThrow(expect.objectContaining({ code: "DEMO_SMS_UNAVAILABLE" }));
});
it("expired OTP rejects confirmation and offers a fresh action-bound verification", async () => {
  const confirmed = await mount();
  bankingStore.clock.advance(300000);
  await completeVerification();
  await screen.findByRole("alert");
  expect(confirmed).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Verify again" })).toBeVisible();
});
it("six-digit input preserves a pasted leading zero", async () => {
  await mount();
  const user = userEvent.setup();
  const field = screen.getByLabelText("SMS verification code");
  await user.click(field);
  await user.paste("012345");
  expect(field).toHaveValue("012345");
  expect(field).toHaveAttribute("inputmode", "numeric");
});
