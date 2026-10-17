"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/features/accounts/use-accounts";
import { formatMoney } from "@/lib/money";
import { usePrepareTransfer, useRecipients } from "./use-payments";
import { fieldClass, PaymentError } from "./payment-ui";
const formSchema = z.object({
  sourceAccountId: z.string().min(1, "Choose a source account."),
  recipientId: z.string().min(1, "Choose a recipient."),
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
  note: z.string().max(140, "Use 140 characters or fewer."),
});
type Values = z.infer<typeof formSchema>;
export function NewTransfer({
  selectedRecipient = "",
}: {
  selectedRecipient?: string;
}) {
  const { t, errorMessage } = useLocale();

  const router = useRouter();
  const accounts = useAccounts();
  const recipients = useRecipients();
  const prepare = usePrepareTransfer();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceAccountId: "",
      recipientId: selectedRecipient,
      amount: "",
      note: "",
    },
  });
  const preselected = useRef(false);
  useEffect(() => {
    if (
      !preselected.current &&
      selectedRecipient &&
      recipients.data?.items.some((item) => item.id === selectedRecipient)
    ) {
      setValue("recipientId", selectedRecipient);
      preselected.current = true;
    }
  }, [recipients.data, selectedRecipient, setValue]);
  const submit = handleSubmit(async (values) => {
    const source = accounts.data?.accounts.find(
      (item) => item.id === values.sourceAccountId,
    );
    const recipient = recipients.data?.items.find(
      (item) => item.id === values.recipientId,
    );
    if (!source || !recipient) return;
    if (source.currency !== recipient.currency || source.currency !== "CNY") {
      setError("sourceAccountId", {
        message: "Choose a CNY account matching the recipient currency.",
      });
      return;
    }
    const [whole, fraction = ""] = values.amount.split(".");
    try {
      const intent = await prepare.mutateAsync({
        sourceAccountId: source.id,
        recipientId: recipient.id,
        amount: {
          amount: `${whole}.${fraction.padEnd(2, "0")}`,
          currency: source.currency,
        },
        note: values.note,
      });
      router.push(
        `/app/payments/transfers/review/${encodeURIComponent(intent.id)}`,
      );
    } catch {
      /* mutation error is displayed below */
    }
  });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/payments" className="text-sm text-primary">
        {t("← Back to Payments")}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">{t("New bank transfer")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Enter the details. You will review and confirm before any money moves.",
          )}
        </p>
      </div>
      {accounts.isError ? (
        <PaymentError
          error={accounts.error}
          retry={() => void accounts.refetch()}
        />
      ) : recipients.isError ? (
        <PaymentError
          error={recipients.error}
          retry={() => void recipients.refetch()}
        />
      ) : accounts.isPending || recipients.isPending ? (
        <p role="status">{t("Loading transfer options…")}</p>
      ) : (
        <Card className="shadow-none">
          <CardContent>
            <form onSubmit={submit} className="space-y-6" noValidate>
              <label className="block text-sm font-medium">
                {t("Source account")}
                <select
                  aria-label={t("Source account")}
                  {...register("sourceAccountId")}
                  className={fieldClass}
                >
                  <option value="">{t("Choose an account")}</option>
                  {accounts.data.accounts.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                      disabled={account.status !== "ACTIVE"}
                    >
                      {account.displayName} ·{t(" ")}
                      {t(formatMoney(account.availableBalance))}
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
                {t("Recipient")}
                <select
                  aria-label={t("Recipient")}
                  {...register("recipientId")}
                  className={fieldClass}
                >
                  <option value="">{t("Choose a recipient")}</option>
                  {recipients.data.items
                    .filter((item) => item.status !== "INACTIVE")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} · {item.maskedAccountNumber}
                      </option>
                    ))}
                </select>
                {errors.recipientId && (
                  <span role="alert" className="mt-2 block text-destructive">
                    {errorMessage(errors.recipientId)}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium">
                {t("Amount (CNY)")}
                <input
                  aria-label={t("Amount (CNY)")}
                  {...register("amount")}
                  inputMode="decimal"
                  className={fieldClass}
                  placeholder={t("0.00")}
                />
                {errors.amount && (
                  <span role="alert" className="mt-2 block text-destructive">
                    {errorMessage(errors.amount)}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium">
                {t("Note (optional)")}
                <textarea
                  aria-label={t("Note (optional)")}
                  {...register("note")}
                  maxLength={140}
                  className={`${fieldClass} h-24 py-3`}
                />
                {errors.note && (
                  <span role="alert" className="text-destructive">
                    {errorMessage(errors.note)}
                  </span>
                )}
              </label>
              {prepare.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage(prepare.error)}
                </p>
              )}
              <Button
                type="submit"
                disabled={isSubmitting || prepare.isPending}
              >
                {t(isSubmitting ? "Preparing review…" : "Review transfer")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("Demo domestic transfer · No FX or scheduled payments")}
              </p>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
