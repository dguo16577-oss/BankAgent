import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { securityFixture } from "@/mocks/data/security-fixture";
export async function completeVerification() {
  await screen.findByRole("heading", { name: "Verify this action" });
  const password = screen.queryByLabelText("Account password");
  if (password) await userEvent.type(password, securityFixture.password);
  const otp = screen.queryByLabelText("SMS verification code");
  if (otp) {
    await userEvent.click(
      await screen.findByRole("button", { name: "View simulated SMS" }),
    );
    let code = "";
    await waitFor(() => {
      const text = screen.getByTestId("action-verification").textContent ?? "";
      code = text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
      if (!code) throw new Error("Waiting for simulated SMS");
    });
    await userEvent.type(otp, code);
  }
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Verify and continue" }),
  );
}
