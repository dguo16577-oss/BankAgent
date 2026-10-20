import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichPresentation } from "./rich-presentation";

describe("service cards", () => {
  it("restores coverage metadata with exact summary amounts", () => {
    const raw = [
      {
        kind: "SUMMARY_CARD",
        title: "Spending",
        source: "summarize_spending",
        currency: "CNY",
        amount: "999999999999.99",
        incomplete: true,
        date_range: { from: "2026-01-01", to: "2026-10-15" },
        coverage: {
          status: "MISSING_PERIODS",
          requested_start: "2026-01-01",
          requested_end: "2027-01-01",
          covered_start: "2026-01-01",
          covered_end: "2026-10-15",
          as_of_time: "2026-10-15",
          missing_periods: ["2026-02"],
        },
      },
    ];
    const { unmount } = render(
      <RichPresentation
        raw={JSON.parse(JSON.stringify(raw))}
        onAssist={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("999999999999.99")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-note")).toHaveTextContent(
      "MISSING_PERIODS",
    );
    expect(screen.getByTestId("coverage-note")).toHaveTextContent("2026-02");
    unmount();
  });
  it("opens only a trusted page and never starts assistance on link display", () => {
    const assist = vi.fn();
    const cancel = vi.fn();
    render(
      <RichPresentation
        raw={[
          { kind: "SERVICE_CARD", service_id: "transfer" },
          { kind: "AGENT_ASSISTANCE", service_id: "transfer", accepted: false },
          { kind: "SERVICE_CARD", service_id: "https://evil.example" },
        ]}
        onAssist={assist}
        onCancel={cancel}
        busy={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open bank page" }),
    ).toHaveAttribute("href", "/app/payments");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(assist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Accept assistance" }));
    expect(assist).toHaveBeenCalledWith("transfer");
  });

  it("dismisses an unaccepted offer without a bank request", () => {
    const cancel = vi.fn();
    render(
      <RichPresentation
        raw={[
          { kind: "AGENT_ASSISTANCE", service_id: "cards", accepted: false },
        ]}
        onAssist={vi.fn()}
        onCancel={cancel}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel assistance" }));
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Agent assistance")).not.toBeInTheDocument();
  });

  it("filters, sorts and pages bank-provided transaction rows", () => {
    render(
      <RichPresentation
        raw={[
          {
            kind: "TABLE",
            title: "Transactions",
            source: "list_transactions",
            columns: [
              { key: "label", label: "Label" },
              { key: "amount", label: "Amount" },
            ],
            rows: Array.from({ length: 11 }, (_, index) => ({
              label: `row ${String(index).padStart(2, "0")}`,
              amount: `${index}.00`,
            })),
            incomplete: false,
          },
        ]}
        onAssist={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(within(table).getByText("row 10")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter table" }), {
      target: { value: "row 03" },
    });
    expect(within(table).getByText("row 03")).toBeInTheDocument();
    expect(within(table).queryByText("row 10")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter table" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Amount" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("row 10");
  });
});
