"use client";

import React, { useMemo } from "react";
import { elementCss, getMolecule } from "@/lib/chem/molecule";

interface Props {
  smiles: string;
  /** Outer box in px. */
  width: number;
  height: number;
  x?: number;
  y?: number;
  /** Colour of the halo behind heteroatom labels; match the surface the drawing sits on. */
  bg?: string;
  /** Highlight one atom (index into the parsed graph). */
  highlight?: number | null;
  onAtomClick?: (index: number) => void;
}

/**
 * A skeletal depiction of the REAL bond graph of a SMILES string. The 2D
 * arrangement is a layout, not a coordinate set from a chemistry engine; bond
 * orders, elements, charges and hydrogen counts come from the string itself.
 */
export function MoleculeSvg({ smiles, width, height, x = 0, y = 0, bg = "#0b1016", highlight = null, onAtomClick }: Props) {
  const res = useMemo(() => getMolecule(smiles), [smiles]);

  if (!res.ok) {
    return (
      <svg x={x} y={y} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgb(248 113 113)" fontSize="9" fontFamily="var(--nc-font-data)">
          structure unreadable
        </text>
        <text x={width / 2} y={height / 2 + 12} textAnchor="middle" fill="rgb(96 112 128)" fontSize="8" fontFamily="var(--nc-font-data)">
          {res.error.slice(0, 34)}
        </text>
      </svg>
    );
  }

  const { graph, pos2 } = res.molecule;
  const n = graph.atoms.length;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, pos2[i * 2]);
    maxX = Math.max(maxX, pos2[i * 2]);
    minY = Math.min(minY, pos2[i * 2 + 1]);
    maxY = Math.max(maxY, pos2[i * 2 + 1]);
  }
  const pad = 14;
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY, 34);
  const ox = (width - spanX * scale) / 2 - minX * scale;
  const oy = (height - spanY * scale) / 2 - minY * scale;
  const X = (i: number) => pos2[i * 2] * scale + ox;
  const Y = (i: number) => pos2[i * 2 + 1] * scale + oy;
  const off = Math.max(2, scale * 0.11);
  const stroke = "rgb(154 171 186)";

  const lines: React.ReactNode[] = [];
  graph.bonds.forEach((b, k) => {
    const x1 = X(b.a);
    const y1 = Y(b.a);
    const x2 = X(b.b);
    const y2 = Y(b.b);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * off;
    const ny = (dx / len) * off;
    const L = (dxo: number, dyo: number, key: string, dash?: string) => (
      <line key={key} x1={x1 + dxo} y1={y1 + dyo} x2={x2 + dxo} y2={y2 + dyo} stroke={stroke} strokeWidth={1.3} strokeLinecap="round" strokeDasharray={dash} />
    );
    if (b.order === 1) lines.push(L(0, 0, `b${k}`));
    else if (b.order === 2) lines.push(L(nx / 2, ny / 2, `b${k}a`), L(-nx / 2, -ny / 2, `b${k}b`));
    else if (b.order === 3) lines.push(L(0, 0, `b${k}a`), L(nx, ny, `b${k}b`), L(-nx, -ny, `b${k}c`));
    else lines.push(L(0, 0, `b${k}a`), L(nx, ny, `b${k}b`, "3 2.5"));
  });

  return (
    <svg x={x} y={y} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Structure of ${smiles}`}>
      {lines}
      {graph.atoms.map((a) => {
        const hetero = a.element !== "C" || a.charge !== 0;
        const isHi = highlight === a.index;
        const label = hetero
          ? `${a.element === "*" ? "*" : a.element}${a.hydrogens > 0 ? "H" + (a.hydrogens > 1 ? a.hydrogens : "") : ""}${a.charge ? (a.charge > 0 ? "+" : "−") + (Math.abs(a.charge) > 1 ? Math.abs(a.charge) : "") : ""}`
          : "";
        return (
          <g key={a.index} onClick={onAtomClick ? () => onAtomClick(a.index) : undefined} style={onAtomClick ? { cursor: "pointer" } : undefined}>
            {(hetero || isHi) && <circle cx={X(a.index)} cy={Y(a.index)} r={hetero ? 8 : 4} fill={isHi ? "rgb(143 175 154 / 0.35)" : bg} />}
            {hetero && (
              <text x={X(a.index)} y={Y(a.index) + 3.4} textAnchor="middle" fontSize="10" fontWeight={600} fill={elementCss(a.element)} fontFamily="var(--nc-font-data)">
                {label}
              </text>
            )}
            {onAtomClick && <circle cx={X(a.index)} cy={Y(a.index)} r={9} fill="transparent" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Standalone drawing in its own <svg>. */
export function MoleculeDrawing(props: Omit<Props, "x" | "y">) {
  return (
    <svg width={props.width} height={props.height} viewBox={`0 0 ${props.width} ${props.height}`}>
      <MoleculeSvg {...props} />
    </svg>
  );
}
