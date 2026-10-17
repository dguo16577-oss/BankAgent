"use client";
import { useLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useTransferReceipt } from "./use-payments";
import { Fields, ResourceError } from "./payment-ui";
export function TransferReceiptPage({ transferId }: { transferId: string }) {
  const { t, formatDate } = useLocale();

  const query = useTransferReceipt(transferId);
  if (query.isPending)
    return <p role="status">{t("Loading transfer receipt…")}</p>;
  if (query.isError)
    return (
      <ResourceError error={query.error} retry={() => void query.refetch()} />
    );
  const receipt = query.data;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/payments" className="text-sm text-primary">
        {t("← Back to Payments")}
      </Link>
      <Card className="shadow-none">
        <CardContent className="space-y-7">
          <div>
            <CheckCircle2
              aria-hidden="true"
              className="mb-4 size-10 text-emerald-700"
            />
            <h1 className="text-3xl font-semibold">
              {t("Transfer completed")}
            </h1>
            <p
              className="mt-3 text-4xl font-semibold"
              data-testid="receipt-amount"
            >
              {t(formatMoney(receipt.amount))}
            </p>
          </div>
          <Fields
            items={[
              ["Status", "Completed"],
              [
                "Recipient",
                `${receipt.recipient.displayName} · ${receipt.recipient.maskedAccountNumber}`,
              ],
              ["Bank", receipt.recipient.bankName],
              [
                "Source account",
                `${receipt.sourceAccount.displayName} · ${receipt.sourceAccount.maskedAccountNumber}`,
              ],
              ["Fee", formatMoney(receipt.fee)],
              ["Total debit", formatMoney(receipt.totalDebit)],
              ["Reference", receipt.reference],
              [
                "Completed",
                `${formatDate(receipt.completedAt, true)} (UTC+08:00)`,
              ],
              ["Note", receipt.note || t("None")],
            ]}
          />
          <Button asChild>
            <Link
              href={`/app/transactions/${encodeURIComponent(receipt.transactionId)}`}
            >
              {t("View transaction")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
