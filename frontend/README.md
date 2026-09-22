# Vesyn frontend

Next.js 14 (App Router, React 18, TypeScript, Tailwind, three.js) for the Vesyn
multi-agent chemistry platform. It shows only what the backend reports: with the
API down every page says **API OFFLINE**, and nothing is simulated.

| Route | What |
|---|---|
| `/` | Entry: the molecular scene; scroll through it, then enter |
| `/dashboard` | The current run: target, workflow, routes, evidence, service health |
| `/lab` | The live 3D facility, one zone per agent |
| `/lab/{chemistry,routes,evidence,intelligence,audit}` | The lab's workspaces |

Every run bar takes a plain-words request ("solubility of ibuprofen") and/or a
structure drawn in the built-in Ketcher editor (**Draw**).

## Run

```bash
npm install
npm run dev        # http://localhost:3100 (3000 is in a Windows excluded port range here)
```

The API is expected at `NEXT_PUBLIC_API_URL` (default `http://localhost:8436`); see
the repository README for starting the backend.

## Check

```bash
npm run lint
npx tsc --noEmit
npm test           # tsx --test tests/run.mts - works on Node 20
npm run build
```

Architecture, data flow and the event contract: [../docs/FRONTEND.md](../docs/FRONTEND.md)
and [../docs/EVENTS.md](../docs/EVENTS.md).
