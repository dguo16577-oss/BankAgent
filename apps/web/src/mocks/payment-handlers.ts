import { respond } from "./api-response";
import { http } from "msw";
import { bankingStore } from "./bank/store";
import { TransferService } from "./bank/transfer-service";
import { RecipientService } from "./bank/recipient-service";
const recipients = new RecipientService(bankingStore);
const service = new TransferService(bankingStore);
export const paymentHandlers = [
  http.get("/customer/recipients/:recipientId", ({ params }) =>
    respond(() => recipients.get(String(params.recipientId))),
  ),
  http.post("/customer/recipient-action-intents", ({ request }) =>
    respond(async () => recipients.prepare(await request.json())),
  ),
  http.get("/customer/recipient-action-intents/:intentId", ({ params }) =>
    respond(() => recipients.intent(String(params.intentId))),
  ),
  http.post("/customer/recipients", ({ request }) =>
    respond(async () =>
      recipients.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
        "CREATE",
      ),
    ),
  ),
  http.post("/customer/recipient-actions", ({ request }) =>
    respond(async () =>
      recipients.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
        "DEACTIVATE",
      ),
    ),
  ),
  http.get("/customer/recipients", ({ request }) =>
    respond(() =>
      service.recipients(new URL(request.url).searchParams.get("search") ?? ""),
    ),
  ),
  http.post("/customer/transfer-intents", ({ request }) =>
    respond(async () => service.prepare(await request.json()), 201),
  ),
  http.get("/customer/transfer-intents/:intentId", ({ params }) =>
    respond(() => service.intent(String(params.intentId))),
  ),
  http.post("/customer/transfers", ({ request }) =>
    respond(async () =>
      service.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      ),
    ),
  ),
  http.get("/customer/transfers/:transferId", ({ params }) =>
    respond(() => service.receipt(String(params.transferId))),
  ),
];
