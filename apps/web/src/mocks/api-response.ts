import { HttpResponse } from "msw";
import { BankingError } from "./bank/service-support";
export async function respond(
  work: () => object | Promise<object>,
  status = 200,
) {
  try {
    return HttpResponse.json(await work(), { status });
  } catch (error) {
    if (error instanceof BankingError)
      return HttpResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return HttpResponse.json(
        { code: "INVALID_REQUEST", message: "Request must be valid JSON." },
        { status: 400 },
      );
    return HttpResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "Banking service is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}
