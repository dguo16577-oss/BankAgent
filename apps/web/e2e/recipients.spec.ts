import { test } from "./authenticated-test";
import { recipientJourney } from "../e2e-shared/recipient-journey";
test("B2 recipient create, transfer and deactivate stays in Payments", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await recipientJourney(page);
});
