import { http } from "msw";
import { bankingStore } from "./bank/store";
import { WealthService } from "./bank/wealth-service";
import { respond } from "./api-response";
const service = new WealthService(bankingStore);
export const wealthHandlers = [
  http.get("/customer/wealth/portfolio", () =>
    respond(() => service.portfolio()),
  ),
  http.get("/customer/wealth/products", ({ request }) =>
    respond(() => service.products(new URL(request.url).searchParams)),
  ),
  http.get("/customer/wealth/products/:productId", ({ params }) =>
    respond(() => service.product(String(params.productId))),
  ),
  http.get("/customer/wealth/risk-profile", () =>
    respond(() => service.riskProfile()),
  ),
  http.post("/customer/wealth/suitability-checks", ({ request }) =>
    respond(async () => service.createCheck(await request.json()), 201),
  ),
  http.get("/customer/wealth/suitability-checks/:checkId", ({ params }) =>
    respond(() => service.check(String(params.checkId))),
  ),
  http.post("/customer/investment-order-intents", ({ request }) =>
    respond(async () => service.prepare(await request.json()), 201),
  ),
  http.get("/customer/investment-order-intents/:intentId", ({ params }) =>
    respond(() => service.intent(String(params.intentId))),
  ),
  http.post("/customer/investment-orders", ({ request }) =>
    respond(async () =>
      service.execute(
        await request.json(),
        request.headers.get("Idempotency-Key"),
      ),
    ),
  ),
  http.get("/customer/investment-orders/:orderId", ({ params }) =>
    respond(() => service.order(String(params.orderId))),
  ),
];
