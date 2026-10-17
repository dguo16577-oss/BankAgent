/** Reference-only decimal conversion. All arithmetic stays in integer minor units. */
export function estimateFx(
  amount: string,
  fromRate: string,
  toRate: string,
): string | null {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount)) return null;
  const minor = decimal(amount, 2);
  const from = decimal(fromRate, 10);
  const to = decimal(toRate, 10);
  if (from <= BigInt(0) || to <= BigInt(0)) return null;
  const result = (minor * from + to / BigInt(2)) / to;
  return `${result / BigInt(100)}.${String(result % BigInt(100)).padStart(2, "0")}`;
}

function decimal(value: string, places: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) return BigInt(0);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places) return BigInt(0);
  return BigInt(whole + fraction.padEnd(places, "0"));
}
