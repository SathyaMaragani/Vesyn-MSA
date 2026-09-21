import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOND_LENGTH, extent, layout2D, layout3D } from "../src/lib/chem/layout.ts";
import { parseSmiles } from "../src/lib/chem/smiles.ts";

const dist3 = (p: Float32Array, a: number, b: number) =>
  Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);

describe("layout3D", () => {
  it("keeps every bonded pair near one bond length (aspirin, caffeine)", () => {
    for (const smi of ["CC(=O)Oc1ccccc1C(=O)O", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"]) {
      const g = parseSmiles(smi);
      const p = layout3D(g);
      for (const b of g.bonds) {
        const d = dist3(p, b.a, b.b);
        assert.ok(d > 0.7 * BOND_LENGTH && d < 1.3 * BOND_LENGTH, `${smi}: bond ${b.a}-${b.b} is ${d.toFixed(2)}`);
      }
    }
  });

  it("keeps non-bonded atoms apart - no two atoms collapse onto each other", () => {
    const g = parseSmiles("CC(C)Cc1ccc(C(C)C(=O)O)cc1");
    const p = layout3D(g);
    let min = Infinity;
    for (let i = 0; i < g.atoms.length; i++) for (let j = i + 1; j < g.atoms.length; j++) min = Math.min(min, dist3(p, i, j));
    assert.ok(min > 0.6, `closest pair ${min.toFixed(2)}`);
  });

  it("is deterministic and finite", () => {
    const g = parseSmiles("CC(=O)Oc1ccccc1C(=O)O");
    const a = layout3D(g);
    const b = layout3D(g);
    assert.deepEqual([...a], [...b]);
    assert.ok([...a].every(Number.isFinite));
  });

  it("is centred on the origin and handles a single atom and disconnected fragments", () => {
    const g = parseSmiles("[NH4+].[Cl-]");
    const p = layout3D(g);
    const cx = (p[0] + p[3]) / 2;
    assert.ok(Math.abs(cx) < 1e-4);
    assert.equal(layout3D(parseSmiles("C")).length, 3);
    assert.ok(extent(layout3D(parseSmiles("c1ccccc1"))) < 2);
  });
});

describe("layout2D", () => {
  it("gives a finite flat depiction with the same atom count", () => {
    const g = parseSmiles("CC(=O)Oc1ccccc1C(=O)O");
    const q = layout2D(g);
    assert.equal(q.length, g.atoms.length * 2);
    assert.ok([...q].every(Number.isFinite));
  });

  it("benzene projects to a ring: six atoms about equally far from the centre", () => {
    const g = parseSmiles("c1ccccc1");
    const q = layout2D(g);
    const r = Array.from({ length: 6 }, (_, i) => Math.hypot(q[i * 2], q[i * 2 + 1]));
    assert.ok(Math.max(...r) - Math.min(...r) < 0.35, r.map((x) => x.toFixed(2)).join(","));
  });
});

describe("layout2D is a drawing a chemist would recognise", () => {
  const bondLengths = (smi: string) => {
    const g = parseSmiles(smi);
    const q = layout2D(g);
    return g.bonds.map((b) => Math.hypot(q[b.a * 2] - q[b.b * 2], q[b.a * 2 + 1] - q[b.b * 2 + 1]));
  };

  it("benzene is a regular hexagon: equal radii, equal bonds", () => {
    const g = parseSmiles("c1ccccc1");
    const q = layout2D(g);
    const r = Array.from({ length: 6 }, (_, i) => Math.hypot(q[i * 2], q[i * 2 + 1]));
    assert.ok(Math.max(...r) - Math.min(...r) < 0.1, r.map((x) => x.toFixed(2)).join(","));
    const bl = bondLengths("c1ccccc1");
    assert.ok(Math.max(...bl) - Math.min(...bl) < 0.1);
  });

  it("aspirin and caffeine keep every bond near one unit long in the plane", () => {
    for (const smi of ["CC(=O)Oc1ccccc1C(=O)O", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"]) {
      for (const d of bondLengths(smi)) assert.ok(d > 0.75 && d < 1.3, `${smi}: ${d.toFixed(2)}`);
    }
  });

  it("substituents on an aromatic ring leave at about 120 degrees, not collapsed together", () => {
    const g = parseSmiles("Cc1ccccc1"); // toluene: methyl is atom 0, ring atom 1 bears it
    const q = layout2D(g);
    const ang = (i: number, j: number, k: number) => {
      const ax = q[j * 2] - q[i * 2], ay = q[j * 2 + 1] - q[i * 2 + 1];
      const bx = q[k * 2] - q[i * 2], by = q[k * 2 + 1] - q[i * 2 + 1];
      return (Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by) * 180) / Math.PI;
    };
    const a = ang(1, 0, 2);
    assert.ok(a > 100 && a < 140, `angle ${a.toFixed(0)}`);
  });
});
