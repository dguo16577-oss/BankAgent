import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichPresentation } from "./rich-presentation";

describe("service cards", () => {
  afterEach(() => {
    localStorage.removeItem("aster.locale");
    vi.restoreAllMocks();
  });
  it("shows the exclusive microsecond endpoint without expanding source details", () => {
    localStorage.setItem("aster.locale", "zh-CN");
    const raw = [
      {
        kind: "SUMMARY_CARD",
        title: "Spending",
        source: "summarize_spending",
        currency: "CNY",
        amount: "0.00",
        incomplete: false,
        date_range: {
          from: "2026-09-30T23:59:59.000001+08:00",
          to: "2026-09-30T23:59:59.000002+08:00",
        },
      },
    ];
    const before = JSON.stringify(raw);
    const { container } = render(
      <RichPresentation
        raw={raw}
        onAssist={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    expect(
      screen.getByText(
        "2026/09/30 23:59:59.000001 – 2026/09/30 23:59:59.000002 （不含结束时刻） · UTC+08:00",
      ),
    ).toBeVisible();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(JSON.stringify(raw)).toBe(before);
  });
  it("keeps source identifiers and repeated raw ranges in collapsed details", () => {
    localStorage.setItem("aster.locale", "zh-CN");
    const { container } = render(
      <RichPresentation
        raw={[
          {
            kind: "SUMMARY_CARD",
            title: "Spending",
            source: "summarize_spending",
            currency: "CNY",
            amount: "4973.75",
            incomplete: false,
            date_range: {
              from: "2026-09-01T00:00:00+08:00",
              to: "2026-10-01T00:00:00+08:00",
            },
            coverage: {
              status: "COMPLETE",
              requested_start: "2026-09-01T00:00:00+08:00",
              requested_end: "2026-10-01T00:00:00+08:00",
              covered_start: "2026-09-01T00:00:00+08:00",
              covered_end: "2026-10-01T00:00:00+08:00",
              as_of_time: "2026-10-27T00:00:00Z",
              missing_periods: [],
            },
          },
        ]}
        onAssist={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("数据完整")).toBeVisible();
    expect(
      screen.getByText("2026/09/01 – 2026/09/30 · UTC+08:00"),
    ).toBeVisible();
    expect(within(details).getByText("summarize_spending")).not.toBeVisible();
    expect(within(details).getByText("COMPLETE")).not.toBeVisible();
    details.open = true;
    expect(within(details).getByText("summarize_spending")).toBeVisible();
    expect(details).toHaveTextContent("2026-10-01T00:00:00+08:00");
    expect(screen.getByText("4973.75")).toBeVisible();
    localStorage.removeItem("aster.locale");
  });

  it("shows missing-data warnings without opening technical details", () => {
    localStorage.setItem("aster.locale", "zh-CN");
    render(
      <RichPresentation
        raw={[
          {
            kind: "SUMMARY_CARD",
            title: "Spending",
            source: "summarize_spending",
            currency: "CNY",
            amount: "100.00",
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
        ]}
        onAssist={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("存在缺失月份")).toBeVisible();
    expect(screen.getByText("缺失月份：2026-02")).toBeVisible();
    localStorage.removeItem("aster.locale");
  });

  it("shows long categories on horizontal bars and preserves exact table values", async () => {
    // jsdom has no layout; supply a measured container without mocking chart data.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const width = this.classList.contains("recharts-responsive-container")
          ? 700
          : 0;
        const height = width ? 256 : 0;
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          width,
          height,
          toJSON: () => ({}),
        };
      },
    );
    const assist = vi.fn(),
      cancel = vi.fn();
    const common = {
      title: "Spending by category",
      source: "summarize_spending",
      currency: "USD",
      date_range: { from: "2026-09-01", to: "2026-10-01" },
      incomplete: false,
    };
    const raw = [
      {
        ...common,
        kind: "BAR_CHART",
        points: [
          { label: "SUBSCRIPTIONS", amount: "621.32" },
          { label: "SHOPPING", amount: "10.01" },
        ],
      },
      {
        ...common,
        kind: "TABLE",
        columns: [
          { key: "label", label: "Category" },
          { key: "amount", label: "Amount" },
        ],
        rows: [
          { label: "SUBSCRIPTIONS", amount: "621.32" },
          { label: "SHOPPING", amount: "10.01" },
        ],
      },
    ];
    const original = JSON.stringify(raw);
    render(
      <RichPresentation
        raw={raw}
        onAssist={assist}
        onCancel={cancel}
        busy={false}
      />,
    );
    expect(await screen.findByText("Subscriptions")).toBeVisible();
    expect(await screen.findByText("Shopping")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View table" }));
    expect(screen.getByRole("table")).toHaveTextContent("621.32");
    expect(screen.getByRole("table")).toHaveTextContent("10.01");
    expect(JSON.stringify(raw)).toBe(original);
    expect(assist).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

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
