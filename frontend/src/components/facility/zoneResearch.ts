// RESEARCH: the computational research hall. Evidence screens, data stacks, a document drum and an
// upper balcony of terminals. What is lit is real: the rack LEDs move only while the research agent has a
// tool call in flight, and the drum lights one card per research tool call that completed.
import * as THREE from "three";
import { molecularWeight } from "@/lib/chem/analysis";
import { getMolecule } from "@/lib/chem/molecule";
import type { MolecularProperties } from "../../types/chemistry.ts";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, bar, drawMolecule2D, frame, paragraph, text } from "./screen";
import { bench, beaker, cabinet, column, flask, makeFrame, rack, railing, terminal, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

const LED_COLS = 3;
const LED_ROWS = 15;
const RACKS_X = [-10.6, -9.4, -8.2, 8.4, 9.6, 10.8];
const CARDS = 18;

export function buildResearch(env: BuildEnv): ZoneRig {
  const def = ZONES.research;
  const f = makeFrame(env, def);
  const { w, d } = def;

  withZone(env, def, () => {
    for (const x of RACKS_X) rack(env, x, -5.2, x > 0 ? 2.9 : 3.2);
    // two working rows: benches with terminals
    for (const x of [-4.4, 4.4]) {
      bench(env, x, 1.6, 5, 0);
      terminal(env, f.acc, x - 1.3, 1.6, 0, 1.3);
      terminal(env, f.acc, x + 1.3, 1.6, 0, 1.3);
      beaker(env, x, 1.3, 1.9, 0.9);
      flask(env, x + 0.5, 1.3, 1.95, 0.6, C.mineral);
    }
    // storage along the west glass
    for (const z of [-2.2, 0, 2.2]) cabinet(env, -w / 2 + 0.7, z, 1.6, 2.0, 0.6, Math.PI / 2);
    // the upper balcony (east side): deck, columns, glass balustrade, stair down to the hall
    env.metal.box(4.3, 0.22, 6.6, 9.3, 3.7, -0.3, C.brushed);
    env.matte.box(4.0, 0.03, 6.3, 9.3, 3.83, -0.3, 0x2b2c27);
    for (const [x, z] of [[7.4, -3.4], [11.2, -3.4], [7.4, 2.8], [11.2, 2.8]]) column(env, x, z, 3.6, 0.14, 0.32);
    railing(env, 7.15, 3.0, 11.45, 3.0, 3.8, 1.05, true);
    railing(env, 7.15, -3.6, 7.15, 3.0, 3.8, 1.05, true);
    for (let i = 0; i < 10; i++) env.metal.box(1.3, 0.1, 0.34, 6.3, 0.5 + i * 0.36, 3.0 - i * 0.34, C.steel);
    terminal(env, f.acc, 9.6, -2.4, 0, 3.72);
    terminal(env, f.acc, 9.6, 0.4, 0, 3.72);
    // cables: risers from the stacks to a tray under the ceiling
    env.metal.box(4.6, 0.12, 0.5, -9.4, 5.9, -5.2, C.metal);
    for (const x of [-10.6, -9.4, -8.2]) env.metal.cyl(0.03, 0.03, 2.4, x, 4.7, -5.2, C.brushed, 6);
    // a wall of signage rails behind the racks
    env.metal.box(0.3, 4.6, 0.3, -w / 2 + 0.3, 2.6, -d / 2 + 0.5, C.metal);
  });

  // --- the three evidence screens on the back wall --------------------------------------------------
  const sA = env.track(new Screen(3.9, 2.4, 512));
  const sB = env.track(new Screen(3.9, 2.4, 512));
  const sC = env.track(new Screen(3.9, 2.4, 512));
  const wallZ = -d / 2 + 0.44;
  [sA, sB, sC].forEach((s, i) => {
    s.mesh.position.set((i - 1) * 4.2, 2.6, wallZ);
    f.group.add(s.mesh);
  });

  // --- LEDs on the stacks: instanced, animated only while a research tool call is in flight -----------
  const ledGeo = env.track(new THREE.BoxGeometry(0.06, 0.05, 0.02));
  const ledMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const ledCount = RACKS_X.length * LED_COLS * LED_ROWS;
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, ledCount);
  leds.frustumCulled = false;
  {
    const m = new THREE.Matrix4();
    let i = 0;
    for (const rx of RACKS_X) {
      const hgt = rx > 0 ? 2.9 : 3.2;
      for (let c = 0; c < LED_COLS; c++)
        for (let r = 0; r < LED_ROWS; r++) {
          m.makeTranslation(rx - 0.3 + c * 0.16, 0.32 + 0.3 + (r / LED_ROWS) * (hgt - 0.6), -5.2 + 0.5);
          leds.setMatrixAt(i, m);
          leds.setColorAt(i, new THREE.Color(0x222));
          i++;
        }
    }
  }
  f.group.add(leds);
  const col = new THREE.Color();

  // --- the document drum: one card per completed research tool call ------------------------------------
  const drum = new THREE.Group();
  drum.position.set(0, 3.0, -0.6);
  const cardGeo = env.track(new THREE.PlaneGeometry(0.72, 1.0));
  const cardMat = env.track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, CARDS);
  cards.frustumCulled = false;
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < CARDS; i++) {
      const a = (i / CARDS) * Math.PI * 2;
      m.compose(new THREE.Vector3(Math.cos(a) * 1.9, ((i % 3) - 1) * 0.12, Math.sin(a) * 1.9), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
      cards.setMatrixAt(i, m);
      cards.setColorAt(i, new THREE.Color(0x2a2b26));
    }
  }
  drum.add(cards);
  const rim = new THREE.Mesh(env.track(new THREE.TorusGeometry(1.9, 0.025, 6, 64)), env.track(new THREE.MeshBasicMaterial({ color: 0x6a685c, toneMapped: false })));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.72;
  const rim2 = rim.clone();
  rim2.position.y = -0.72;
  drum.add(rim, rim2);
  f.group.add(drum);
  // a plinth for the drum, so it stands on something
  withZone(env, def, () => {
    env.metal.cyl(0.5, 0.7, 1.6, 0, 0.32 + 0.8 - 0.2, -0.6, C.metal, 20);
    env.metal.cyl(0.08, 0.08, 1.6, 0, 1.9, -0.6, C.brushed, 8);
  });
  f.finish();

  let ledClock = 0;
  let cardsKey = "";
  const anchor = new THREE.Vector3(def.x, 6.6, def.z);

  return {
    id: "research",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const busy = !!z?.busy;
      const p = u.s.result?.profile?.properties;
      const props = p && !("error" in p) ? (p as MolecularProperties) : null;
      const mol = u.s.target ? getMolecule(u.s.target.smiles) : null;
      const dim = 0.28 + 0.72 * Math.max(u.glow, 0.25);

      // A: the target's profile
      sA.level(dim);
      sA.draw(`A|${u.s.target?.smiles}|${props?.inchikey ?? ""}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "TARGET PROFILE", props ? "RDKit · backend" : mol?.ok ? "from SMILES" : "no target");
        const rows: [string, string][] = [];
        if (props) {
          rows.push(["FORMULA", props.formula], ["MOL. WEIGHT", `${props.molecular_weight.toFixed(2)} g/mol`], ["LogP", props.logp.toFixed(2)], ["TPSA", `${props.tpsa.toFixed(1)} Å²`], ["HBD / HBA", `${props.hbd} / ${props.hba}`], ["ROT. BONDS", String(props.rotatable_bonds)], ["LIPINSKI", `${props.lipinski_violations} violation(s)`]);
        } else if (mol?.ok) {
          const mw = molecularWeight(mol.molecule.graph);
          rows.push(["FORMULA", mol.molecule.formula], ["MOL. WEIGHT", mw !== null ? `${mw.toFixed(2)} g/mol` : "not reported"], ["HEAVY ATOMS", String(mol.molecule.graph.atoms.length)], ["BONDS", String(mol.molecule.graph.bonds.length)], ["DESCRIPTORS", "awaiting research agent"]);
        } else text(g, u.s.awake ? "no target resolved" : "no run", 24, y + 8, 22, INK.dim);
        for (const [k, v] of rows) {
          text(g, k, 24, y, 19, INK.dim);
          text(g, v, W - 24, y, 21, INK.text, "right");
          y += 34;
        }
      });

      // B: analogues
      const an = u.s.result?.profile?.analogues;
      const hits = an && !("error" in an) ? an.hits : null;
      sB.level(dim);
      sB.draw(`B|${hits?.length ?? "x"}|${hits?.[0]?.smiles ?? ""}|${an && "error" in an ? an.error : ""}|${u.s.awake}`, (g, W, H) => {
        const y = frame(g, W, H, "ANALOGUES", an && !("error" in an) ? an.library : "ChEMBL");
        if (hits && hits.length) {
          drawMolecule2D(g, hits[0].smiles, 14, y, W * 0.5, H - y - 16, INK.text);
          hits.slice(0, 4).forEach((h, i) => {
            text(g, `#${h.molecule_id}`, W * 0.55, y + 14 + i * 44, 18, INK.dim);
            text(g, `Tanimoto ${h.tanimoto.toFixed(3)}`, W * 0.55, y + 34 + i * 44, 20, INK.text);
          });
        } else if (an && "error" in an) paragraph(g, an.error, 24, y + 6, W - 48, 20, "#c98a6a", 4);
        else text(g, u.s.awake ? (u.s.phase === "running" ? "awaiting the profile…" : "not reported") : "no run", 24, y + 8, 22, INK.dim);
      });

      // C: the research agent's tool calls
      sC.level(dim);
      const tools = z?.tools ?? [];
      sC.draw(`C|${tools.map((t) => `${t.name}${t.status}${t.ms}`).join(",")}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "TOOL LOG", `${tools.length} call(s)`);
        if (!tools.length) text(g, u.s.awake ? "no tool calls in this run" : "no run", 24, y + 8, 22, INK.dim);
        for (const t of tools.slice(-6)) {
          const c = t.status === "COMPLETED" ? INK.accent : t.status === "RUNNING" || t.status === "REQUESTED" ? "#d6a45b" : "#c9694f";
          g.fillStyle = c;
          g.fillRect(24, y + 5, 10, 10);
          text(g, t.name, 44, y, 20, INK.text);
          text(g, t.status === "COMPLETED" ? `${t.ms ?? "—"} ms` : t.status, W - 24, y, 18, c, "right");
          y += 34;
        }
        if (tools.length) bar(g, 24, H - 26, W - 48, 6, tools.filter((t) => t.status === "COMPLETED").length / tools.length, INK.accent);
      });

      // LEDs (15 Hz): they move while the agent works
      ledClock += u.dt;
      if (ledClock > 1 / 15) {
        ledClock = 0;
        for (let i = 0; i < ledCount; i++) {
          const on = busy ? Math.sin(u.t * 6 + i * 1.913) > 0.15 : false;
          const v = busy ? (on ? 0.95 : 0.12) : u.s.awake ? (i % 11 === 0 ? 0.18 : 0.04) : 0.02;
          col.setRGB(0.56 * v, 0.69 * v, 0.6 * v).convertSRGBToLinear();
          if (busy && on && i % 7 === 0) col.setHex(0xd6a45b).multiplyScalar(0.8);
          leds.setColorAt(i, col);
        }
        if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
      }

      // the drum: one lit card per completed research tool call
      const done = Math.min(CARDS, tools.filter((t) => t.status === "COMPLETED").length);
      const k = `${done}|${z?.tone}`;
      if (k !== cardsKey) {
        cardsKey = k;
        for (let i = 0; i < CARDS; i++) cards.setColorAt(i, col.set(i < done ? 0x8faf9a : 0x2a2b26));
        if (cards.instanceColor) cards.instanceColor.needsUpdate = true;
      }
      drum.rotation.y += u.dt * (busy ? 0.5 : 0.06);
    },
    dispose() {
      leds.dispose();
      cards.dispose();
      f.dispose();
      [sA, sB, sC].forEach((s) => s.dispose());
    },
  };
}
