export const minor = (value: string) => BigInt(value.replace(".", ""));
export const decimal = (value: bigint) => {
  const digits = (value < BigInt(0) ? -value : value)
    .toString()
    .padStart(3, "0");
  return `${value < BigInt(0) ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
export function percentage(value: bigint, base: bigint): string | null {
  if (base === BigInt(0)) return null;
  const rounded =
    ((value < BigInt(0) ? -value : value) * BigInt(10000) + base / BigInt(2)) /
    base;
  return decimal(value < BigInt(0) ? -rounded : rounded);
}
