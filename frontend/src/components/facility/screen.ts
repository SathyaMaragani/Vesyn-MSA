// The facility's displays: a canvas texture on a plane, redrawn ONLY when what it shows changes
// (callers pass a key describing the data). Everything drawn comes from real state or reads
// "not reported" / "awaiting"; nothing is placeholder data.
import * as THREE from "three";
import { elementCss, getMolecule } from "@/lib/chem/molecule";

export const FONT = 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace';

export interface ScreenColors {
  bg: string;
  line: string;
  text: string;
  dim: string;
  accent: string;
}

export const INK: ScreenColors = { bg: "#11120f", line: "#3b3a33", text: "#e8e4d8", dim: "#8a877b", accent: "#8faf9a" };

export class Screen {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly canvas: HTMLCanvasElement;
  readonly W: number;
  readonly H: number;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private key = "";

  /** `w` x `h` are metres; the canvas gets `px` pixels across. */
  constructor(w: number, h: number, px = 512) {
    this.W = px;
    this.H = Math.round((px * h) / w);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.ctx.fillStyle = INK.bg;
    this.ctx.fillRect(0, 0, this.W, this.H);
    this.tex.needsUpdate = true;
  }

  /** Redraw when `key` differs from what is on the screen. */
  draw(key: string, fn: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.fillStyle = INK.bg;
    g.fillRect(0, 0, this.W, this.H);
    fn(g, this.W, this.H);
    this.tex.needsUpdate = true;
  }

  /** Brightness (0..1): dormant screens are dark. */
  level(v: number) {
    this.material.color.setScalar(Math.max(0, Math.min(1.2, v)));
  }

  dispose() {
    this.tex.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

/** Title bar + hairline frame. Returns the y where content may start. */
export function frame(g: CanvasRenderingContext2D, W: number, H: number, title: string, right: string, accent = INK.accent): number {
  g.strokeStyle = INK.line;
  g.lineWidth = 2;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = accent;
  g.fillRect(6, 6, 5, 34);
  g.font = `600 ${Math.round(H * 0.06)}px ${FONT}`;
  g.fillStyle = INK.text;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(title, 24, 24);
  g.textAlign = "right";
  g.fillStyle = accent;
  g.fillText(right, W - 20, 24);
  g.strokeStyle = INK.line;
  g.beginPath();
  g.moveTo(6, 42);
  g.lineTo(W - 6, 42);
  g.stroke();
  g.textAlign = "left";
  return 54;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = INK.text, align: CanvasTextAlign = "left") {
  g.font = `${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "top";
  g.fillText(s, x, y);
}

/** Word-wrapped paragraph; returns the y after the last line. Stops (with an ellipsis) after `maxLines`. */
export function paragraph(g: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, size: number, color = INK.text, maxLines = 4): number {
  g.font = `${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "top";
  const words = s.split(/\s+/);
  let line = "";
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > maxW && line) {
      n += 1;
      if (n >= maxLines) {
        g.fillText(line.replace(/.{0,2}$/, "…"), x, y);
        return y + size * 1.3;
      }
      g.fillText(line, x, y);
      y += size * 1.3;
      line = words[i];
    } else line = test;
  }
  if (line) {
    g.fillText(line, x, y);
    y += size * 1.3;
  }
  return y;
}

/** A skeletal depiction of a real molecule (bond graph of the SMILES, best-fit-plane layout). */
export function drawMolecule2D(g: CanvasRenderingContext2D, smiles: string, x: number, y: number, w: number, h: number, color = INK.text) {
  const r = getMolecule(smiles);
  if (!r.ok) {
    text(g, "structure unreadable", x + w / 2, y + h / 2 - 6, 12, INK.dim, "center");
    return;
  }
  const { pos2, graph } = r.molecule;
  const n = graph.atoms.length;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, pos2[i * 2]);
    x1 = Math.max(x1, pos2[i * 2]);
    y0 = Math.min(y0, pos2[i * 2 + 1]);
    y1 = Math.max(y1, pos2[i * 2 + 1]);
  }
  const pad = 14;
  const s = Math.min((w - pad * 2) / Math.max(x1 - x0, 0.8), (h - pad * 2) / Math.max(y1 - y0, 0.8), 34);
  const cx = x + w / 2 - ((x0 + x1) / 2) * s;
  const cy = y + h / 2 + ((y0 + y1) / 2) * s;
  const P = (i: number): [number, number] => [cx + pos2[i * 2] * s, cy - pos2[i * 2 + 1] * s];
  g.lineCap = "round";
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.2, s * 0.07);
  for (const b of graph.bonds) {
    const [ax, ay] = P(b.a);
    const [bx, by] = P(b.b);
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * s * 0.09;
    const ny = (dx / l) * s * 0.09;
    const line = (ox: number, oy: number, dash = false) => {
      g.setLineDash(dash ? [3, 3] : []);
      g.beginPath();
      g.moveTo(ax + ox, ay + oy);
      g.lineTo(bx + ox, by + oy);
      g.stroke();
    };
    if (b.order === 2) {
      line(nx, ny);
      line(-nx, -ny);
    } else if (b.order === 3) {
      line(0, 0);
      line(nx * 1.6, ny * 1.6);
      line(-nx * 1.6, -ny * 1.6);
    } else if (b.order === 1.5) {
      line(nx * 0.6, ny * 0.6);
      line(-nx * 0.6, -ny * 0.6, true);
    } else line(0, 0);
  }
  g.setLineDash([]);
  g.font = `600 ${Math.max(9, Math.round(s * 0.42))}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const el = graph.atoms[i].element;
    if (el === "C") continue;
    const [px, py] = P(i);
    g.fillStyle = INK.bg;
    g.beginPath();
    g.arc(px, py, s * 0.24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = elementCss(el);
    g.fillText(el, px, py + 1);
  }
}

export function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string) {
  g.fillStyle = "#23241f";
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
}

export const hexCss = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;
