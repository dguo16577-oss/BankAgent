"use client";
import { ActionVerification } from "@/features/security/action-verification";
import {
  prepareApplication,
  type ApplicationIntent,
} from "@/lib/api/applications";
import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/locale";
import { getAccounts } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import type { ApplicationRequest } from "@/lib/api/applications";
import { useCatalog } from "@/features/public/use-public";
import {
  useApplications,
  useApplication,
  useSubmitApplication,
} from "./use-applications";
import { formatMoney } from "@/lib/money";
const field = "mt-2 block w-full min-w-0 rounded-md border bg-background p-3";
import { applicationProductTypes } from "./product-types";
type Details = NonNullable<ApplicationRequest["applicationDetails"]>;
function detailRows(details: Details | undefined): [string, string][] {
  if (!details) return [];
  return [
    details.cardUsage && ["Card use", details.cardUsage],
    details.employmentStatus && ["Employment status", details.employmentStatus],
    details.savingsGoal && ["Savings goal", details.savingsGoal],
    details.plannedMonthlyContribution && [
      "Planned monthly contribution",
      formatMoney(details.plannedMonthlyContribution),
    ],
    details.coverageAmount && [
      "Requested coverage",
      formatMoney(details.coverageAmount),
    ],
    details.beneficiaryRelationship && [
      "Beneficiary relationship",
      details.beneficiaryRelationship,
    ],
    details.householdSize && ["People to cover", String(details.householdSize)],
    details.tripStartDate && ["Trip starts", details.tripStartDate],
    details.tripEndDate && ["Trip ends", details.tripEndDate],
    details.propertyType && ["Property type", details.propertyType],
  ].filter((row): row is [string, string] => Boolean(row));
}
function Notice() {
  const { t } = useLocale();
  return (
    <p className="rounded-lg bg-secondary p-4 text-sm leading-6">
      {t(
        "Applications are saved for review. Submission does not open an account, issue a card or policy, approve credit or move money. Review processing is not available yet.",
      )}
    </p>
  );
}
export function ApplicationsList() {
  const { t, errorMessage, formatDate } = useLocale();
  const query = useApplications();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{t("My applications")}</h1>
      <Notice />
      <Button asChild>
        <Link href="/app/applications/new">{t("Apply for a product")}</Link>
      </Button>
      {query.isPending ? (
        <p role="status">{t("Loading…")}</p>
      ) : query.isError ? (
        <div role="alert">
          {errorMessage(query.error)}
          <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
        </div>
      ) : query.data.items.length === 0 ? (
        <p>{t("You have no applications yet.")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {query.data.items.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3">
                <Link
                  className="font-semibold underline"
                  href={`/app/applications/${a.id}`}
                >
                  {t(a.productTitle)}
                </Link>
                <p>{t("Submitted · Awaiting review")}</p>
                <p className="text-sm">
                  {formatDate(a.submittedAt)} · {a.maskedAccountNumber}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
export function ApplicationDetail({
  id,
  inline = false,
}: {
  id: string;
  inline?: boolean;
}) {
  const { t, errorMessage, formatDate } = useLocale();
  const query = useApplication(id);
  if (query.isPending) return <p role="status">{t("Loading…")}</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>
          {query.error instanceof ApiError && query.error.status === 404
            ? t("Application not found")
            : errorMessage(query.error)}
        </p>
        <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
        <Link href="/app/applications">{t("My applications")}</Link>
      </div>
    );
  const a = query.data;
  return (
    <div className="max-w-3xl space-y-6">
      {!inline && (
        <Link href="/app/applications" className="underline">
          {t("My applications")}
        </Link>
      )}
      <h1 className="text-3xl font-semibold">{t(a.productTitle)}</h1>
      <Notice />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href={`/products/${encodeURIComponent(a.productId)}`}
          className="font-medium text-primary underline"
        >
          {t("Return to product page")}
        </Link>
        <Link
          href="/app/applications"
          className="font-medium text-primary underline"
        >
          {t("View all applications")}
        </Link>
      </div>
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-semibold">
            {t("Submitted · Awaiting review")}
          </h2>
          <dl className="grid gap-4 break-words sm:grid-cols-2">
            {[
              ["Application reference", a.id],
              ["Submitted at", formatDate(a.submittedAt)],
              ["Linked account", a.maskedAccountNumber],
              ["Contact email", a.contactEmail],
              ...(a.monthlyIncome
                ? [["Monthly income", formatMoney(a.monthlyIncome)]]
                : []),
              ...(a.requestedAmount
                ? [
                    ["Requested amount", formatMoney(a.requestedAmount)],
                    ["Term (months)", String(a.termMonths)],
                    ["Loan purpose", t(a.purpose ?? "")],
                  ]
                : []),
              ...detailRows(a.applicationDetails),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{t(label)}</dt>
                <dd className="mt-1 break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold">{t("What happens next")}</h2>
          <p>
            {t(
              "Your application has been stored for review. There is no automated decision or issuance process in this demo.",
            )}
          </p>
          <p>
            {t(
              "You can return to this page to review the submitted details. Existing active accounts and cards are managed separately in My banking.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
export function ApplicationForm({
  productId = "",
  inline = false,
}: {
  productId?: string;
  inline?: boolean;
}) {
  const { t, errorMessage } = useLocale();
  const router = useRouter();
  const products = useCatalog();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
  });
  const submit = useSubmitApplication();
  const [draft, setDraft] = useState<ApplicationRequest | null>(null);
  const [selected, setSelected] = useState(productId);
  const [review, setReview] = useState<ApplicationRequest | null>(null);
  const [verificationIntent, setVerificationIntent] =
    useState<ApplicationIntent>();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const available =
    products.data?.items.filter((p) =>
      applicationProductTypes.includes(p.type),
    ) ?? [];
  const product = available.find((p) => p.id === selected);
  const eligible =
    accounts.data?.accounts.filter(
      (a) =>
        a.status === "ACTIVE" &&
        a.currency === "CNY" &&
        (product?.type !== "OVERDRAFT" || a.type === "CURRENT"),
    ) ?? [];
  if (submittedId) return <ApplicationDetail id={submittedId} inline />;
  if (products.isPending || accounts.isPending)
    return <p role="status">{t("Loading…")}</p>;
  if (products.isError || accounts.isError)
    return (
      <div role="alert">
        {t("Unable to load application options.")}
        <Button
          onClick={() => {
            void products.refetch();
            void accounts.refetch();
          }}
        >
          {t("Retry")}
        </Button>
      </div>
    );
  return (
    <div className="max-w-2xl space-y-6">
      {!inline && (
        <Link href="/app/applications" className="underline">
          {t("My applications")}
        </Link>
      )}
      <h1 className="text-3xl font-semibold">{t("Apply for a product")}</h1>
      <Notice />
      {!eligible.length ? (
        <p role="alert">{t("An active CNY account is required to apply.")}</p>
      ) : (
        <Card>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (submit.isPending || preparing) return;
                setError("");
                if (!review) {
                  const data = new FormData(e.currentTarget);
                  if (!product) return;
                  const money = (name: string) => {
                    const v = String(data.get(name));
                    if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(v))
                      throw new Error(
                        "Enter a valid amount with up to two decimal places.",
                      );
                    const [whole, fraction = ""] = v.split(".");
                    return {
                      amount: `${whole}.${fraction.padEnd(2, "0")}`,
                      currency: "CNY" as const,
                    };
                  };
                  try {
                    const contactEmail = String(
                      data.get("contactEmail"),
                    ).trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
                      throw new Error(
                        "Enter a valid contact email, such as name@example.com.",
                      );
                    const r: ApplicationRequest = {
                      productId: product.id,
                      accountId: String(data.get("accountId")),
                      contactEmail,
                      consent: true,
                    };
                    if (
                      [
                        "CREDIT_CARD",
                        "PERSONAL_LOAN",
                        "MORTGAGE",
                        "OVERDRAFT",
                      ].includes(product.type)
                    )
                      r.monthlyIncome = money("monthlyIncome");
                    if (product.type === "PERSONAL_LOAN") {
                      r.requestedAmount = money("requestedAmount");
                      r.termMonths = Number(data.get("termMonths")) as
                        6 | 12 | 24 | 36;
                      r.purpose = String(
                        data.get("purpose"),
                      ) as ApplicationRequest["purpose"];
                    } else if (product.type === "MORTGAGE") {
                      r.requestedAmount = money("requestedAmount");
                      r.termMonths = Number(
                        data.get("termMonths"),
                      ) as ApplicationRequest["termMonths"];
                      r.purpose = "HOME_PURCHASE";
                    } else if (product.type === "OVERDRAFT") {
                      r.requestedAmount = money("requestedAmount");
                    }
                    const details: Details = {};
                    if (["DEBIT_CARD", "CREDIT_CARD"].includes(product.type))
                      details.cardUsage = String(
                        data.get("cardUsage"),
                      ) as Details["cardUsage"];
                    if (
                      [
                        "CREDIT_CARD",
                        "PERSONAL_LOAN",
                        "MORTGAGE",
                        "OVERDRAFT",
                      ].includes(product.type)
                    )
                      details.employmentStatus = String(
                        data.get("employmentStatus"),
                      ) as Details["employmentStatus"];
                    if (product.type === "SAVINGS_ACCOUNT") {
                      details.savingsGoal = String(
                        data.get("savingsGoal"),
                      ) as Details["savingsGoal"];
                      details.plannedMonthlyContribution = money(
                        "plannedMonthlyContribution",
                      );
                    }
                    if (
                      [
                        "life-insurance",
                        "health-insurance",
                        "home-insurance",
                      ].includes(product.id)
                    )
                      details.coverageAmount = money("coverageAmount");
                    if (product.id === "life-insurance")
                      details.beneficiaryRelationship = String(
                        data.get("beneficiaryRelationship"),
                      ) as Details["beneficiaryRelationship"];
                    if (product.id === "health-insurance")
                      details.householdSize = Number(data.get("householdSize"));
                    if (product.id === "travel-insurance") {
                      details.tripStartDate = String(data.get("tripStartDate"));
                      details.tripEndDate = String(data.get("tripEndDate"));
                      if (details.tripEndDate <= details.tripStartDate)
                        throw new Error(
                          "Trip end date must be after the start date.",
                        );
                    }
                    if (
                      product.id === "home-insurance" ||
                      product.type === "MORTGAGE"
                    )
                      details.propertyType = String(
                        data.get("propertyType"),
                      ) as Details["propertyType"];
                    r.applicationDetails = details;
                    setPreparing(true);
                    const prepared = await prepareApplication(r);
                    setDraft(r);
                    setReview(prepared.request);
                    setVerificationIntent(prepared);
                  } catch (err) {
                    setError(
                      err instanceof ApiError
                        ? (errorMessage(err) ?? "INVALID_REQUEST")
                        : err instanceof Error
                          ? err.message
                          : "INVALID_REQUEST",
                    );
                  }
                  setPreparing(false);
                  return;
                }
              }}
            >
              {review ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">
                    {t("Review application")}
                  </h2>
                  <p>{t(product?.title ?? "")}</p>
                  <p>
                    {t("Linked account")}:{" "}
                    {
                      eligible.find((a) => a.id === review.accountId)
                        ?.maskedAccountNumber
                    }
                  </p>
                  <p>
                    {t("Contact email")}: {review.contactEmail}
                  </p>
                  {review.monthlyIncome && (
                    <p>
                      {t("Monthly income")}: {formatMoney(review.monthlyIncome)}
                    </p>
                  )}
                  {review.requestedAmount && (
                    <>
                      <p>
                        {t("Requested amount")}:{" "}
                        {formatMoney(review.requestedAmount)}
                      </p>
                      {review.termMonths && (
                        <p>
                          {t("Term (months)")}: {review.termMonths}
                        </p>
                      )}
                      {review.purpose && (
                        <p>
                          {t("Loan purpose")}: {t(review.purpose)}
                        </p>
                      )}
                    </>
                  )}
                  {detailRows(review.applicationDetails).map(
                    ([label, value]) => (
                      <p key={label}>
                        {t(label)}: {t(value)}
                      </p>
                    ),
                  )}
                </div>
              ) : (
                <>
                  <label className="block">
                    {t("Product")}
                    <select
                      required
                      className={field}
                      value={selected}
                      disabled={inline}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        submit.reset();
                      }}
                    >
                      <option value="">{t("Choose a product")}</option>
                      {available.map((p) => (
                        <option key={p.id} value={p.id}>
                          {t(p.title)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    {t("Linked account")}
                    <select
                      name="accountId"
                      required
                      className={field}
                      defaultValue={draft?.accountId}
                    >
                      {eligible.map((a) => (
                        <option value={a.id} key={a.id}>
                          {t(a.displayName)} · {a.maskedAccountNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    {t("Contact email")}
                    <input
                      name="contactEmail"
                      defaultValue={draft?.contactEmail}
                      type="email"
                      maxLength={254}
                      title={t(
                        "Enter a valid contact email, such as name@example.com.",
                      )}
                      required
                      className={field}
                    />
                  </label>
                  {product &&
                    [
                      "CREDIT_CARD",
                      "PERSONAL_LOAN",
                      "MORTGAGE",
                      "OVERDRAFT",
                    ].includes(product.type) && (
                      <label className="block">
                        {t("Monthly income (CNY)")}
                        <input
                          name="monthlyIncome"
                          defaultValue={draft?.monthlyIncome?.amount}
                          type="number"
                          min="1"
                          max="10000000"
                          step="0.01"
                          required
                          className={field}
                        />
                      </label>
                    )}
                  {product &&
                    ["DEBIT_CARD", "CREDIT_CARD"].includes(product.type) && (
                      <label className="block">
                        {t("Card use")}
                        <select
                          name="cardUsage"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails?.cardUsage ?? "EVERYDAY"
                          }
                        >
                          {["EVERYDAY", "TRAVEL", "ONLINE"].map((v) => (
                            <option key={v} value={v}>
                              {t(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  {product &&
                    [
                      "CREDIT_CARD",
                      "PERSONAL_LOAN",
                      "MORTGAGE",
                      "OVERDRAFT",
                    ].includes(product.type) && (
                      <label className="block">
                        {t("Employment status")}
                        <select
                          name="employmentStatus"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails?.employmentStatus ??
                            "EMPLOYED"
                          }
                        >
                          {[
                            "EMPLOYED",
                            "SELF_EMPLOYED",
                            "STUDENT",
                            "RETIRED",
                            "OTHER",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {t(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  {product?.type === "SAVINGS_ACCOUNT" && (
                    <>
                      <label className="block">
                        {t("Savings goal")}
                        <select
                          name="savingsGoal"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails?.savingsGoal ?? "GENERAL"
                          }
                        >
                          {["EMERGENCY", "PLANNED_PURCHASE", "GENERAL"].map(
                            (v) => (
                              <option key={v} value={v}>
                                {t(v)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="block">
                        {t("Planned monthly contribution (CNY)")}
                        <input
                          name="plannedMonthlyContribution"
                          type="number"
                          min="1"
                          max="1000000"
                          step="0.01"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails
                              ?.plannedMonthlyContribution?.amount
                          }
                        />
                      </label>
                    </>
                  )}
                  {product &&
                    [
                      "life-insurance",
                      "health-insurance",
                      "home-insurance",
                    ].includes(product.id) && (
                      <label className="block">
                        {t("Requested coverage (CNY)")}
                        <input
                          name="coverageAmount"
                          type="number"
                          min="10000"
                          max="10000000"
                          step="0.01"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails?.coverageAmount?.amount
                          }
                        />
                      </label>
                    )}
                  {product?.id === "life-insurance" && (
                    <label className="block">
                      {t("Beneficiary relationship")}
                      <select
                        name="beneficiaryRelationship"
                        required
                        className={field}
                        defaultValue={
                          draft?.applicationDetails?.beneficiaryRelationship ??
                          "SPOUSE"
                        }
                      >
                        {["SPOUSE", "CHILD", "PARENT", "OTHER"].map((v) => (
                          <option key={v} value={v}>
                            {t(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {product?.id === "health-insurance" && (
                    <label className="block">
                      {t("People to cover")}
                      <input
                        name="householdSize"
                        type="number"
                        min="1"
                        max="10"
                        step="1"
                        required
                        className={field}
                        defaultValue={
                          draft?.applicationDetails?.householdSize ?? 1
                        }
                      />
                    </label>
                  )}
                  {product?.id === "travel-insurance" && (
                    <>
                      <label className="block">
                        {t("Trip starts")}
                        <input
                          name="tripStartDate"
                          type="date"
                          required
                          className={field}
                          defaultValue={
                            draft?.applicationDetails?.tripStartDate
                          }
                        />
                      </label>
                      <label className="block">
                        {t("Trip ends")}
                        <input
                          name="tripEndDate"
                          type="date"
                          required
                          className={field}
                          defaultValue={draft?.applicationDetails?.tripEndDate}
                        />
                      </label>
                    </>
                  )}
                  {(product?.id === "home-insurance" ||
                    product?.type === "MORTGAGE") && (
                    <label className="block">
                      {t("Property type")}
                      <select
                        name="propertyType"
                        required
                        className={field}
                        defaultValue={
                          draft?.applicationDetails?.propertyType ?? "APARTMENT"
                        }
                      >
                        {["APARTMENT", "HOUSE", "OTHER"].map((v) => (
                          <option key={v} value={v}>
                            {t(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {product?.type === "PERSONAL_LOAN" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "Demo application limits: CNY 1,000–200,000; 6–36 months. These are not lending offers.",
                        )}
                      </p>
                      <label className="block">
                        {t("Requested amount (CNY)")}
                        <input
                          name="requestedAmount"
                          defaultValue={draft?.requestedAmount?.amount}
                          type="number"
                          min="1000"
                          max="200000"
                          step="0.01"
                          required
                          className={field}
                        />
                      </label>
                      <label className="block">
                        {t("Term (months)")}
                        <select
                          className={field}
                          name="termMonths"
                          defaultValue={draft?.termMonths ?? 6}
                        >
                          {[6, 12, 24, 36].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        {t("Loan purpose")}
                        <select
                          name="purpose"
                          className={field}
                          defaultValue={draft?.purpose ?? "PERSONAL"}
                        >
                          {["PERSONAL", "EDUCATION", "HOME_IMPROVEMENT"].map(
                            (p) => (
                              <option key={p} value={p}>
                                {t(p)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </>
                  )}
                  {product?.type === "MORTGAGE" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "Demo mortgage request: CNY 100,000–5,000,000 over 10–30 years. Submission does not approve a loan.",
                        )}
                      </p>
                      <label className="block">
                        {t("Requested amount (CNY)")}
                        <input
                          name="requestedAmount"
                          defaultValue={draft?.requestedAmount?.amount}
                          type="number"
                          min="100000"
                          max="5000000"
                          step="0.01"
                          required
                          className={field}
                        />
                      </label>
                      <label className="block">
                        {t("Term (months)")}
                        <select
                          name="termMonths"
                          defaultValue={draft?.termMonths ?? 120}
                          className={field}
                        >
                          {[120, 240, 360].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {product?.type === "OVERDRAFT" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "Demo overdraft request: CNY 1,000–100,000. Submission does not approve a borrowing limit.",
                        )}
                      </p>
                      <label className="block">
                        {t("Requested overdraft limit (CNY)")}
                        <input
                          name="requestedAmount"
                          defaultValue={draft?.requestedAmount?.amount}
                          type="number"
                          min="1000"
                          max="100000"
                          step="0.01"
                          required
                          className={field}
                        />
                      </label>
                    </>
                  )}
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      required
                      type="checkbox"
                      className="mt-1"
                      defaultChecked={draft?.consent}
                    />
                    {t(
                      "I confirm these details are accurate and consent to storing this application for review.",
                    )}
                  </label>
                </>
              )}
              {error && <p role="alert">{t(error)}</p>}
              {submit.isError && (
                <p role="alert">{errorMessage(submit.error)}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {review && (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={submit.isPending}
                    onClick={() => {
                      setReview(null);
                      setVerificationIntent(undefined);
                      submit.reset();
                    }}
                  >
                    {t("Edit application")}
                  </Button>
                )}
                {review && verificationIntent ? (
                  <ActionVerification
                    key={verificationIntent.id}
                    action={verificationIntent.actionType}
                    resourceType="APPLICATION_INTENT"
                    resourceId={verificationIntent.id}
                    resourceHash={verificationIntent.intentHash}
                    label="Submit application"
                    disabled={submit.isPending}
                    onVerified={async (actionAuthorizationId) => {
                      const body = JSON.stringify(review);
                      if (!attempt.current || attempt.current.body !== body)
                        attempt.current = { body, key: crypto.randomUUID() };
                      try {
                        const result = await submit.mutateAsync({
                          request: {
                            ...review,
                            intentId: verificationIntent.id,
                            intentHash: verificationIntent.intentHash,
                            actionAuthorizationId: actionAuthorizationId!,
                          },
                          key: attempt.current.key,
                        });
                        if (inline) setSubmittedId(result.id);
                        else router.push(`/app/applications/${result.id}`);
                      } catch {
                        /* Keep the same key for a safe retry. */
                      }
                    }}
                  />
                ) : (
                  <Button disabled={!product || submit.isPending || preparing}>
                    {t(
                      preparing
                        ? "Preparing verification…"
                        : "Review application",
                    )}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
