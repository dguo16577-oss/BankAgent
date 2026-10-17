import { http } from "msw";
import { respond } from "./api-response";
import { bankingStore } from "./bank/store";
import { ScheduleService } from "./bank/schedule-service";
const service = new ScheduleService(bankingStore);
export const scheduleHandlers = [
  http.get("/customer/scheduled-payments", () => respond(() => service.list())),
  http.get("/customer/scheduled-payments/:scheduleId", ({ params }) =>
    respond(() => service.get(String(params.scheduleId))),
  ),
  http.post("/customer/scheduled-payment-intents", ({ request }) =>
    respond(async () => service.prepare(await request.json())),
  ),
  http.get("/customer/scheduled-payment-intents/:intentId", ({ params }) =>
    respond(() => service.intent(String(params.intentId))),
  ),
  http.post("/customer/scheduled-payment-actions", ({ request }) =>
    respond(async () =>
      service.confirm(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      ),
    ),
  ),
];
