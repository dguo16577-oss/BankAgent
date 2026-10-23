import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerContent } from "./answer-content";

it("formats headings, emphasis and lists without changing financial text", () => {
  const view = render(
    <AnswerContent
      text={
        "## 本月消费\n\n合计 **4968.00 CNY**\n- 餐饮 100.00 CNY\n- 其他 4868.00 CNY\n\n3. 请核对\n4. 独立确认"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "本月消费" })).toBeInTheDocument();
  expect(view.container.querySelector("strong")).toHaveTextContent(
    "4968.00 CNY",
  );
  expect(view.container.querySelectorAll("li")).toHaveLength(4);
  expect(view.container.querySelector("ol")).toHaveAttribute("start", "3");
});

it("does not turn model URLs, HTML, images or scripts into executable UI", () => {
  const view = render(
    <AnswerContent
      text={
        '[银行入口](https://attacker.example)\n<img src="https://attacker.example/pixel">\n<script>alert(1)</script>\n![image](https://attacker.example/pixel)'
      }
    />,
  );
  expect(
    view.container.querySelectorAll("a, img, script, iframe, button"),
  ).toHaveLength(0);
  expect(screen.getByText(/attacker.example/)).toBeInTheDocument();
});

it("renders code as inert text and preserves line breaks and exact numeric strings", () => {
  const view = render(
    <AnswerContent
      text={
        '```html\n<img onerror="run()">\n```\n\n余额 `0001.20 CNY`\n另一币种 -2.00 USD'
      }
    />,
  );
  expect(view.container.querySelector("pre code")).toHaveTextContent(
    '<img onerror="run()">',
  );
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container).toHaveTextContent("0001.20 CNY");
  expect(view.container).toHaveTextContent("-2.00 USD");
});
