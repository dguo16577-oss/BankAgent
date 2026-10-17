import { http, HttpResponse } from "msw";
import { bankingStore } from "./bank/store";
import { SecurityService } from "./bank/security-service";
import { BankingError } from "./bank/service-support";
import { respond } from "./api-response";
const service = new SecurityService(bankingStore);
export const securityHandlers = [
  http.get("/customer/security/profile", () =>
    respond(() => service.profile()),
  ),
  http.get("/customer/demo/sms/:challengeId", ({ params }) =>
    respond(() => service.message(String(params.challengeId))),
  ),
  http.all("/customer/*", ({ request }) => {
    if (
      new URL(request.url).pathname === "/customer/auth/login" &&
      request.method === "POST"
    )
      return;
    try {
      service.session();
    } catch (error) {
      if (error instanceof BankingError)
        return HttpResponse.json(
          { code: error.code, message: error.message },
          { status: error.status },
        );
      return HttpResponse.json(
        { code: "INTERNAL_ERROR", message: "Session could not be checked." },
        { status: 500 },
      );
    }
  }),
  http.post("/customer/auth/login", ({ request }) =>
    respond(async () => service.login(await request.json())),
  ),
  http.post("/customer/auth/logout", () => respond(() => service.logout())),
  http.get("/customer/session", () => respond(() => service.session())),
  http.post("/customer/auth/step-up-challenges", ({ request }) =>
    respond(async () => service.createChallenge(await request.json())),
  ),
  http.get("/customer/auth/step-up-challenges/:challengeId", ({ params }) =>
    respond(() => service.challenge(String(params.challengeId))),
  ),
  http.post(
    "/customer/auth/step-up-challenges/:challengeId/verify",
    ({ params, request }) =>
      respond(async () =>
        service.verify(String(params.challengeId), await request.json()),
      ),
  ),
];
