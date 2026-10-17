import { http } from "msw";
import { bankingStore } from "./bank/store";
import { spendingSummary } from "./bank/spending-analytics";
import { RecurringService } from "./bank/recurring-service";
import { respond } from "./api-response";
const service = new RecurringService(bankingStore);
export const spendingHandlers = [
  http.get("/customer/spending/summary", ({ request }) =>
    respond(() =>
      spendingSummary(bankingStore.read(), new URL(request.url).searchParams),
    ),
  ),
  http.get("/customer/recurring-payments", () => respond(() => service.list())),
  http.get("/customer/recurring-payments/:recurringPaymentId", ({ params }) =>
    respond(() => service.detail(String(params.recurringPaymentId))),
  ),
  http.post("/customer/recurring-payment-action-intents", ({ request }) =>
    respond(async () => service.prepare(await request.json()), 201),
  ),
  http.get(
    "/customer/recurring-payment-action-intents/:intentId",
    ({ params }) => respond(() => service.intent(String(params.intentId))),
  ),
  http.post("/customer/recurring-payment-actions", ({ request }) =>
    respond(async () =>
      service.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      ),
    ),
  ),
  http.get("/customer/recurring-payment-actions/:actionId", ({ params }) =>
    respond(() => service.receipt(String(params.actionId))),
  ),
];
