import { http } from "msw";
import { bankingStore } from "./bank/store";
import { CardService } from "./bank/card-service";
import { respond } from "./api-response";
const service = new CardService(bankingStore);
export const cardHandlers = [
  http.get("/customer/cards", () => respond(() => service.list())),
  http.get("/customer/cards/:cardId", ({ params }) =>
    respond(() => service.card(String(params.cardId))),
  ),
  http.post("/customer/card-action-intents", ({ request }) =>
    respond(async () => service.prepare(await request.json()), 201),
  ),
  http.get("/customer/card-action-intents/:intentId", ({ params }) =>
    respond(() => service.intent(String(params.intentId))),
  ),
  http.post("/customer/card-actions", ({ request }) =>
    respond(async () =>
      service.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      ),
    ),
  ),
  http.get("/customer/card-actions/:actionId", ({ params }) =>
    respond(() => service.receipt(String(params.actionId))),
  ),
];
