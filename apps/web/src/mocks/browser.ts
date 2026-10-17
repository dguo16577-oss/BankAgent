import { setupWorker } from "msw/browser";
import { bankingStore } from "./bank/store";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
let startup: ReturnType<typeof worker.start> | undefined;
export function startMocking() {
  if (!startup) bankingStore.enablePersistence(window.sessionStorage);
  startup ??= worker.start({ onUnhandledRequest: "bypass", quiet: true });
  return startup;
}
