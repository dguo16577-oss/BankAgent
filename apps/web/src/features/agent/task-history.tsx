"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";

const summary = z.object({
  task_id: z.string().regex(/^[a-f0-9]{32}$/),
  goal: z.string(),
  status: z.string(),
  read_only: z.literal(true),
  confirmation_required: z.literal(false),
  next_action: z.enum(["NONE", "NEW_REVIEW_REQUIRED", "RECONCILE_WITH_BANK"]),
});
const detail = summary.extend({
  receipts: z
    .array(
      z.object({
        kind: z.string().optional(),
        receipt_id: z.string().optional(),
        verification: z.string(),
        bank_status: z.string().nullable().optional(),
      }),
    )
    .max(5),
});

export function TaskHistory() {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [tasks, setTasks] = useState<z.infer<typeof summary>[]>([]);
  const [selected, setSelected] = useState<z.infer<typeof detail>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function load(id?: string) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/agent/history${id ? `?taskId=${id}` : ""}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error("History unavailable");
      const data: unknown = await response.json();
      if (id) setSelected(detail.parse(data));
      else {
        setTasks(
          z.object({ tasks: z.array(summary).max(10) }).parse(data).tasks,
        );
        setSelected(undefined);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={zh ? "只读任务历史" : "Read-only task history"}
      className="rounded-xl border p-4 space-y-3"
    >
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        {zh ? "查看只读任务历史" : "View read-only task history"}
      </Button>
      <p className="text-sm text-muted-foreground">
        {zh
          ? "历史记录不会恢复旧会话的确认权限。待确认操作需要重新复核；无法核实的执行结果请向银行查询。"
          : "History does not restore old confirmation authority. Pending actions require a new review; uncertain results require bank reconciliation."}
      </p>
      {error && (
        <p role="alert">
          {zh
            ? "无法核实历史，请检查登录状态后重试。"
            : "History could not be verified. Check your sign-in and retry."}
        </p>
      )}
      {tasks.map((task) => (
        <div key={task.task_id}>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void load(task.task_id)}
          >
            {task.goal} · {task.status}
          </Button>
        </div>
      ))}
      {selected && (
        <div className="space-y-2 border-t pt-3">
          <p>
            {selected.goal} · {selected.status}
          </p>
          <p>{selected.next_action}</p>
          {selected.receipts.map((receipt, index) => (
            <p key={index}>
              {receipt.kind} · {receipt.receipt_id} · {receipt.verification} ·{" "}
              {receipt.bank_status}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
