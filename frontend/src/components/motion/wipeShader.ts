// A noise-dissolve wipe in a fragment shader, on a bare WebGL canvas (no three.js:
// it must load instantly and cost nothing while idle). Coverage 0..1 sweeps out
// from the click point through fbm noise; the moving edge glows cyan.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uOrigin;  // 0..1, y up
uniform float uCover;  // 0 clear .. 1 covered
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 q = (uv - uOrigin) * vec2(aspect, 1.0);
  float dist = length(q) / (length(vec2(max(uOrigin.x, 1.0 - uOrigin.x) * aspect, max(uOrigin.y, 1.0 - uOrigin.y))) + 1e-4);
  float n = fbm(uv * vec2(aspect, 1.0) * 3.2 + uTime * 0.06);
  // arrival order: mostly distance from the origin, broken up by the noise
  float f = clamp(dist * 0.62 + n * 0.5, 0.0, 1.0);
  float c = uCover * 1.32 - 0.16;
  float edgeW = 0.075;
  float covered = 1.0 - smoothstep(c - edgeW, c, f);          // 1 behind the front
  float band = smoothstep(c - edgeW * 1.1, c - edgeW * 0.25, f) * (1.0 - smoothstep(c - edgeW * 0.25, c + edgeW * 0.08, f));
  vec3 base = vec3(0.063, 0.067, 0.059);
  vec3 cyan = vec3(0.72, 0.46, 0.32); // copper front
  // faint molecular grid inside the covered area
  vec2 g = abs(fract(uv * vec2(aspect, 1.0) * 26.0) - 0.5);
  float grid = (1.0 - smoothstep(0.0, 0.03, min(g.x, g.y))) * 0.05;
  vec3 col = base + cyan * grid * covered + cyan * band * 0.5;
  float a = clamp(covered + band * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

export interface Wipe {
  render(cover: number, ox: number, oy: number, t: number): void;
  resize(): void;
  dispose(): void;
}

/** Returns null when WebGL is unavailable; the caller falls back to a plain fade. */
export function createWipe(canvas: HTMLCanvasElement): Wipe | null {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uOrigin = gl.getUniformLocation(prog, "uOrigin");
  const uCover = gl.getUniformLocation(prog, "uCover");
  const uTime = gl.getUniformLocation(prog, "uTime");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  };

  return {
    resize,
    render(cover, ox, oy, t) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uOrigin, ox, oy);
      gl.uniform1f(uCover, cover);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
