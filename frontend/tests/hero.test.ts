import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { annotations, atomTags, findHole, longestPath, molecularWeight, ringAtoms, ringCount, smallRings } from "../src/lib/chem/analysis.ts";
import { CHAPTERS, RIDE, STAGES, activeStage, annotationOpacity, buildKeys, cameraAt, chapterAt, dialAngle, identityOpacity, introEase, portalOpacity, brandAlpha, brandSolid, taglineOpacity, arrivalK, warmthAt, settleK, reasoningOpacity, shiftAt, structureOpacity, wordAt, wordIntro, nearestAtom, fovAt, type V3 } from "../src/components/hero/journey.ts";
import { layout2D } from "../src/lib/chem/layout.ts";
import { getMolecule } from "../src/lib/chem/molecule.ts";
import { parseSmiles } from "../src/lib/chem/smiles.ts";

const CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C";

describe("molecular analysis (true for any molecule, not a lookup)", () => {
  it("molecular weight: caffeine 194.19, aspirin 180.16, benzene 78.11", () => {
    assert.equal(molecularWeight(parseSmiles(CAFFEINE)), 194.19);
    assert.equal(molecularWeight(parseSmiles("CC(=O)Oc1ccccc1C(=O)O")), 180.16);
    assert.equal(molecularWeight(parseSmiles("c1ccccc1")), 78.11);
  });
  it("returns null rather than guessing when an element has no known weight", () => {
    assert.equal(molecularWeight(parseSmiles("[Pt]")), null);
  });
  it("ring count: caffeine 2, aspirin 1, benzene 1, ethanol 0, naphthalene 2", () => {
    assert.equal(ringCount(parseSmiles(CAFFEINE)), 2);
    assert.equal(ringCount(parseSmiles("CC(=O)Oc1ccccc1C(=O)O")), 1);
    assert.equal(ringCount(parseSmiles("c1ccccc1")), 1);
    assert.equal(ringCount(parseSmiles("CCO")), 0);
    assert.equal(ringCount(parseSmiles("c1ccc2ccccc2c1")), 2);
  });
  it("atom tags point at atoms that really are what they say", () => {
    const g = parseSmiles(CAFFEINE);
    for (const t of atomTags(g)) {
      const a = g.atoms[t.atom];
      if (t.text.startsWith("C=O")) assert.equal(a.element, "O");
      if (t.text.startsWith("N")) assert.ok(a.element === "N" && a.aromatic);
      if (t.text.startsWith("CH3")) assert.ok(a.element === "C" && a.hydrogens === 3);
    }
    assert.ok(atomTags(g).length >= 2);
  });
});

describe("findHole: the way into the molecule", () => {
  it("is clear of every atom by at least half a bond length (caffeine, benzene)", () => {
    for (const smi of [CAFFEINE, "c1ccccc1"]) {
      const g = parseSmiles(smi);
      const h = findHole(layout2D(g), g.atoms.length);
      assert.ok(h.clearance > 0.5, `${smi}: clearance ${h.clearance.toFixed(2)}`);
    }
  });
  it("sits in the middle of a benzene ring", () => {
    const g = parseSmiles("c1ccccc1");
    const h = findHole(layout2D(g), 6);
    assert.ok(Math.hypot(h.x, h.y) < 0.15, `${h.x.toFixed(2)},${h.y.toFixed(2)}`);
  });
});


const STEROID = "CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C"; // the hero molecule (cholesterol constitution)

describe("the hero molecule is real chemistry", () => {
  const g = parseSmiles(STEROID);
  it("formula C27H46O, 4 rings, MW 386.66", () => {
    assert.equal(ringCount(g), 4);
    assert.equal(molecularWeight(g)?.toFixed(2), "386.66");
  });
  it("ring atoms: the fused four-ring nucleus has 17, and a chain atom is not one of them", () => {
    const r = ringAtoms(g);
    assert.equal(r.size, 17);
    assert.equal(r.has(0), false); // the terminal methyl
    assert.equal(ringAtoms(parseSmiles("CCO")).size, 0);
    assert.equal(ringAtoms(parseSmiles("c1ccccc1")).size, 6);
  });
  it("the longest path is a real walk: consecutive atoms are bonded, no atom repeats", () => {
    const p = longestPath(g);
    assert.ok(p.length >= 12);
    assert.equal(new Set(p).size, p.length);
    for (let i = 1; i < p.length; i++) assert.ok(g.bonds.some((b) => (b.a === p[i - 1] && b.b === p[i]) || (b.b === p[i - 1] && b.a === p[i])));
  });
  it("annotations point at atoms that really are what they say", () => {
    const notes = annotations(g);
    assert.ok(notes.length >= 3 && notes.length <= 4);
    const oh = notes.find((n) => n.text.startsWith("HYDROXYL"));
    assert.equal(g.atoms[oh!.atom].element, "O");
    assert.equal(g.atoms[oh!.atom].hydrogens, 1);
    const ene = notes.find((n) => n.text.startsWith("ALKENE"));
    assert.ok(g.bonds.some((b) => b.order === 2 && (b.a === ene!.atom || b.b === ene!.atom)));
    const quat = notes.find((n) => n.text.startsWith("QUATERNARY"));
    assert.equal(g.bonds.filter((b) => b.a === quat!.atom || b.b === quat!.atom).length, 4);
  });
  it("longestPath of an empty or single-atom graph does not throw", () => {
    assert.deepEqual(longestPath(parseSmiles("C")), [0]);
  });
});

describe("hero journey", () => {
  // a straight rail of atoms, 2 units apart, standing in for the molecule's bond path
  const rail: V3[] = Array.from({ length: 12 }, (_, i) => [-11 + i * 2, Math.sin(i) * 1.2, Math.cos(i) * 1.2] as V3);
  const keys = buildKeys(rail, 11);
  const pos = (p: number) => cameraAt(keys, p).pos;
  const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  it("starts far outside the structure and ends deep INSIDE it", () => {
    assert.ok(dist(pos(0), [0, 0, 0]) > 30);
    assert.ok(dist(pos(1), [0, 0, 0]) < 8);
  });
  it("travels the bond path: mid-journey the camera is within a few units of the rail, never on top of an atom", () => {
    for (let p = 0.32; p <= 0.76; p += 0.02) {
      const c = pos(p);
      const nearest = Math.min(...rail.map((a) => dist(c, a)));
      assert.ok(nearest > 0.9, `camera inside an atom at p=${p} (${nearest.toFixed(2)})`);
      assert.ok(nearest < 6, `camera left the rail at p=${p} (${nearest.toFixed(2)})`);
    }
  });
  it("the ride offset keeps it clear of atom radius (~0.6 units) by construction", () => {
    assert.ok(Math.hypot(RIDE.up, RIDE.out) > 2);
  });
  it("the camera path is continuous: no frame-to-frame jumps", () => {
    let prev = pos(0);
    for (let p = 0.005; p <= 1; p += 0.005) {
      const c = pos(p);
      assert.ok(dist(prev, c) < 4.2, `jump at p=${p}: ${dist(prev, c).toFixed(2)}`);
      assert.ok(c.every(Number.isFinite));
      prev = c;
    }
  });
  it("chapters run ORIGIN -> STRUCTURE -> REASONING -> IDENTITY in order and cover 0..1", () => {
    assert.deepEqual(CHAPTERS.map((c) => c.label), ["ORIGIN", "STRUCTURE", "REASONING", "IDENTITY"]);
    assert.equal(chapterAt(0), 0);
    assert.equal(chapterAt(0.3), 1);
    assert.equal(chapterAt(0.6), 2);
    assert.equal(chapterAt(0.9), 3);
    assert.equal(chapterAt(1), 3);
  });
  it("each layer of type has its own moment: headline first, identity and portal only at the end", () => {
    for (const i of [0, 1, 2]) {
      assert.equal(wordAt(i, 0).alpha, 1);
      assert.equal(wordAt(i, 0.95).alpha, 0);
    }
    assert.ok(annotationOpacity(0) === 1 && annotationOpacity(0.05) > 0.99 && annotationOpacity(0.4) === 0);
    assert.ok(structureOpacity(0.32) > 0.9 && structureOpacity(0.6) === 0 && structureOpacity(0) === 0);
    assert.ok(reasoningOpacity(0.6) > 0.9 && reasoningOpacity(0.2) === 0 && reasoningOpacity(0.95) === 0);
    assert.equal(identityOpacity(0.7), 0);
    assert.equal(identityOpacity(1), 1);
    assert.equal(portalOpacity(0.8), 0);
    assert.equal(portalOpacity(1), 1);
  });
  it("the name is earned in order: outline, solid type, descriptor, then the way in; the world settles and warms meanwhile", () => {
    // each step begins before the next completes, and none starts before the camera has arrived deep in the structure
    assert.equal(brandAlpha(0.75), 0);
    assert.ok(brandAlpha(0.9) === 1 && brandSolid(0.9) < 0.6);
    assert.ok(brandSolid(0.97) === 1 && taglineOpacity(0.94) === 0);
    assert.ok(taglineOpacity(0.985) === 1 && portalOpacity(0.955) === 0);
    assert.equal(portalOpacity(1), 1);
    for (let p = 0.7; p < 1; p += 0.01) {
      assert.ok(brandAlpha(p) >= brandSolid(p) - 1e-9, "the outline always leads the solid");
      assert.ok(brandSolid(p) >= taglineOpacity(p) - 1e-9, "the descriptor follows the type");
      assert.ok(taglineOpacity(p) >= portalOpacity(p) - 1e-9, "the way in comes last");
    }
    assert.equal(arrivalK(0.3), 0);
    assert.equal(arrivalK(1), 1);
    assert.ok(warmthAt(0.9) > warmthAt(0.7) && warmthAt(0.5) === 0);
    // the camera keeps living at the end (settle), and the view widens a touch, never a cut
    assert.equal(settleK(0.7), 0);
    assert.equal(settleK(1), 1);
    assert.equal(fovAt(34, 0, 0), 34);
    assert.ok(fovAt(34, 0, 1) > 34 && fovAt(34, 0, 1) < 40);
  });
  it("the seven stages advance in order while the camera travels, and never overrun", () => {
    assert.equal(STAGES.length, 7);
    let prev = 0;
    for (let p = 0.4; p <= 0.85; p += 0.01) {
      const s = activeStage(p);
      assert.ok(s >= prev && s <= 6);
      prev = s;
    }
    assert.equal(activeStage(0.45), 0);
    assert.equal(activeStage(0.78), 6);
  });
  it("the dial is scroll's hand; the molecule starts to the right and centres; the opening is time-based", () => {
    assert.equal(dialAngle(0), 0);
    assert.ok(dialAngle(1) > dialAngle(0.5));
    assert.ok(shiftAt(0) > 0.1 && shiftAt(0.4) === 0);
    assert.equal(introEase(0), 0);
    assert.equal(introEase(10), 1);
  });
});

describe("the camera always has the molecule in view (regression: it once stared into empty space at 60-80%)", () => {
  const r = getMolecule(STEROID);
  assert.ok(r.ok);
  const m = (r as { ok: true; molecule: import("../src/lib/chem/molecule.ts").Molecule }).molecule;
  const n = m.graph.atoms.length;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += m.pos3[i * 3 + a] / n;
  let far = 0;
  for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(m.pos3[i * 3] - c[0], m.pos3[i * 3 + 1] - c[1], m.pos3[i * 3 + 2] - c[2]));
  const S = 11 / far; // the scaffold's own scaling
  const atoms: V3[] = Array.from({ length: n }, (_, i) => [(m.pos3[i * 3] - c[0]) * S, (m.pos3[i * 3 + 1] - c[1]) * S, (m.pos3[i * 3 + 2] - c[2]) * S] as V3);
  const path = longestPath(m.graph).map((i) => atoms[i]);
  const rings = smallRings(m.graph).filter((r) => r.length >= 5).map((r) => [0, 1, 2].map((a) => r.reduce((acc, i) => acc + atoms[i][a], 0) / r.length) as V3);
  const keys = buildKeys(path, 11, atoms, rings);

  it("from the first frame to the last, at least 3 atoms sit inside a 23-degree cone around the line of sight", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { pos, look } = cameraAt(keys, Math.min(1, p));
      const d = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]];
      const dl = Math.hypot(d[0], d[1], d[2]);
      let inView = 0;
      for (const a of atoms) {
        const v = [a[0] - pos[0], a[1] - pos[1], a[2] - pos[2]];
        const vl = Math.hypot(v[0], v[1], v[2]);
        if (vl < 60 && (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / (vl * dl) > Math.cos(0.4)) inView++;
      }
      assert.ok(inView >= 3, `only ${inView} atoms in view at p=${p.toFixed(2)}`);
    }
  });
  it("and the camera never passes through an atom (radius ~0.6 units)", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { pos } = cameraAt(keys, Math.min(1, p));
      const nearest = Math.min(...atoms.map((a) => Math.hypot(a[0] - pos[0], a[1] - pos[1], a[2] - pos[2])));
      assert.ok(nearest > 1.0, `camera inside an atom at p=${p.toFixed(2)} (${nearest.toFixed(2)})`);
    }
  });
});
