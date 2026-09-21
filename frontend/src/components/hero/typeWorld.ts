// Typography that lives IN the scene. Each word is a plane in world space, textured from a
// 2D canvas in two versions (solid and hairline outline) that a shader crossfades, so a word
// can RESOLVE from an outline into solid type. The planes are depth-tested and write depth:
// atoms in front of a word hide its letters, atoms behind it are hidden by them, and depth of
// field blurs a word by how far it is from the focus - the same as the molecule.
import * as THREE from "three";
import { WORDS, smooth, wordAt, wordIntro } from "./journey";

/** Editorial serif, from what the system has: no font download, no layout shift. */
export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

interface Ink {
  /** canvas paint for the two glyph masks (only their alpha is read) */
  solid: string;
  line: string;
  /** the colours the shader paints with: solid type, and the hairline it resolves from */
  hex: number;
  lineHex: number;
  italic?: boolean;
}

const INK = {
  ivory: { solid: "rgb(232,228,216)", line: "rgba(232,228,216,0.85)", hex: 0xe8e4d8, lineHex: 0xe8e4d8 },
  sage: { solid: "rgb(143,175,154)", line: "rgba(214,164,91,0.95)", hex: 0x8faf9a, lineHex: 0xd6a45b, italic: true },
} satisfies Record<string, Ink>;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
uniform sampler2D tSolid;
uniform sampler2D tLine;
uniform float uSolid;
uniform float uOpacity;
uniform float uDim;
uniform float uGain;
uniform float uCut;
uniform vec3 uColor;
uniform vec3 uLineColor;
varying vec2 vUv;
void main(){
  // The glyph masks carry ONLY coverage; colour comes from uniforms. (Sampling premultiplied
  // colour from the canvas darkened every edge into a grey fringe around the letters.)
  float s = texture2D(tSolid, vUv).a;
  float l = texture2D(tLine, vUv).a;
  float cover = mix(l, s, uSolid);          // outline -> solid
  float a = clamp(cover, 0.0, 1.0) * uOpacity;
  if (a < uCut) discard;                    // writes depth only where there is type
  vec3 col = mix(uLineColor, uColor, uSolid);
  gl_FragColor = vec4(col * uDim * uGain * a, a); // premultiplied; gain offsets the filmic tone curve
}
`;

function drawTexture(text: string, ink: Ink, outline: boolean, fontPx: number, width: number, height: number, blur = 0): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.font = `${ink.italic ? "italic " : ""}400 ${fontPx}px ${SERIF}`;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  if (blur > 0) g.filter = `blur(${blur}px)`;
  // letter-spacing is applied by hand so the shape matches the tight editorial setting
  const spacing = -0.03 * fontPx;
  let x = fontPx * 0.06;
  const y = height * 0.76;
  for (const ch of text) {
    if (outline) {
      g.lineWidth = Math.max(2, fontPx * 0.0085);
      g.strokeStyle = ink.line;
      g.strokeText(ch, x, y);
    } else {
      g.fillStyle = ink.solid;
      g.fillText(ch, x, y);
    }
    x += g.measureText(ch).width + spacing;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function measure(text: string, ink: Ink, fontPx: number): number {
  const g = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  g.font = `${ink.italic ? "italic " : ""}400 ${fontPx}px ${SERIF}`;
  let w = fontPx * 0.12;
  for (const ch of text) w += g.measureText(ch).width - 0.03 * fontPx;
  return Math.ceil(w);
}

export interface TextPlane {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** width / height of the plane */
  aspect: number;
  dispose: () => void;
}

/** A plane carrying `text`, in solid and outline, ready for the crossfade shader. */
export function createTextPlane(text: string, ink: Ink, fontPx = 320, shadow = 0): TextPlane {
  const width = measure(text, ink, fontPx);
  const height = Math.ceil(fontPx * 1.3);
  // a shadow plane is the same word, blurred, painted near-black, and never writes depth
  const tSolid = drawTexture(text, ink, false, fontPx, width, height, shadow);
  const tLine = shadow ? tSolid : drawTexture(text, ink, true, fontPx, width, height);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tSolid: { value: tSolid },
      tLine: { value: tLine },
      uSolid: { value: shadow ? 1 : 0 },
      uOpacity: { value: 0 },
      uDim: { value: 1 },
      uGain: { value: shadow ? 1 : 1.2 },
      uCut: { value: shadow ? 0.01 : 0.05 },
      uColor: { value: new THREE.Color(shadow ? 0x030302 : ink.hex) },
      uLineColor: { value: new THREE.Color(ink.lineHex) },
    },
    transparent: true,
    depthWrite: !shadow,
    depthTest: true,
    premultipliedAlpha: true,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    material,
    aspect: width / height,
    dispose: () => {
      tSolid.dispose();
      if (tLine !== tSolid) tLine.dispose();
      material.dispose();
      geo.dispose();
    },
  };
}

// ---- the headline ---------------------------------------------------------------------------

/** Where each word sits on screen at the start, and how deep in the scene. */
const PLACE = [
  { left: 0.045, centerY: 0.585, font: 0.185, z: -5.5, ink: INK.ivory, dim: 0.9 }, // CHEMISTRY: behind the structure
  { left: 0.115, centerY: 0.735, font: 0.185, z: 0.4, ink: INK.sage, dim: 1 }, //     reasoned: through it
  { left: 0.04, centerY: 0.9, font: 0.185, z: 7.5, ink: INK.ivory, dim: 1 }, //       by machines.: in front
] as const;

export interface Headline {
  group: THREE.Group;
  /** Place the words for a screen of this aspect, as seen by `cam` (the start camera, view offset already applied). */
  layout: (cam: THREE.PerspectiveCamera) => void;
  update: (f: { introT: number; progress: number; camera: THREE.PerspectiveCamera; alpha: number }) => void;
  dispose: () => void;
}

export function createHeadline(): Headline {
  const group = new THREE.Group();
  const planes = WORDS.map((w, i) => {
    const p = createTextPlane(w, PLACE[i].ink);
    group.add(p.mesh);
    return p;
  });
  const base = WORDS.map(() => new THREE.Vector3());
  const size = WORDS.map(() => new THREE.Vector2(1, 1));
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const toMesh = new THREE.Vector3();

  return {
    group,
    layout(cam) {
      cam.updateMatrixWorld(true);
      cam.getWorldDirection(fwd);
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      PLACE.forEach((pl, i) => {
        // first pass: where along the view does this depth plane lie? (centre ray hits z = pl.z)
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -pl.z);
        ndc.set(0, 0);
        ray.setFromCamera(ndc, cam);
        ray.ray.intersectPlane(plane, hit);
        const dist = Math.max(1, hit.clone().sub(cam.position).dot(fwd));
        const visH = 2 * dist * tanHalf;
        const visW = visH * cam.aspect;
        const h = pl.font * 1.3 * visH; // the plane is 1.3 em tall
        const w = h * planes[i].aspect;
        size[i].set(w, h);
        // place the LEFT edge at pl.left of the screen and the centre line at pl.centerY
        const nx = (pl.left + w / visW / 2) * 2 - 1;
        const ny = 1 - pl.centerY * 2;
        ndc.set(nx, ny);
        ray.setFromCamera(ndc, cam);
        ray.ray.intersectPlane(plane, hit);
        base[i].copy(hit);
        planes[i].mesh.scale.set(w, h, 1);
      });
    },
    update({ introT, progress, camera, alpha }) {
      camera.getWorldDirection(fwd);
      planes.forEach((p, i) => {
        const intro = wordIntro(i, introT);
        const move = wordAt(i, progress);
        p.mesh.position.set(base[i].x + intro.dx * size[i].y * 0.5, base[i].y + move.dy + intro.dy, base[i].z + move.dz);
        // a word never clips through the lens: it dissolves as the camera closes on it
        toMesh.copy(p.mesh.position).sub(camera.position);
        const along = toMesh.dot(fwd);
        const near = along < 0.5 ? 0 : smooth((along - 2.5) / 7);
        p.material.uniforms.uSolid.value = intro.solid;
        p.material.uniforms.uOpacity.value = intro.alpha * move.alpha * near * alpha;
        p.material.uniforms.uDim.value = PLACE[i].dim;
        p.mesh.visible = p.material.uniforms.uOpacity.value > 0.01;
      });
    },
    dispose() {
      planes.forEach((p) => p.dispose());
    },
  };
}

// ---- the identity, inside the structure -----------------------------------------------------

/** Where the identity's ink sits on screen (px): the DOM lines that belong to it hang from these. */
export interface BrandAnchor {
  left: number;
  right: number;
  baseline: number;
  /** cap height in px */
  cap: number;
  visible: boolean;
}

export interface Brand {
  mesh: THREE.Mesh;
  /**
   * Put it `distance` in front of the arrival camera, parallel to the screen, filling `heightFrac` of
   * the view, and offset from the axis by (`offX`, `offY`) as fractions of the visible width / height:
   * the name is set off-centre so the composition is asymmetric.
   */
  place: (pos: THREE.Vector3, look: THREE.Vector3, fov: number, distance: number, heightFrac: number, offX?: number, offY?: number, aspect?: number) => void;
  /** `alpha`: how much of the outline exists; `solid`: how far it has resolved into type. */
  update: (f: { alpha: number; solid: number; t: number; camera: THREE.PerspectiveCamera }) => void;
  /** Project the ink's left / right / baseline to screen pixels. */
  anchor: (camera: THREE.PerspectiveCamera, width: number, height: number, out: BrandAnchor) => void;
  dispose: () => void;
}

const BRAND_FONT = 300;

export function createBrand(): Brand {
  const ink = { solid: "rgb(232,228,216)", line: "rgba(214,164,91,0.95)", hex: 0xe8e4d8, lineHex: 0xd6a45b };
  const plane = createTextPlane("NEOchems", ink, BRAND_FONT);
  const soft = createTextPlane("NEOchems", ink, BRAND_FONT, 7); // its shadow: a little depth, not an effect
  const mesh = plane.mesh;
  const shade = soft.mesh;
  shade.renderOrder = 1;
  mesh.add(shade);
  shade.position.set(0.006, -0.02, -0.012); // in the plane's own units: barely behind and below
  mesh.visible = false;
  const home = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const heightPx = Math.ceil(BRAND_FONT * 1.3);
  const padU = (0.06 * BRAND_FONT) / (plane.aspect * heightPx);
  const project = (u: number, v: number, cam: THREE.PerspectiveCamera, w: number, h: number) => {
    p3.set(u, v, 0);
    mesh.localToWorld(p3);
    p3.project(cam);
    return { x: (p3.x * 0.5 + 0.5) * w, y: (-p3.y * 0.5 + 0.5) * h, z: p3.z };
  };
  return {
    mesh,
    place(pos, look, fov, distance, heightFrac, offX = 0, offY = 0, aspect = 1.6) {
      const dir = look.clone().sub(pos).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
      const visH = 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const visW = visH * aspect;
      home.copy(pos).addScaledVector(dir, distance).addScaledVector(right, offX * visW).addScaledVector(upv, offY * visH);
      mesh.position.copy(home);
      // parallel to the screen (not turned toward the eye), so an off-axis word does not skew
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, pos.clone().add(dir), upv));
      const h = heightFrac * visH * 1.3;
      mesh.scale.set(h * plane.aspect, h, 1);
    },
    update({ alpha, solid, t, camera }) {
      const u = plane.material.uniforms;
      // a word never clips through the lens: it dissolves if the camera closes on it
      camera.getWorldDirection(fwd);
      const along = p3.copy(mesh.position).sub(camera.position).dot(fwd);
      const near = along < 0.5 ? 0 : smooth((along - 3) / 4);
      const a = alpha * near;
      u.uSolid.value = solid;
      u.uOpacity.value = a;
      u.uDim.value = 1;
      soft.material.uniforms.uOpacity.value = a * 0.5 * smooth(solid);
      mesh.visible = a > 0.01;
      // it floats, very slightly
      mesh.position.y = home.y + Math.sin(t * 0.6) * 0.05;
    },
    anchor(camera, width, height, out) {
      mesh.updateMatrixWorld(true);
      const l = project(-0.5 + padU, -0.26, camera, width, height);
      const r = project(0.5 - padU, -0.26, camera, width, height);
      const top = project(0, 0.278, camera, width, height);
      out.left = l.x;
      out.right = r.x;
      out.baseline = l.y;
      out.cap = Math.abs(l.y - top.y);
      out.visible = l.z < 1;
    },
    dispose() {
      plane.dispose();
      soft.dispose();
    },
  };
}
