# API surfaces

Current operation counts, generation steps and handoff tests: [OpenAPI handoff README](README.HANDOFF.md).

The OpenAPI files in this directory are the only machine DTO contracts. M9 freezes four URL namespaces:

| Namespace     | Audience / trust boundary                                                             | Status                         |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| `/public/*`   | Unauthenticated product discovery, reference information and navigation               | `public.yaml`                  |
| `/customer/*` | Authenticated customer capabilities shared by Customer Web and future Customer Mobile | `customer.yaml`                |
| `/admin/*`    | Staff operations, customer servicing, risk and audit                                  | Reserved; no file or endpoints |
| `/internal/*` | Trusted service-to-service capabilities and explicitly authorized orchestration       | Reserved; no file or endpoints |

URLs intentionally contain neither an API marker nor a version segment. Contract metadata versions do not appear in URLs. Login is the necessary unauthenticated entry within the customer surface; every other implemented customer endpoint retains its existing session requirement.

Run `pnpm api:generate` to generate both frontend type files. `pnpm api:check` and `pnpm typecheck` verify both outputs are current. There is one generated DTO set per implemented surface, with no duplicate handwritten request/response models.

UI routing is separate: `/` and public category pages are public; `/app/*` is the authenticated customer product; `/login` is the simulated authentication page. Browser navigation must never confuse public `/cards` with customer `/app/cards`, or public `/investments` with customer `/app/wealth`.
