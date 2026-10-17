"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useAccounts } from "@/features/accounts/use-accounts";
import {
  useProduct,
  useSuitability,
  useCreateSuitability,
  usePrepareInvestment,
} from "./use-wealth";
import {
  Panel,
  WealthError,
  SuitabilityEvidence,
  productHref,
  fieldClass,
} from "./wealth-ui";
const schema = z.object({
  sourceAccountId: z.string().min(1, "Choose a source account."),
  amount: z
    .string()
    .regex(
      /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
      "Enter an amount with at most two decimals.",
    )
    .refine(
      (value) => /[1-9]/.test(value),
      "Amount must be greater than zero.",
    ),
});
type Values = z.infer<typeof schema>;
export function NewInvestment({
  productId,
  checkId,
  inline = false,
  onPrepared,
}: {
  productId: string;
  checkId?: string;
  inline?: boolean;
  onPrepared?: (intentId: string) => void;
}) {
  const { t, errorMessage } = useLocale();

  const product = useProduct(productId),
    accounts = useAccounts(),
    evidence = useSuitability(checkId),
    check = useCreateSuitability(),
    prepare = usePrepareInvestment();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { sourceAccountId: "", amount: "" },
  });
  const submit = handleSubmit(async (values) => {
    if (!product.data) return;
    const [whole, fraction = ""] = values.amount.split(".");
    try {
      const suitability =
        evidence.data ?? (await check.mutateAsync({ productId }));
      if (suitability.result !== "SUITABLE") return;
      const intent = await prepare.mutateAsync({
        productId,
        sourceAccountId: values.sourceAccountId,
        amount: {
          amount: `${whole}.${fraction.padEnd(2, "0")}`,
          currency: product.data.currency,
        },
        suitabilityCheckId: suitability.id,
      });
      if (onPrepared) onPrepared(intent.id);
      else
        router.push(
          `/app/wealth/orders/review/${encodeURIComponent(intent.id)}`,
        );
    } catch {
      /* The API failure is displayed below. No local financial mutation. */
    }
  });
  if (
    product.isPending ||
    accounts.isPending ||
    (checkId && evidence.isPending)
  )
    return <p role="status">{t("Loading investment options…")}</p>;
  if (product.isError)
    return (
      <WealthError error={product.error} retry={() => void product.refetch()} />
    );
  if (accounts.isError)
    return (
      <WealthError
        error={accounts.error}
        retry={() => void accounts.refetch()}
      />
    );
  if (checkId && evidence.isError)
    return (
      <WealthError
        error={evidence.error}
        retry={() => void evidence.refetch()}
      />
    );
  const p = product.data,
    suitability = evidence.data ?? check.data;
  const blocked =
    suitability?.result === "NOT_SUITABLE" ||
    p.status !== "AVAILABLE" ||
    Boolean(suitability && suitability.productId !== productId);
  return (
    <div className="max-w-2xl space-y-6">
      {!inline && (
        <Link href={productHref(productId)} className="text-sm text-primary">
          {t("← Back to product")}
        </Link>
      )}
      <header>
        {inline ? (
          <h3 className="text-xl font-semibold">
            {t("Invest in")} {p.displayName}
          </h3>
        ) : (
          <h1 className="text-3xl font-semibold">
            {t("Invest in")} {p.displayName}
          </h1>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Enter an amount, then review the exact order before confirming.")}
        </p>
      </header>
      {suitability && <SuitabilityEvidence check={suitability} />}
      <Panel title={t("Investment amount")}>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <label className="block text-sm font-medium">
            {t("Source account")}
            <select
              aria-label={t("Source account")}
              {...register("sourceAccountId")}
              className={fieldClass}
            >
              <option value="">{t("Choose an account")}</option>
              {accounts.data.accounts.map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={a.status !== "ACTIVE" || a.currency !== p.currency}
                >
                  {a.displayName} · {t(formatMoney(a.availableBalance))}
                  {t(" available")}
                </option>
              ))}
            </select>
            {errors.sourceAccountId && (
              <span role="alert" className="mt-2 block text-destructive">
                {errorMessage(errors.sourceAccountId)}
              </span>
            )}
          </label>
          <label className="block text-sm font-medium">
            {t("Amount (")}
            {t(p.currency)})
            <input
              aria-label={t(`Amount (${p.currency})`)}
              {...register("amount")}
              inputMode="decimal"
              placeholder={t("0.00")}
              className={fieldClass}
            />
            {errors.amount && (
              <span role="alert" className="mt-2 block text-destructive">
                {errorMessage(errors.amount)}
              </span>
            )}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("Minimum ")}
            {t(formatMoney(p.minimumInvestment))}
            {t(" · Fee")}
            {t(" ")}
            {t(formatMoney(p.fees))}
          </p>
          {(prepare.isError || check.isError) && (
            <p role="alert">
              {t(prepare.error?.message ?? check.error?.message)}
              {t(
                " Return to the product for a fresh suitability check if needed.",
              )}
            </p>
          )}
          {blocked && (
            <p role="alert">
              {t(
                "This product cannot enter an executable purchase flow with the current suitability evidence or availability.",
              )}
            </p>
          )}
          <Button
            type="submit"
            disabled={blocked || isSubmitting || prepare.isSuccess}
          >
            {t(
              isSubmitting
                ? "Preparing investment…"
                : suitability
                  ? "Review investment"
                  : "Check suitability and review",
            )}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(p.disclaimer)}
          </p>
        </form>
      </Panel>
    </div>
  );
}
