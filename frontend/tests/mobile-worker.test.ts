import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const cached: string[] = [];
  const deleted: string[] = [];
  vm.runInNewContext(source, {
    URL,
    self: { location: { origin: "https://vesyn.test" }, addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async () => new Response('<script src="/_next/static/mobile.js"></script><link href="/_next/static/mobile.css"/>'),
    caches: {
      open: async () => ({ put: async (url: string) => { cached.push(url); }, add: async (url: string) => { cached.push(url); } }),
      keys: async () => ["another-app", "vesyn-v1-shell", "vesyn-v2-shell", "vesyn-v2-assets", "vesyn-v3-light-shell", "vesyn-v3-light-assets"],
      delete: async (key: string) => { deleted.push(key); },
    },
  });
  return { handlers, cached, deleted };
}

describe("assistant offline shell", () => {
  it("preloads all five screens, both recordings and first-render scripts/styles", async () => {
    const w = worker();
    let done: Promise<unknown> = Promise.resolve();
    w.handlers.install({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    for (const url of ["/assistant", "/assistant/research", "/assistant/memory", "/assistant/history", "/assistant/profile", "/demo/run.json", "/demo/before.json", "/_next/static/mobile.js", "/_next/static/mobile.css"]) {
      assert.ok(w.cached.includes(url), `${url} is available on a first offline reload`);
    }
  });
  it("never serves live API responses or desktop navigation from the assistant cache", () => {
    const w = worker();
    for (const [url, method, mode] of [
      ["https://api.vesyn.test/api/runs/x", "GET", "cors"],
      ["https://vesyn.test/api/runs/x", "GET", "cors"],
      ["https://vesyn.test/health", "GET", "cors"],
      ["https://vesyn.test/retrosynthesis/health", "GET", "cors"],
      ["https://vesyn.test/api/projects", "POST", "cors"],
      ["https://vesyn.test/dashboard", "GET", "navigate"],
    ]) {
      w.handlers.fetch({ request: { url, method, mode }, respondWith: () => assert.fail(`intercepted ${url}`) });
    }
  });
  it("updates only its own caches", async () => {
    const w = worker();
    let done: Promise<unknown> = Promise.resolve();
    w.handlers.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    assert.deepEqual(w.deleted, ["vesyn-v1-shell", "vesyn-v2-shell", "vesyn-v2-assets"]);
  });
});
