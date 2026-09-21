import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SmilesError, formulaOf, parseSmiles } from "../src/lib/chem/smiles.ts";

const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";
const CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C";
const IBUPROFEN = "CC(C)Cc1ccc(C(C)C(=O)O)cc1";

describe("parseSmiles", () => {
  it("reads aspirin: 13 heavy atoms, 13 bonds, one ring, formula C9H8O4", () => {
    const g = parseSmiles(ASPIRIN);
    assert.equal(g.atoms.length, 13);
    assert.equal(g.bonds.length, 13);
    assert.equal(g.components, 1);
    assert.equal(formulaOf(g), "C9H8O4");
  });

  it("reads caffeine (fused aromatic rings, ring closures): C8H10N4O2", () => {
    const g = parseSmiles(CAFFEINE);
    assert.equal(g.atoms.length, 14);
    assert.equal(g.bonds.length, 15); // 14 atoms, 2 rings -> 15 bonds
    assert.equal(formulaOf(g), "C8H10N4O2");
  });

  it("reads ibuprofen: C13H18O2", () => {
    assert.equal(formulaOf(parseSmiles(IBUPROFEN)), "C13H18O2");
  });

  it("bond orders: =, #, aromatic", () => {
    const g = parseSmiles("C=CC#N");
    assert.deepEqual(g.bonds.map((b) => b.order), [2, 1, 3]);
    const benzene = parseSmiles("c1ccccc1");
    assert.ok(benzene.bonds.every((b) => b.order === 1.5));
    assert.equal(formulaOf(benzene), "C6H6");
  });

  it("bracket atoms: charges and explicit hydrogens", () => {
    const g = parseSmiles("[NH4+].[Cl-]");
    assert.equal(g.components, 2);
    assert.equal(g.atoms[0].charge, 1);
    assert.equal(g.atoms[0].hydrogens, 4);
    assert.equal(g.atoms[0].hydrogensImplicit, false);
    assert.equal(g.atoms[1].charge, -1);
    assert.equal(parseSmiles("c1cc[nH]c1").atoms[3].hydrogens, 1);
  });

  it("two-letter halogens and stereo marks are handled", () => {
    const g = parseSmiles("F/C=C/Cl");
    assert.deepEqual(g.atoms.map((a) => a.element), ["F", "C", "C", "Cl"]);
    assert.equal(parseSmiles("N[C@@H](C)C(=O)O").atoms[1].hydrogens, 1);
  });

  it("branches return to the branch point", () => {
    const g = parseSmiles("CC(C)(C)C"); // neopentane
    assert.equal(g.bonds.length, 4);
    assert.equal(formulaOf(g), "C5H12");
  });

  it("rejects malformed SMILES instead of guessing", () => {
    for (const bad of ["", "C(C", "C)C", "C1CC", "[C", "C%1", "CX", "c1ccccc"]) {
      assert.throws(() => parseSmiles(bad), SmilesError, JSON.stringify(bad));
    }
  });
});
