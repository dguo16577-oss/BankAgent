import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { SessionUser } from "./session-user";

function renderUser() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessionUser />
    </QueryClientProvider>,
  );
}
it("shows loading then the name supplied by the API", async () => {
  server.use(
    http.get("/customer/session", () =>
      HttpResponse.json({
        user: { id: "test-user", displayName: "API Supplied Name" },
      }),
    ),
  );
  renderUser();
  expect(screen.getByRole("status")).toHaveTextContent("Loading user");
  expect(await screen.findByText("API Supplied Name")).toBeInTheDocument();
});
it("lets the user retry a failed session request", async () => {
  server.use(
    http.get(
      "/customer/session",
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  renderUser();
  const retry = await screen.findByRole(
    "button",
    { name: "Retry loading user" },
    { timeout: 4000 },
  );
  server.resetHandlers();
  await userEvent.click(retry);
  expect(await screen.findByText("Alex Chen")).toBeInTheDocument();
});
