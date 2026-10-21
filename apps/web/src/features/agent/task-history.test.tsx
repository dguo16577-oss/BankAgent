import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskHistory } from "./task-history";
afterEach(() => vi.unstubAllGlobals());
it("reads history without installing an old confirmation or making a mutation", async () => {
  const row = {
    task_id: "a".repeat(32),
    goal: "Transfer 10",
    status: "WAITING_CONFIRMATION",
    read_only: true,
    confirmation_required: false,
    next_action: "NEW_REVIEW_REQUIRED",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ tasks: [row] }))
    .mockResolvedValueOnce(Response.json({ ...row, receipts: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<TaskHistory />);
  fireEvent.click(
    screen.getByRole("button", {
      name: /View read-only task history|查看只读任务历史/,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Transfer 10/ }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: /Transfer 10/ }));
  await waitFor(() =>
    expect(screen.getByText("NEW_REVIEW_REQUIRED")).toBeInTheDocument(),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, options] of fetcher.mock.calls) {
    expect(options.body).toBeUndefined();
    expect(options.method).toBeUndefined();
  }
  expect(
    screen.queryByText(/Verify and confirm|验证并确认/),
  ).not.toBeInTheDocument();
});
