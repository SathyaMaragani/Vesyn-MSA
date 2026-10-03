// Next standalone output does not copy public or static assets automatically.
// Package both for a local production/PWA check without changing deployment entry points.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const server = new URL("../.next/standalone/server.js", import.meta.url);
if (!existsSync(server)) throw new Error("Run npm run build before npm run start:mobile.");
cpSync(new URL("../public", import.meta.url), new URL("../.next/standalone/public", import.meta.url), { recursive: true });
cpSync(new URL("../.next/static", import.meta.url), new URL("../.next/standalone/.next/static", import.meta.url), { recursive: true });
process.env.PORT ||= "3100";
process.env.HOSTNAME = process.env.VESYN_HOST || "127.0.0.1";
console.log(`VESYN assistant: http://${process.env.HOSTNAME}:${process.env.PORT}/assistant`);
process.chdir(fileURLToPath(new URL("../.next/standalone", import.meta.url)));
await import(server.href);
