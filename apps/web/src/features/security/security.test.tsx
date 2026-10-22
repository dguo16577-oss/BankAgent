import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { bankingStore } from "@/mocks/bank/store";
import { CardService } from "@/mocks/bank/card-service";
import { securityFixture } from "@/mocks/data/security-fixture";
import { LoginForm } from "./login-form";
import { AuthBoundary } from "./auth-boundary";
import { StepUpPage } from "./step-up-page";
import { CardActionReview } from "@/features/cards/card-action-review";
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
});
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
it("background Session expiry removes cached identity and Customer data, preserving Public", async () => {
  const client = mount(
    <AuthBoundary>
      <p>Protected balance</p>
    </AuthBoundary>,
  );
  await screen.findByText("Protected balance");
  for (const key of ["accounts", "step-up", "public"])
    client.setQueryDefaults([key], { gcTime: Infinity });
  client.setQueryData(["accounts"], { private: true });
  client.setQueryData(["step-up", "challenge"], { private: true });
  client.setQueryData(["public", "rates"], { anonymous: true });
  server.use(
    http.get("/customer/session", () =>
      HttpResponse.json(
        { code: "SESSION_EXPIRED", message: "Expired" },
        { status: 401 },
      ),
    ),
  );
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["session"] });
  });
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith("/login?reason=expired&next=%2F"),
  );
  expect(client.getQueryData(["session"])).toBeUndefined();
  expect(client.getQueryData(["accounts"])).toBeUndefined();
  expect(client.getQueryData(["step-up", "challenge"])).toBeUndefined();
  expect(client.getQueryData(["public", "rates"])).toEqual({ anonymous: true });
  expect(screen.queryByText("Protected balance")).not.toBeInTheDocument();
});
it("login form reports invalid credentials then returns to bank home on success", async () => {
  bankingStore.reset();
  mount(<LoginForm />);
  await userEvent.type(screen.getByLabelText("Email"), securityFixture.email);
  await userEvent.type(screen.getByLabelText("Password"), "incorrect");
  await userEvent.click(
    screen.getByRole("button", { name: "Sign in" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("incorrect");
  await userEvent.clear(screen.getByLabelText("Password"));
  await userEvent.type(
    screen.getByLabelText("Password"),
    securityFixture.password,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Sign in" }),
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
});
it("login explicitly explains demo authentication and session expiry", () => {
  mount(<LoginForm reason="expired" />);
  expect(screen.getByRole("alert")).toHaveTextContent("session expired");
  expect(
    screen.getByText(/does not connect to a real bank/),
  ).toBeInTheDocument();
});
it("protected boundary withholds banking children before authentication", async () => {
  bankingStore.reset();
  mount(
    <AuthBoundary>
      <p>Private balances</p>
    </AuthBoundary>,
  );
  expect(screen.queryByText("Private balances")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith(
      "/login?reason=signed-out&next=%2F",
    ),
  );
  expect(screen.queryByText("Private balances")).not.toBeInTheDocument();
});
it("expired session removes previously cached banking data", async () => {
  bankingStore.clock.advance(60 * 60_000);
  const client = mount(
    <AuthBoundary>
      <p>Private balances</p>
    </AuthBoundary>,
  );
  client.setQueryData(["accounts"], { secret: true });
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith("/login?reason=expired&next=%2F"),
  );
  expect(client.getQueryData(["accounts"])).toBeUndefined();
});
it("valid session renders protected content", async () => {
  mount(
    <AuthBoundary>
      <p>Private balances</p>
    </AuthBoundary>,
  );
  expect(await screen.findByText("Private balances")).toBeInTheDocument();
});
it("session network error permits retry without rendering banking children", async () => {
  server.use(
    http.get(
      "/customer/session",
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  mount(
    <AuthBoundary>
      <p>Private balances</p>
    </AuthBoundary>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be checked",
  );
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Private balances")).toBeInTheDocument();
});
async function intent() {
  const cards = new CardService(bankingStore);
  const f = await cards.prepare({
    cardId: "card_aster_debit",
    actionType: "FREEZE",
  });
  cards.execute({ intentId: f.id, intentHash: f.intentHash }, "freeze");
  return cards.prepare({ cardId: "card_aster_debit", actionType: "UNFREEZE" });
}
it("verification stays inside the card review, retries invalid factors and executes the original action", async () => {
  const i = await intent();
  mount(<CardActionReview cardId={i.card.id} intentId={i.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm card action" }),
  );
  await screen.findByLabelText("Account password");
  expect(nav.push).not.toHaveBeenCalled();
  expect(Object.values(bankingStore.read().stepUpChallenges)[0]).toMatchObject({
    resourceId: i.id,
    resourceHash: i.intentHash,
  });
  await userEvent.type(screen.getByLabelText("Account password"), "wrong");
  await userEvent.type(
    screen.getByLabelText("SMS verification code"),
    "999999",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Verify and continue" }),
  );
  await screen.findByText("Attempts remaining: 2");
  expect(screen.getByLabelText("Account password")).toHaveValue("");
  await userEvent.click(
    await screen.findByRole("button", { name: "View simulated SMS" }),
  );
  const sms = await screen.findByRole("status");
  const code = sms.textContent!.match(/\b[0-9]{6}\b/)![0];
  await userEvent.type(
    screen.getByLabelText("Account password"),
    securityFixture.password,
  );
  await userEvent.type(screen.getByLabelText("SMS verification code"), code);
  await userEvent.click(
    screen.getByRole("button", { name: "Verify and continue" }),
  );
  await waitFor(() =>
    expect(bankingStore.read().cards[0].status).toBe("ACTIVE"),
  );
  expect(
    Object.values(bankingStore.read().actionAuthorizations)[0].status,
  ).toBe("CONSUMED");
  expect(nav.push).not.toHaveBeenCalledWith(
    expect.stringContaining("/security/"),
  );
});
it("unknown verification shows an API error and retry", async () => {
  mount(<StepUpPage challengeId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("not found");
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

it("login includes a public home link", () => {
  bankingStore.reset();
  mount(<LoginForm />);
  expect(
    screen.getByRole("link", { name: "Back to bank home" }),
  ).toHaveAttribute("href", "/");
});
it.each([
  "https://example.com",
  "//example.com",
  "/login",
  "/api/customer/session",
])("does not accept an arbitrary return destination %s", async (next) => {
  mount(<LoginForm next={next} />);
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
});
it("preserves the requested application destination", async () => {
  mount(<LoginForm next="/app/applications/new?product=personal-loan" />);
  await waitFor(() =>
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/applications/new?product=personal-loan",
    ),
  );
});
