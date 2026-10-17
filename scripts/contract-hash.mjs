import crypto from "node:crypto";
export function canonical(value, key = "") {
  if (Array.isArray(value)) {
    const a = value.map((v) => canonical(v));
    return ["required", "enum"].includes(key) ? a.sort() : a;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(
          (k) =>
            [
              "properties",
              "schemas",
              "definitions",
              "$defs",
              "responses",
              "headers",
              "securitySchemes",
              "requestBodies",
              "callbacks",
              "links",
              "content",
              "paths",
            ].includes(key) ||
            !["description", "summary", "example", "examples"].includes(k),
        )
        .map((k) => [k, canonical(value[k], k)]),
    );
  return value;
}
export const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
