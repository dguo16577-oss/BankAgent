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
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, y, m, d, h, minute, second, fraction = "", offset] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date may normalize invalid calendar dates or 24:00; those are not bank
  // instants we can safely relabel. Unknown values retain the original text.
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(h) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (offset !== "Z" &&
      (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))
  )
    return null;
  // Keep the whole second and decimal fraction separate. Date truncates
  // microseconds; it is used only for calendar/time-zone conversion here.
  const date = new Date(`${y}-${m}-${d}T${h}:${minute}:${second}${offset}`);
  return Number.isNaN(date.getTime()) ? null : { date, fraction };
}

function precedes(
  start: NonNullable<ReturnType<typeof instant>>,
  end: NonNullable<ReturnType<typeof instant>>,
) {
  if (start.date.getTime() !== end.date.getTime()) return start.date < end.date;
  const precision = Math.max(start.fraction.length, end.fraction.length);
  return (
    start.fraction.padEnd(precision, "0") < end.fraction.padEnd(precision, "0")
  );
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
  if (!start || !end || !precedes(start, end)) return `${from} – ${to}`;
  const left = parts(start.date, start.fraction),
    right = parts(end.date, end.fraction);
  if (left.midnight && right.midnight) {
    // The bank supplies half-open instants; a natural September ends Oct 1.
    return `${left.day} – ${parts(new Date(end.date.getTime() - 1)).day} · UTC+08:00`;
  }
  // Preserve explicit instants, including fractional seconds and exclusive end.
  return `${left.text} – ${right.text} ${zh ? "（不含结束时刻）" : "(end exclusive)"} · UTC+08:00`;
}
