import { apiRuntime } from "./runtime";
const isMockWorker = (worker: ServiceWorker | null) =>
  !!worker &&
  new URL(worker.scriptURL).pathname.endsWith("/mockServiceWorker.js");
export async function prepareApiRuntime() {
  if (apiRuntime().mode === "mock") {
    const { startMocking } = await import("@/mocks/browser");
    await startMocking();
    return;
  }
  // Remove only our legacy mock state/worker, never unrelated app storage or workers.
  sessionStorage.removeItem("aster-banking-state-v1");
  sessionStorage.removeItem("aster-m4-banking-state-v1");
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    if (
      [registration.active, registration.waiting, registration.installing].some(
        isMockWorker,
      )
    ) {
      registration.active?.postMessage({ type: "CLIENT_CLOSED" });
      await registration.unregister();
    }
  }
  if (isMockWorker(navigator.serviceWorker.controller)) {
    window.location.reload();
    // Do not release API queries while the old document is still controlled.
    await new Promise<never>(() => {});
  }
}
