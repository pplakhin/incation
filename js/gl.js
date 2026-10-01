// Тонкая обёртка над WebGL2: шейдеры, текстуры, рендер-таргеты.
// Все промежуточные текстуры — RGBA8: они рендерятся на любом WebGL2, включая iOS.

export const VERT = `#version 300 es
void main() {
  // полноэкранный треугольник без буферов
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function getContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  return gl;
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.error(numbered);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}

export class Program {
  constructor(gl, fragSrc) {
    this.gl = gl;
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    }
    this.p = p;
    this.loc = new Map();
    this.units = new Map();
  }

  use() {
    this.gl.useProgram(this.p);
    this.nextUnit = 0;
    return this;
  }

  u(name) {
    let l = this.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.p, name);
      this.loc.set(name, l);
    }
    return l;
  }

  f(name, ...v) {
    const gl = this.gl, l = this.u(name);
    if (l === null) return this;
    if (v.length === 1) gl.uniform1f(l, v[0]);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
    else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    return this;
  }

  i(name, v) {
    const l = this.u(name);
    if (l !== null) this.gl.uniform1i(l, v);
    return this;
  }

  fv(name, arr) {
    const l = this.u(name);
    if (l !== null) this.gl.uniform1fv(l, arr);
    return this;
  }

  v3(name, arr) {
    const l = this.u(name);
    if (l !== null) this.gl.uniform3fv(l, arr);
    return this;
  }

  tex(name, texture) {
    const gl = this.gl, unit = this.nextUnit++;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const l = this.u(name);
    if (l !== null) gl.uniform1i(l, unit);
    return this;
  }
}

export function createTexture(gl, w, h, { filter = gl.LINEAR, source = null } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export class Target {
  constructor(gl, w, h, filter = gl.LINEAR) {
    this.gl = gl;
    this.w = w;
    this.h = h;
    this.tex = createTexture(gl, w, h, { filter });
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }

  dispose() {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fbo);
  }
}

export function draw(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
