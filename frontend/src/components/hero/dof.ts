// Real depth of field, cheap enough for integrated graphics: the scene renders once into a
// target with a depth texture, and a single full-screen pass blurs each pixel by its own
// circle of confusion (8 taps, colour only; sharp regions get edge-aware smoothing instead of MSAA). Near and far are blurred; a band around the focus
// distance stays sharp. It also applies the renderer's tone mapping and colour space, since
// those are skipped for off-screen targets.
import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;       // 1 / target size
uniform float uNear;
uniform float uFar;
uniform float uFocus;      // view-space distance that is sharp
uniform float uRange;      // distance over which blur ramps to its maximum
uniform float uMaxBlur;    // pixels
uniform float uAmount;     // 0..1 master strength
varying vec2 vUv;

float viewZ(float d){
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float coc(float d){
  // depth 1.0 means "nothing here": treat as far
  float z = d >= 0.9999 ? uFar : viewZ(d);
  float k = clamp(abs(z - uFocus) / uRange, 0.0, 1.0);
  return pow(k, 1.25) * uMaxBlur * uAmount;
}

const vec2 TAPS[8] = vec2[8](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.203, 0.621), vec2(0.962, -0.195),
  vec2( 0.473, -0.480), vec2( 0.519, 0.767), vec2(-0.322, -0.933), vec2( 0.896, 0.412)
);

float luma(vec4 c){ return dot(c.rgb, vec3(0.299, 0.587, 0.114)) + c.a * 0.25; }

// Cheap edge-aware antialiasing for the sharp region (the target is not multisampled): where the
// four neighbours differ strongly from the centre, blend toward their average.
vec4 smoothEdges(vec2 uv){
  vec4 c = texture2D(tColor, uv);
  vec4 n = texture2D(tColor, uv + vec2(0.0, -uTexel.y));
  vec4 s = texture2D(tColor, uv + vec2(0.0,  uTexel.y));
  vec4 e = texture2D(tColor, uv + vec2( uTexel.x, 0.0));
  vec4 w = texture2D(tColor, uv + vec2(-uTexel.x, 0.0));
  float lc = luma(c), ln = luma(n), ls = luma(s), le = luma(e), lw = luma(w);
  float lo = min(lc, min(min(ln, ls), min(le, lw)));
  float hi = max(lc, max(max(ln, ls), max(le, lw)));
  float range = hi - lo;
  if (range < max(0.06, hi * 0.18)) return c;
  return mix(c, (n + s + e + w) * 0.25, clamp(range * 0.8, 0.0, 0.3));
}

void main(){
  float r = coc(texture2D(tDepth, vUv).x);
  vec4 c;
  if (r > 0.6) {
    vec4 sum = texture2D(tColor, vUv);
    float w = 1.0;
    for (int i = 0; i < 8; i++) {
      vec2 o = TAPS[i] * r;
      vec2 uv = vUv + o * uTexel;
      // A tap only contributes if ITS OWN blur reaches this pixel. A sharp silhouette therefore never
      // bleeds into the blurred background beside it (that bleed was a pale halo around every atom and letter).
      float dt = texture2D(tDepth, uv).x;
      float zt = dt >= 0.9999 ? uFar : viewZ(dt);
      float rt = clamp(abs(zt - uFocus) / uRange, 0.0, 1.0) * uMaxBlur * uAmount;
      float wt = clamp(rt / max(length(o) * 0.8, 0.5), 0.0, 1.0);
      sum += texture2D(tColor, uv) * wt;
      w += wt;
    }
    c = sum / w;
  } else {
    c = smoothEdges(vUv);
  }
  // The target is transparent, so edge pixels hold PREMULTIPLIED colour. Tone-map and encode the straight
  // colour, then premultiply again: encoding premultiplied values brightened every silhouette into a
  // pale fringe around atoms and letters.
  vec3 straight = c.a > 0.002 ? c.rgb / c.a : vec3(0.0);
  gl_FragColor = vec4(straight, c.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

export interface Dof {
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: number, amount?: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createDof(renderer: THREE.WebGLRenderer, samples = 0): Dof {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const depthTexture = new THREE.DepthTexture(size.x, size.y);
  depthTexture.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture,
    samples,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      uNear: { value: 0.1 },
      uFar: { value: 260 },
      uFocus: { value: 20 },
      uRange: { value: 14 },
      uMaxBlur: { value: 6 },
      uAmount: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const pass = new THREE.Scene();
  pass.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    render(scene, camera, focus, amount = 1) {
      const u = material.uniforms;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uFocus.value = focus;
      u.uRange.value = Math.max(8, focus * 1.0);
      u.uAmount.value = amount;
      // the pixel scale of the blur follows the drawing buffer, so it looks the same at any pixel ratio
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(pass, ortho);
    },
    resize(width, height) {
      const dpr = renderer.getPixelRatio();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      target.setSize(w, h);
      material.uniforms.uTexel.value.set(1 / w, 1 / h);
    },
    dispose() {
      target.dispose();
      depthTexture.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
