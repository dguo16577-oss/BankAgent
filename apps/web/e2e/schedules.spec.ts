import { test } from "./authenticated-test";
import { scheduleJourney } from "../e2e-shared/schedule-journey";
test("B3 scheduled create amend cancel stays in Payments", async ({ page }) => {
  test.setTimeout(120000);
  await scheduleJourney(page);
});
