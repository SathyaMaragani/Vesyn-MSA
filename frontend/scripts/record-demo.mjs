// Records one finished run from a running Vesyn API into public/demo/run.json: the data the UI
// shows, labelled SIMULATED, when the API is offline. Everything in it is what the API returned.
//   node scripts/record-demo.mjs <run_id> [api base, default http://localhost:8436]
import { writeFileSync } from "node:fs";

const [runId, api = "http://localhost:8436"] = process.argv.slice(2);
if (!runId) throw new Error("usage: node scripts/record-demo.mjs <run_id> [api base]");

const get = async (path) => {
  const r = await fetch(api + path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${r.statusText}`);
  return r.json();
};

const run = await get(`/api/runs/${runId}`);
if (run.status !== "COMPLETED" && run.status !== "FAILED") throw new Error(`${runId} is ${run.status}; record a finished run`);
const audit = await get(`/api/audit?run_id=${runId}&limit=500`);
const demo = {
  project: await get(`/api/projects/${run.project_id}`),
  run,
  events: await get(`/api/events?run_id=${runId}&after=0&limit=10000`),
  agents: await get("/api/agents"),
  tools: await get("/api/tools"),
  graph: await get("/api/graph"),
  audit,
  auditCalls: Object.fromEntries(await Promise.all(audit.map(async (a) => [a.id, await get(`/api/audit/${a.id}`)]))),
};

const out = new URL("../public/demo/run.json", import.meta.url);
writeFileSync(out, JSON.stringify(demo));
console.log(`recorded ${runId} (${demo.events.length} events, ${audit.length} tool calls) -> ${out.pathname}`);
