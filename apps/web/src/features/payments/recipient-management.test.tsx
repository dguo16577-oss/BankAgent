import { verifiedIntent, authorizationFor } from "@/test/verification";
import { completeVerification } from "@/test/verification-ui";
import { expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { RecipientService } from "@/mocks/bank/recipient-service";
import { AddRecipient, RecipientDetail } from "./recipient-management";
import { PaymentsHub } from "./payments-hub";
import { NewTransfer } from "./new-transfer";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
async function saved(destination = "demo-lin") {
  const service = new RecipientService(bankingStore);
  const intent = await verifiedIntent(
    service.prepare({
      actionType: "CREATE",
      destinationRef: destination,
    }),
  );
  return service.execute(
    {
      actionAuthorizationId: authorizationFor(intent),
      intentId: intent.id,
      intentHash: intent.intentHash,
    },
    crypto.randomUUID(),
    "CREATE",
  );
}
it("creates only after review and remains in Payments", async () => {
  mount(<AddRecipient />);
  await userEvent.type(
    screen.getByLabelText("Demo destination reference"),
    "demo-lin",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review recipient" }),
  );
  await screen.findByRole("button", { name: "Confirm recipient" });
  expect(
    bankingStore.read().recipients.some((r) => r.displayName === "Lin Wei"),
  ).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm recipient" }),
  );
  await completeVerification();
  await screen.findByText("Recipient saved");
  const recipient = bankingStore
    .read()
    .recipients.find((r) => r.displayName === "Lin Wei")!;
  expect(screen.getByRole("link", { name: "Make transfer" })).toHaveAttribute(
    "href",
    `/app/payments/transfers/new?recipientId=${recipient.id}`,
  );
  expect(
    screen.getByRole("link", { name: "Recipient details" }),
  ).toHaveAttribute("href", `/app/payments/recipients/${recipient.id}`);
});
it("deactivates explicitly, hides transfer action and excludes inactive selector option", async () => {
  const r = await saved();
  mount(<RecipientDetail id={r.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Deactivate recipient" }),
  );
  expect(
    bankingStore.read().recipients.find((x) => x.id === r.id)?.status,
  ).toBe("ACTIVE");
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm deactivation" }),
  );
  await completeVerification();
  await screen.findByText(
    "Recipient deactivated. Past transfers remain available.",
  );
  expect(
    screen.queryByRole("link", { name: "Make transfer" }),
  ).not.toBeInTheDocument();
  cleanup();
  mount(<NewTransfer />);
  await screen.findByRole("option", { name: /Zhang San/ });
  expect(
    screen.queryByRole("option", { name: /Lin Wei/ }),
  ).not.toBeInTheDocument();
});
it("search preserves two same-name recipients and concrete detail IDs", async () => {
  const a = await saved();
  const b = await saved("demo-lin-savings");
  mount(<PaymentsHub />);
  await userEvent.type(screen.getByLabelText("Search recipients"), "Lin");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  const links = await screen.findAllByRole("link", { name: "Lin Wei" });
  expect(links).toHaveLength(2);
  expect(links.map((x) => x.getAttribute("href"))).toEqual(
    expect.arrayContaining([
      `/app/payments/recipients/${a.id}`,
      `/app/payments/recipients/${b.id}`,
    ]),
  );
});
it("selected recipient is an opaque ID in transfer form", async () => {
  const r = await saved();
  mount(<NewTransfer selectedRecipient={r.id} />);
  await screen.findByRole("option", { name: /Lin Wei/ });
  expect(screen.getByLabelText("Recipient")).toHaveValue(r.id);
});
it("shows invalid destination and does not create a recipient", async () => {
  mount(<AddRecipient />);
  await userEvent.type(
    screen.getByLabelText("Demo destination reference"),
    "unknown",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review recipient" }),
  );
  await screen.findByRole("alert");
  expect(
    bankingStore.read().recipients.some((r) => r.displayName === "Lin Wei"),
  ).toBe(false);
});
it("recipient detail error is retryable", async () => {
  let calls = 0;
  const r = await saved();
  server.use(
    http.get("*/customer/recipients/:id", () => {
      if (calls++ === 0)
        return HttpResponse.json(
          {
            code: "INTERNAL_ERROR",
            message: "Unavailable",
            correlationId: "test",
          },
          { status: 500 },
        );
      return HttpResponse.json(r);
    }),
  );
  mount(<RecipientDetail id={r.id} />);
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  await screen.findByRole("heading", { name: "Lin Wei" });
});
it("unknown recipient cannot expose a management action", async () => {
  mount(<RecipientDetail id="missing" />);
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Deactivate recipient" }),
  ).not.toBeInTheDocument();
});
