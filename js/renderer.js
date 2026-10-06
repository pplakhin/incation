// Конвейер: исходник → размытие (Kawase) → маска → JFA → поле расстояний → композиция.
// Все поля считаются в невысоком разрешении, а мелкие детали (кромка, зерно)
// композиция вычисляет процедурно, поэтому экспорт в полном размере не требует
// полноразмерных текстур и рендерится тайлами.
import { getContext, Program, Target, createTexture, draw } from './gl.js';
import { MASK, JFA_SEED, JFA_STEP, DIST, DIST_BLUR } from './shaders/field.js';
import { DOWN, UP, COPY } from './shaders/blur.js';
import { COMPOSE, MAX_PIGMENTS } from './shaders/compose.js';

const BASE = 512;       // рабочий размер для размытия
const MASK_RES = 768;   // длинная сторона маски и поля расстояний
const EXPORT_TILE = 1024;

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function seedVec(seed) {
  const f = (x) => { const s = Math.sin(x) * 43758.5453; return s - Math.floor(s); };
  return [f(seed * 12.9898 + 1.0) * 173.0, f(seed * 78.233 + 2.0) * 131.0];
}

// Грани фронта: X у правого края и Y у верхнего означают «выключена».
function frontOf(p) {
  const on = [p.frontX < 0.995 ? 1 : 0, p.frontY > 0.005 ? 1 : 0];
  // направление растекания (к фронту); ось y экрана направлена вниз
  const dir = on[0] && on[1] ? [Math.SQRT1_2, -Math.SQRT1_2] : on[1] ? [0, -1] : [1, 0];
  return { on, dir };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = getContext(canvas);
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.progs = {
      mask: new Program(gl, MASK),
      seed: new Program(gl, JFA_SEED),
      jfa: new Program(gl, JFA_STEP),
      dist: new Program(gl, DIST),
      distBlur: new Program(gl, DIST_BLUR),
      down: new Program(gl, DOWN),
      up: new Program(gl, UP),
      copy: new Program(gl, COPY),
      compose: new Program(gl, COMPOSE),
    };
    this.paintTex = createTexture(gl, 1, 1, { source: null });
    this.src = null;
    this.keys = {};
  }

  // source — canvas/ImageBitmap в разрешении превью
  setSource(source) {
    const gl = this.gl;
    this._disposeSized();
    this.w = source.width;
    this.h = source.height;
    const m = Math.max(this.w, this.h);
    this.aspect = [this.w / m, this.h / m];
    this.src = createTexture(gl, 0, 0, { source });

    // цепочка предварительного уменьшения до BASE
    this.pre = [];
    let w = this.w, h = this.h;
    while (Math.max(w, h) > BASE) {
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
      this.pre.push(new Target(gl, w, h));
    }
    this.baseW = w;
    this.baseH = h;
    if (!this.pre.length) this.pre.push(new Target(gl, w, h));
    this.kDown = [];
    this.kUp = [];
    for (let i = 1; i <= 7; i++) {
      const tw = Math.max(1, Math.ceil(w / 2 ** i)), th = Math.max(1, Math.ceil(h / 2 ** i));
      this.kDown.push(new Target(gl, tw, th));
      this.kUp.push(new Target(gl, Math.max(1, Math.ceil(w / 2 ** (i - 1))), Math.max(1, Math.ceil(h / 2 ** (i - 1)))));
    }
    this.blurOut = new Target(gl, w, h);
    this.lumOut = new Target(gl, w, h);

    const s = MASK_RES / m;
    this.mw = Math.max(8, Math.round(this.w * s));
    this.mh = Math.max(8, Math.round(this.h * s));
    this.mask = new Target(gl, this.mw, this.mh, gl.NEAREST);
    this.jfaA = new Target(gl, this.mw, this.mh, gl.NEAREST);
    this.jfaB = new Target(gl, this.mw, this.mh, gl.NEAREST);
    this.distA = new Target(gl, this.mw, this.mh, gl.NEAREST);
    this.distB = new Target(gl, this.mw, this.mh, gl.NEAREST);
    this.keys = {};
    this.version = (this.version || 0) + 1;
  }

  setPaint(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.paintVersion = (this.paintVersion || 0) + 1;
  }

  _disposeSized() {
    const gl = this.gl;
    if (!this.src) return;
    gl.deleteTexture(this.src);
    for (const t of [...this.pre, ...this.kDown, ...this.kUp, this.blurOut, this.lumOut,
      this.mask, this.jfaA, this.jfaB, this.distA, this.distB]) t.dispose();
  }

  _kawase(levels, offset, out) {
    const gl = this.gl, P = this.progs;
    let tex = this.pre[this.pre.length - 1].tex;
    if (levels === 0) {
      out.bind();
      P.copy.use().tex('uSrc', tex).f('uRes', out.w, out.h);
      draw(gl);
      return;
    }
    for (let i = 0; i < levels; i++) {
      const t = this.kDown[i];
      t.bind();
      P.down.use().tex('uSrc', tex).f('uRes', t.w, t.h).f('uOffset', offset);
      draw(gl);
      tex = t.tex;
    }
    for (let i = levels - 1; i >= 0; i--) {
      const t = i === 0 ? out : this.kUp[i];
      t.bind();
      P.up.use().tex('uSrc', tex).f('uRes', t.w, t.h).f('uOffset', offset);
      draw(gl);
      tex = t.tex;
    }
  }

  _prefilter() {
    const gl = this.gl, P = this.progs;
    let tex = this.src;
    for (const t of this.pre) {
      t.bind();
      P.down.use().tex('uSrc', tex).f('uRes', t.w, t.h).f('uOffset', 1.0);
      draw(gl);
      tex = t.tex;
    }
  }

  _updateBlur(p) {
    const key = `${this.version}|${p.blur}`;
    if (this.keys.blur === key) return;
    if (this.keys.pre !== this.version) {
      this._prefilter();
      this._kawase(4, 1.2, this.lumOut); // маска по яркости не должна ловить мелкие детали
      this.keys.pre = this.version;
    }
    const b = Math.max(0, Math.min(1, p.blur)) * 6;
    const levels = Math.min(6, Math.floor(b));
    this._kawase(levels, 1.0 + (b - levels) * 1.2, this.blurOut);
    this.keys.blur = key;
  }

  _updateField(p) {
    const key = [this.version, this.paintVersion, p.maskMode, p.frontX, p.frontY, p.cornerRadius, p.meander,
      p.threshold, p.softness, p.invert, p.seed].join('|');
    if (this.keys.field === key) return;
    const gl = this.gl, P = this.progs;
    const { on } = frontOf(p);
    const mode = { line: 0, luma: 1, paint: 2 }[p.maskMode] ?? 0;

    this.mask.bind();
    P.mask.use()
      .f('uRes', this.mw, this.mh).f('uAspect', ...this.aspect)
      .f('uFront', p.frontX * this.aspect[0], p.frontY * this.aspect[1]).f('uFrontOn', ...on)
      .f('uRadius', p.cornerRadius ?? 0.1).f('uMeander', p.meander)
      .f('uSeed', ...seedVec(p.seed)).i('uMode', mode)
      .tex('uLum', this.lumOut.tex).tex('uPaint', this.paintTex)
      .f('uThreshold', mode === 2 ? 0.5 : p.threshold).f('uSoft', mode === 2 ? 0.02 : p.softness).f('uInvert', p.invert ? 1 : 0);
    draw(gl);

    this.jfaA.bind();
    P.seed.use().tex('uMask', this.mask.tex);
    draw(gl);

    let a = this.jfaA, b = this.jfaB;
    let step = 1;
    while (step * 2 < Math.max(this.mw, this.mh)) step *= 2;
    const steps = [];
    for (; step >= 1; step >>= 1) steps.push(step);
    steps.push(1); // дополнительный проход «1+JFA» уточняет результат
    for (const s of steps) {
      b.bind();
      P.jfa.use().tex('uPrev', a.tex).i('uStep', s);
      draw(gl);
      [a, b] = [b, a];
    }

    this.distA.bind();
    P.dist.use().tex('uSeeds', a.tex).tex('uMask', this.mask.tex);
    draw(gl);
    this.distB.bind();
    P.distBlur.use().tex('uSrc', this.distA.tex);
    gl.uniform2i(P.distBlur.u('uAxis'), 1, 0);
    draw(gl);
    this.distA.bind();
    P.distBlur.use().tex('uSrc', this.distB.tex);
    gl.uniform2i(P.distBlur.u('uAxis'), 0, 1);
    draw(gl);
    this.keys.field = key;
  }

  _composeUniforms(p, opts) {
    const P = this.progs.compose.use();
    const front = frontOf(p);
    const pig = p.pigments.slice(0, MAX_PIGMENTS);
    const n = pig.length;
    const pad = (arr, v) => { const a = arr.slice(); while (a.length < MAX_PIGMENTS) a.push(v); return a; };
    const cols = [];
    for (let i = 0; i < MAX_PIGMENTS; i++) cols.push(...(pig[i] ? hexToRgb(pig[i].color) : [1, 1, 1]));
    P.f('uAspect', ...this.aspect)
      .tex('uDist', this.distA.tex).tex('uBlur', this.blurOut.tex).tex('uSrc', opts.photo || this.src)
      .f('uDir', ...front.dir)
      .f('uFrontPos', p.frontX * this.aspect[0], p.frontY * this.aspect[1]).f('uFrontOn', ...front.on)
      .f('uBlurAmt', p.blur).f('uSeed', ...seedVec(p.seed))
      .f('uLobeAmp', p.lobeAmp).f('uLobeFreq', p.lobeFreq).f('uRough', p.rough)
      .f('uRoughFreq', p.roughFreq).f('uPocket', p.pocket)
      .f('uBandW', Math.max(0.002, p.bandWidth)).f('uResidual', p.residual)
      .f('uEdge', p.edge).f('uEdgeW', Math.max(0.0005, p.edgeWidth)).f('uChroma', p.chroma)
      .f('uEdgeCol', ...hexToRgb(p.edgeColor))
      .i('uPigCount', n).v3('uPigCol', cols)
      .fv('uPigPos', pad(pig.map((q) => q.pos), 0))
      .fv('uPigWid', pad(pig.map((q) => q.width), 1))
      .fv('uPigStr', pad(pig.map((q) => q.strength * (p.pigmentStrength ?? 1)), 0))
      .fv('uPigSoft', pad(pig.map((q) => q.soft), 0.1))
      .i('uMode', p.mode === 'gradient' ? 1 : 0)
      .f('uSmear', p.smear).f('uLanes', p.lanes).f('uLaneFreq', p.laneFreq)
      .f('uInterior', p.interior).f('uBlotch', p.blotch)
      .f('uPhoto', 1 - (p.darken ?? 0.65)).f('uWhite', p.white).f('uSat', p.saturation).f('uPalShift', p.paletteShift)
      .f('uIntC', ...hexToRgb(p.interiorC)).f('uIntM', ...hexToRgb(p.interiorM))
      .f('uIntY', ...hexToRgb(p.interiorY)).f('uIntK', ...hexToRgb(p.interiorK))
      .f('uPaper', ...hexToRgb(p.paper)).f('uGrain', p.grain).f('uGran', p.granulation)
      .f('uGrainScale', p.grainScale)
      .i('uView', opts.view || 0).f('uSplit', opts.split ?? -1);
    return P;
  }

  // Превью на холсте
  render(p, opts = {}) {
    if (!this.src) return;
    const gl = this.gl;
    this._updateBlur(p);
    this._updateField(p);
    const cw = this.canvas.width, ch = this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    this._composeUniforms(p, opts).f('uFull', cw, ch).f('uOffset', 0, 0).f('uFlip', 1);
    draw(gl);
  }

  // Полноразмерный рендер тайлами → RGBA-пиксели (строка 0 — верх изображения)
  // full — исходник в полном разрешении: нужен, когда фото проступает сквозь чернила
  renderPixels(p, W, H, full) {
    const gl = this.gl;
    const photo = full ? createTexture(gl, 0, 0, { source: full }) : null;
    this._updateBlur(p);
    this._updateField(p);
    const T = Math.min(EXPORT_TILE, this.maxViewport[0], this.maxViewport[1]);
    const tile = new Target(gl, T, T, gl.NEAREST);
    const out = new Uint8ClampedArray(W * H * 4);
    const buf = new Uint8Array(T * T * 4);
    for (let y0 = 0; y0 < H; y0 += T) {
      for (let x0 = 0; x0 < W; x0 += T) {
        const tw = Math.min(T, W - x0), th = Math.min(T, H - y0);
        tile.bind();
        gl.viewport(0, 0, tw, th);
        this._composeUniforms(p, { photo }).f('uFull', W, H).f('uOffset', x0, y0).f('uFlip', 0);
        draw(gl);
        gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let r = 0; r < th; r++) {
          out.set(buf.subarray(r * tw * 4, (r + 1) * tw * 4), ((y0 + r) * W + x0) * 4);
        }
      }
    }
    tile.dispose();
    if (photo) gl.deleteTexture(photo);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
}
