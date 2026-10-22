import { expect, it } from "vitest";
import fixture from "./__fixtures__/release-responses.json";
import { parseAgentMessage } from "./agent-contract";

it("distinguishes raw AgentResponse from the UI-only task wrapper", () => {
  const raw = fixture.responses.completed;
  expect(raw).not.toHaveProperty("task");
  const ui = parseAgentMessage(raw);
  expect(ui.task?.taskId).toBe(raw.task_id);
  expect(ui.task?.receipt?.id).toBe(raw.receipt?.id);
  expect(ui.task?.status).toBe("SUCCEEDED");
});

it("accepts clarification without assuming a confirmation must exist", () => {
  const ui = parseAgentMessage(fixture.responses.ambiguous);
  expect(ui.task?.status).toBe("WAITING_USER");
  expect(ui.task?.options).toHaveLength(2);
  expect(ui.task?.confirmation).toBeUndefined();
});

it("recognizes prepared, rejected and uncertain outcomes independently", () => {
  expect(
    parseAgentMessage(fixture.responses.prepared).task?.confirmationKind,
  ).toBe("TRANSFER");
  expect(parseAgentMessage(fixture.responses.failed).task?.status).toBe(
    "FAILED",
  );
  expect(parseAgentMessage(fixture.responses.unknown).task?.errorCode).toBe(
    "EXECUTION_OUTCOME_UNKNOWN",
  );
  expect(parseAgentMessage(fixture.responses.unknown).task?.status).toBe(
    "PARTIAL",
  );
  expect(
    parseAgentMessage(fixture.responses.unknown).task?.confirmation,
  ).toBeUndefined();
  expect(
    parseAgentMessage(fixture.responses.unknown).task?.receipt,
  ).toBeUndefined();
});

it("compares the top-level receipts of duplicate confirmation responses", () => {
  expect(fixture.responses.repeated.receipt).toEqual(
    fixture.responses.completed.receipt,
  );
  expect(parseAgentMessage(fixture.responses.repeated).task?.receipt).toEqual(
    parseAgentMessage(fixture.responses.completed).task?.receipt,
  );
  // This fixture assertion is not a database side-effect measurement.
  expect(fixture.provenance.execution_level).toBe(
    "DETERMINISTIC_RUNTIME_FAKE_BANK",
  );
});
