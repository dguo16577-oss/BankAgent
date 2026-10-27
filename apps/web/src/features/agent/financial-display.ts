// Display labels only. Never change bank amounts, filters or persisted evidence.
const categories: Record<string, [string, string]> = {
  HOUSING: ["住房", "Housing"],
  GROCERIES: ["日用食品", "Groceries"],
  SUBSCRIPTIONS: ["订阅", "Subscriptions"],
  DINING: ["餐饮", "Dining"],
  TRANSPORT: ["交通", "Transport"],
  SHOPPING: ["购物", "Shopping"],
  ENTERTAINMENT: ["娱乐", "Entertainment"],
  HEALTH: ["健康", "Health"],
  UTILITIES: ["生活缴费", "Utilities"],
  OTHER: ["其他", "Other"],
};

export function categoryLabel(value: string, zh: boolean) {
  return Object.hasOwn(categories, value)
    ? categories[value][zh ? 0 : 1]
    : value;
}

export function presentationTitle(value: string, zh: boolean) {
  const titles: Record<string, string> = {
    Spending: "消费总额",
    "Spending by category": "分类消费",
    "Spending trend": "消费趋势",
    Transactions: "交易记录",
    "Product comparison": "产品对比",
  };
  const suffix = " · YTD / Current period";
  const base = value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  return (
    (zh && Object.hasOwn(titles, base) ? titles[base] : base) +
    (value.endsWith(suffix) ? (zh ? " · 年初至今 / 本期" : suffix) : "")
  );
}

function instant(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parts(date: Date, originalFraction?: string) {
  const fields = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const field = (type: string) =>
    fields.find((item) => item.type === type)?.value;
  const day = `${field("year")}/${field("month")}/${field("day")}`;
  const clock = `${field("hour")}:${field("minute")}:${field("second")}`;
  const fraction =
    originalFraction ??
    (date.getUTCMilliseconds()
      ? String(date.getUTCMilliseconds()).padStart(3, "0")
      : "");
  return {
    day,
    clock,
    text: `${day} ${clock}${fraction ? `.${fraction}` : ""}`,
    midnight: clock === "00:00:00" && !/[1-9]/.test(fraction),
  };
}

export function displayPeriod(from: string, to: string, zh: boolean) {
  const start = instant(from),
    end = instant(to);
  if (!start || !end || end <= start) return `${from} – ${to}`;
  const left = parts(start, from.match(/\.(\d+)/)?.[1]),
    right = parts(end, to.match(/\.(\d+)/)?.[1]);
  if (left.midnight && right.midnight) {
    // The bank supplies half-open instants; a natural September ends Oct 1.
    return `${left.day} – ${parts(new Date(end.getTime() - 1)).day} · UTC+08:00`;
  }
  // Preserve explicit instants, including fractional seconds and exclusive end.
  return `${left.text} – ${right.text} ${zh ? "（不含结束时刻）" : "(end exclusive)"} · UTC+08:00`;
}
