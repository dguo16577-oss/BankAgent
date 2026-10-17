import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { SecurityService } from "@/mocks/bank/security-service";
import {
  submitApplication as submitAuthorizedApplication,
  prepareApplication,
  type ApplicationSubmission,
  getApplications,
  getApplication,
  type ApplicationRequest,
} from "@/lib/api/applications";
import {
  ApplicationsList,
  ApplicationDetail,
  ApplicationForm,
} from "./application-pages";
import { CustomerEntry } from "@/features/public/customer-entry";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const prepared = new Map<string, ApplicationSubmission>();
beforeEach(() => prepared.clear());
async function submitApplication(input: ApplicationRequest, key: string) {
  let submission = prepared.get(key);
  if (!submission) {
    const intent = await prepareApplication(input);
    const security = new SecurityService(bankingStore);
    const challenge = await security.createChallenge({
      actionType: intent.actionType,
      resourceType: "APPLICATION_INTENT",
      resourceId: intent.id,
      resourceHash: intent.intentHash,
    });
    const code = challenge.verificationRequirement.includes("SMS_OTP")
      ? security.message(challenge.id).messageBody.match(/\b[0-9]{6}\b/)![0]
      : undefined;
    const { authorization } = await security.verify(challenge.id, {
      code,
      password: "demo-password",
    });
    submission = {
      ...input,
      intentId: intent.id,
      intentHash: intent.intentHash,
      actionAuthorizationId: authorization.id,
    };
    prepared.set(key, submission);
  }
  return submitAuthorizedApplication({ ...submission, ...input }, key);
}
const request: ApplicationRequest = {
  productId: "everyday-debit-card",
  accountId: "acc_current",
  contactEmail: "test@example.com",
  consent: true,
  applicationDetails: { cardUsage: "EVERYDAY" },
};
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
it("public header displays the session customer instead of Sign in", async () => {
  mount(<CustomerEntry name />);
  expect(
    await screen.findByRole("link", { name: "Alex Chen" }),
  ).toHaveAttribute("href", "/app/overview");
});
it("anonymous public header links to login", async () => {
  new SecurityService(bankingStore).logout();
  mount(<CustomerEntry name />);
  expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login",
  );
});
it("submits a card, retrieves its detail and leaves balances unchanged", async () => {
  const before = bankingStore.accounts();
  const a = await submitApplication(request, "card-key");
  expect(a.status).toBe("SUBMITTED");
  expect(await getApplication(a.id)).toEqual(a);
  await waitFor(async () =>
    expect((await getApplications()).items).toHaveLength(1),
  );
  expect(bankingStore.accounts()).toEqual(before);
  expect(a).not.toHaveProperty("consent");
});
it("submits a personal loan with decimal-string money", async () => {
  const a = await submitApplication(
    {
      ...request,
      productId: "personal-loan",
      monthlyIncome: { amount: "12000.00", currency: "CNY" },
      requestedAmount: { amount: "10000.00", currency: "CNY" },
      termMonths: 12,
      purpose: "PERSONAL",
      applicationDetails: { employmentStatus: "EMPLOYED" },
    },
    "loan-key",
  );
  expect(a.requestedAmount?.amount).toBe("10000.00");
});
it.each([
  [
    "home-mortgage",
    "MORTGAGE",
    "1000000.00",
    240,
    "HOME_PURCHASE",
    { employmentStatus: "EMPLOYED", propertyType: "APARTMENT" },
  ],
  [
    "overdraft",
    "OVERDRAFT",
    "10000.00",
    undefined,
    undefined,
    { employmentStatus: "EMPLOYED" },
  ],
] as const)(
  "submits %s for review without creating credit",
  async (productId, type, amount, termMonths, purpose, applicationDetails) => {
    const before = bankingStore.accounts();
    const a = await submitApplication(
      {
        ...request,
        productId,
        monthlyIncome: { amount: "12000.00", currency: "CNY" },
        requestedAmount: { amount, currency: "CNY" },
        ...(termMonths ? { termMonths } : {}),
        ...(purpose ? { purpose } : {}),
        applicationDetails,
      },
      `borrow-${productId}`,
    );
    expect(a.productType).toBe(type);
    expect(a.status).toBe("SUBMITTED");
    expect(bankingStore.accounts()).toEqual(before);
  },
);
it("requires a current account for an overdraft request", async () => {
  await expect(
    submitApplication(
      {
        ...request,
        productId: "overdraft",
        accountId: "acc_savings",
        monthlyIncome: { amount: "12000.00", currency: "CNY" },
        requestedAmount: { amount: "10000.00", currency: "CNY" },
        applicationDetails: { employmentStatus: "EMPLOYED" },
      },
      "overdraft-savings",
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("submits a credit card with a distinct use and employment status", async () => {
  const a = await submitApplication(
    {
      ...request,
      productId: "travel-credit-card",
      monthlyIncome: { amount: "12000.00", currency: "CNY" },
      applicationDetails: { cardUsage: "TRAVEL", employmentStatus: "EMPLOYED" },
    },
    "credit-card-key",
  );
  expect(a.applicationDetails).toEqual({
    cardUsage: "TRAVEL",
    employmentStatus: "EMPLOYED",
  });
});
it.each([
  [
    "flexible-savings",
    "SAVINGS_ACCOUNT",
    {
      savingsGoal: "GENERAL",
      plannedMonthlyContribution: { amount: "500.00", currency: "CNY" },
    },
  ],
  [
    "life-insurance",
    "INSURANCE_PRODUCT",
    {
      coverageAmount: { amount: "100000.00", currency: "CNY" },
      beneficiaryRelationship: "SPOUSE",
    },
  ],
  [
    "health-insurance",
    "INSURANCE_PRODUCT",
    {
      coverageAmount: { amount: "100000.00", currency: "CNY" },
      householdSize: 2,
    },
  ],
  [
    "travel-insurance",
    "INSURANCE_PRODUCT",
    { tripStartDate: "2026-11-01", tripEndDate: "2026-11-14" },
  ],
  [
    "home-insurance",
    "INSURANCE_PRODUCT",
    {
      coverageAmount: { amount: "500000.00", currency: "CNY" },
      propertyType: "APARTMENT",
    },
  ],
] as const)(
  "submits %s as review-only intake",
  async (productId, type, details) => {
    const before = bankingStore.accounts();
    const application = await submitApplication(
      { ...request, productId, applicationDetails: details },
      `intake-${productId}`,
    );
    expect(application.productType).toBe(type);
    expect(application.status).toBe("SUBMITTED");
    expect(application.monthlyIncome).toBeUndefined();
    expect(application.applicationDetails).toEqual(details);
    expect(bankingStore.accounts()).toEqual(before);
  },
);
it("retries return the same record and reject changed bodies or duplicate applications", async () => {
  const a = await submitApplication(request, "same");
  expect((await submitApplication(request, "same")).id).toBe(a.id);
  await expect(
    submitApplication(
      { ...request, contactEmail: "changed@example.com" },
      "same",
    ),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  await expect(submitApplication(request, "different")).rejects.toMatchObject({
    status: 409,
    code: "APPLICATION_ALREADY_SUBMITTED",
  });
});
it.each([
  { ...request, consent: false },
  { ...request, contactEmail: "bad" },
  { ...request, monthlyIncome: { amount: "-1.00", currency: "CNY" } },
])("rejects malformed intake", async (input) => {
  await expect(
    submitApplication(input as ApplicationRequest, "bad"),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects mismatched product details and invalid travel dates", async () => {
  await expect(
    submitApplication(
      { ...request, applicationDetails: { savingsGoal: "GENERAL" } },
      "mismatch",
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    submitApplication(
      {
        ...request,
        productId: "travel-insurance",
        applicationDetails: {
          tripStartDate: "2026-11-14",
          tripEndDate: "2026-11-01",
        },
      },
      "dates",
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it.each([
  ["everyday-debit-card", "Card use", "Employment status"],
  ["travel-credit-card", "Employment status", "Savings goal"],
  ["personal-loan", "Requested amount (CNY)", "Card use"],
  ["home-mortgage", "Term (months)", "Card use"],
  ["overdraft", "Requested overdraft limit (CNY)", "Term (months)"],
  ["flexible-savings", "Savings goal", "Card use"],
  ["life-insurance", "Beneficiary relationship", "Trip starts"],
  ["health-insurance", "People to cover", "Property type"],
  ["travel-insurance", "Trip starts", "Requested coverage (CNY)"],
  ["home-insurance", "Property type", "People to cover"],
])("renders %s product-specific fields", async (productId, present, absent) => {
  mount(<ApplicationForm productId={productId} />);
  expect(await screen.findByLabelText(present)).toBeVisible();
  expect(screen.queryByLabelText(absent)).not.toBeInTheDocument();
});
it("rejects unauthenticated submission", async () => {
  new SecurityService(bankingStore).logout();
  await expect(submitApplication(request, "anonymous")).rejects.toMatchObject({
    status: 401,
  });
});
it("renders empty applications and retry after server error", async () => {
  server.use(
    http.get("/customer/applications", () =>
      HttpResponse.json(
        { code: "INTERNAL_ERROR", message: "Try again" },
        { status: 500 },
      ),
    ),
  );
  mount(<ApplicationsList />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByText("You have no applications yet."),
  ).toBeVisible();
});
it("renders owned details with masked account", async () => {
  const a = await submitApplication(request, "detail");
  mount(<ApplicationDetail id={a.id} />);
  expect(await screen.findByText("Submitted · Awaiting review")).toBeVisible();
  expect(screen.getByText(a.maskedAccountNumber)).toBeVisible();
});
it("handles unknown application", async () => {
  mount(<ApplicationDetail id="missing" />);
  expect(await screen.findByText("Application not found")).toBeVisible();
});
it("requires review before submission", async () => {
  const user = userEvent.setup();
  mount(<ApplicationForm productId="everyday-debit-card" />);
  await screen.findByLabelText("Contact email");
  await user.type(screen.getByLabelText("Contact email"), "test@example.com");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Review application" }));
  expect(
    await screen.findByRole("button", { name: "Submit application" }),
  ).toBeVisible();
  expect((await getApplications()).items).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  await user.click(
    await screen.findByRole("button", { name: "View simulated SMS" }),
  );
  const code = (await screen.findByRole("status")).textContent!.match(
    /\b[0-9]{6}\b/,
  )![0];
  await user.type(screen.getByLabelText("SMS verification code"), code);
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));
  await waitFor(async () =>
    expect((await getApplications()).items).toHaveLength(1),
  );
});
it("explains malformed contact email before requesting application intent", async () => {
  const user = userEvent.setup();
  mount(<ApplicationForm productId="everyday-debit-card" />);
  await screen.findByLabelText("Contact email");
  await user.type(screen.getByLabelText("Contact email"), "demo-password@asdg");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Review application" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter a valid contact email",
  );
  expect((await getApplications()).items).toHaveLength(0);
});
