// `npm test` entry: every tests/*.test.ts, imported into one node:test run. Node 20 can neither
// expand a glob itself nor load .ts, and cmd.exe does not expand globs either - tsx + this does both.
import { readdirSync } from "node:fs";

for (const file of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".test.ts")).sort()) {
  await import(`./${file}`);
}
