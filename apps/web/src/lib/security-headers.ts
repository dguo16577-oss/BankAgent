export function securityHeaders(
  apiOrigin: string,
  development: boolean,
  https: boolean,
) {
  const connect = [
    "'self'",
    apiOrigin,
    ...(development ? ["ws://localhost:3000"] : []),
  ].filter(Boolean);
  return [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        // Static App Router hydration contains inline scripts; see ADR 0020.
        `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src ${connect.join(" ")}`,
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    ...(https
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
      : []),
  ];
}
