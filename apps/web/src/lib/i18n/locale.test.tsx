import { Fields } from "@/features/payments/payment-ui";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AccountsList } from "@/features/accounts/accounts-list";
import { LocaleDocument, localeStorageKey, useLocale } from "./locale";

function Sample() {
  const { t, formatDate, errorMessage } = useLocale();
  return (
    <>
      <LanguageSwitcher />
      <LocaleDocument />
      <h1>{t("Accounts")}</h1>
      <p>{formatDate("2026-09-27T09:00:00+08:00")}</p>
      <p role="alert">
        {errorMessage({
          code: "INVALID_CREDENTIALS",
          message: "Invalid credentials",
        })}
      </p>
      <input aria-label="Unchanged input" defaultValue="100.00" />
    </>
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.lang = "en";
});
it("switches both ways, saves preference and preserves input", async () => {
  render(<Sample />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "zh-CN");
  expect(screen.getByRole("heading")).toHaveTextContent("账户");
  expect(screen.getByRole("alert")).toHaveTextContent("邮箱或密码不正确");
  expect(screen.getByText("2026年9月27日")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(localStorage.getItem(localeStorageKey)).toBe("zh-CN");
  expect(screen.getByLabelText("Unchanged input")).toHaveValue("100.00");
  await userEvent.selectOptions(screen.getByRole("combobox"), "en");
  expect(screen.getByRole("heading")).toHaveTextContent("Accounts");
  expect(document.documentElement.lang).toBe("en");
});
it("restores preference after remount and follows other tabs", async () => {
  localStorage.setItem(localeStorageKey, "zh-CN");
  const view = render(<Sample />);
  expect(screen.getByRole("heading")).toHaveTextContent("账户");
  view.unmount();
  render(<Sample />);
  expect(screen.getByRole("combobox")).toHaveValue("zh-CN");
  act(() => {
    localStorage.setItem(localeStorageKey, "en");
    window.dispatchEvent(
      new StorageEvent("storage", { key: localeStorageKey }),
    );
  });
  expect(screen.getByRole("heading")).toHaveTextContent("Accounts");
});
it("falls back to English for an unsupported persisted preference", () => {
  localStorage.setItem(localeStorageKey, "not-a-locale");
  render(<Sample />);
  expect(screen.getByRole("combobox")).toHaveValue("en");
});
it("localizes API-backed account UI while preserving balances and IDs", async () => {
  localStorage.setItem(localeStorageKey, "zh-CN");
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <AccountsList />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("accounts-total")).toHaveTextContent(
      "¥36,453.68",
    ),
  );
  expect(screen.getByRole("heading", { name: "账户" })).toBeVisible();
  expect(screen.getAllByText("可用余额").length).toBeGreaterThan(0);
  expect(screen.getByText("CNY Current")).toBeInTheDocument();
  expect(screen.getAllByText("$621.32")).toHaveLength(2);
});
it("keeps switching usable if preference storage is blocked", async () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  render(<Sample />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "zh-CN");
  expect(screen.getByRole("heading")).toHaveTextContent("账户");
  spy.mockRestore();
  await userEvent.selectOptions(screen.getByRole("combobox"), "en");
});

it("does not translate user notes or bank names that match dictionary keys", () => {
  localStorage.setItem(localeStorageKey, "zh-CN");
  render(
    <Fields
      items={[
        ["Note", "Transfer"],
        ["Bank", "Banking"],
      ]}
    />,
  );
  expect(screen.getByText("备注")).toBeInTheDocument();
  expect(screen.getByText("Transfer")).toBeInTheDocument();
  expect(screen.getByText("Banking")).toBeInTheDocument();
});
