import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer } from "./chat-composer";

it("submits with Enter but preserves Shift+Enter and IME composition", () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <ChatComposer
      id="test-message"
      value="查询余额"
      onChange={vi.fn()}
      onSubmit={submit}
    />,
  );
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(submit).toHaveBeenCalledTimes(1);
});

it("does not submit while busy or blank and keeps the draft editable", () => {
  const submit = vi.fn();
  const change = vi.fn();
  const view = render(
    <ChatComposer
      id="test-message"
      value=""
      onChange={change}
      onSubmit={submit}
    />,
  );
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  view.rerender(
    <ChatComposer
      id="test-message"
      value="查询余额"
      onChange={change}
      onSubmit={submit}
      busy
    />,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "改写草稿" },
  });
  expect(change).toHaveBeenCalledWith("改写草稿");
  expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "2000");
});
