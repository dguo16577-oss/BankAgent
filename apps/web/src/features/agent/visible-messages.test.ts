import { expect, it } from "vitest";
import { visibleMessages } from "./visible-messages";

it("omits empty/tool-only bubbles while retaining failures, receipts and visible parts", () => {
  const result = visibleMessages([
    { id: "a", role: "assistant", content: "  " },
    { id: "b", role: "assistant", content: undefined },
    { id: "c", role: "tool", content: "internal observation" },
    {
      id: "d",
      role: "assistant",
      content: [{ type: "tool-call", name: "list_accounts" }],
    },
    { id: "e", role: "assistant", content: "银行结果尚未核实" },
    {
      id: "f",
      role: "assistant",
      content: [{ type: "text", text: "已核实回执" }],
    },
    { id: "g", role: "user", content: "查看账户" },
    { id: "h", role: "assistant", content: "\u200B\uFEFF" },
  ]);
  expect(result.map((m) => m.id)).toEqual(["e", "f", "g"]);
  expect(result[1].visibleText).toBe("已核实回执");
});
