// Маска фронта и поле расстояний (jump flooding) в разрешении маски.
import { HEADER, NOISE, PACK } from './common.js';

// Маска: 1 — зона чернил, 0 — чистая бумага.
export const MASK = HEADER + NOISE + `
uniform vec2 uRes;       // размер маски в пикселях
uniform vec2 uAspect;    // (w, h) / max(w, h)
uniform vec2 uFront;     // x вертикальной грани и y горизонтальной, бумажные единицы
uniform vec2 uFrontOn;   // 1 — грань включена
uniform float uRadius;   // скругление угла, где грани сходятся
uniform float uMeander;  // крупная волна фронта
uniform vec2 uSeed;
uniform int uMode;       // 0 — линия, 1 — яркость, 2 — рисунок
uniform sampler2D uLum;  // размытый исходник
uniform sampler2D uPaint;
uniform float uThreshold;
uniform float uSoft;
uniform float uInvert;
out vec4 o;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * uAspect;
  float m;
  if (uMode == 0) {
    // > 0 — бумага. Пересечение полуплоскостей «левее X» и «ниже Y»
    // со скруглённым сочленением (точное расстояние вне угла).
    float a = uFrontOn.x > 0.5 ? p.x - uFront.x : -1e3;
    float b = uFrontOn.y > 0.5 ? uFront.y - p.y : -1e3;
    vec2 u = max(vec2(uRadius + a, uRadius + b), 0.0);
    float sd = min(-uRadius, max(a, b)) + length(u);
    float wave = (fbm(p * 2.2 + uSeed, 3) - 0.5) * 2.0;
    sd -= uMeander * wave;
    float px = 1.0 / max(uRes.x, uRes.y);
    m = smoothstep(px, -px, sd);
  } else {
    // крупное искажение границы, чтобы контур не повторял исходник буквально
    vec2 w = vec2(fbm(p * 3.0 + uSeed, 3), fbm(p * 3.0 + uSeed + 41.0, 3)) - 0.5;
    vec2 uvw = uv + w * uMeander * 0.6 / uAspect;
    float v;
    if (uMode == 1) {
      v = luma(texture(uLum, uvw).rgb);
      v = mix(1.0 - v, v, uInvert);
    } else {
      v = texture(uPaint, uvw).r;
    }
    m = smoothstep(uThreshold - uSoft - 1e-3, uThreshold + uSoft + 1e-3, v);
  }
  o = vec4(m, m, m, 1.0);
}`;

// Начальные точки JFA: пиксели зоны чернил, соседствующие с бумагой.
export const JFA_SEED = HEADER + PACK + `
uniform sampler2D uMask;
out vec4 o;
float m(ivec2 p, ivec2 r) { return texelFetch(uMask, clamp(p, ivec2(0), r - 1), 0).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 r = textureSize(uMask, 0);
  bool inside = m(p, r) >= 0.5;
  bool edge = inside && (m(p + ivec2(1, 0), r) < 0.5 || m(p - ivec2(1, 0), r) < 0.5 ||
                         m(p + ivec2(0, 1), r) < 0.5 || m(p - ivec2(0, 1), r) < 0.5);
  o = edge ? pack2x16(vec2(p)) : vec4(1.0);
}`;

export const JFA_STEP = HEADER + PACK + `
uniform sampler2D uPrev;
uniform int uStep;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 r = textureSize(uPrev, 0);
  vec2 best = vec2(65535.0);
  float bd = 1e20;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    ivec2 q = p + ivec2(x, y) * uStep;
    if (q.x < 0 || q.y < 0 || q.x >= r.x || q.y >= r.y) continue;
    vec2 s = unpack2x16(texelFetch(uPrev, q, 0));
    if (s.x > 65000.0) continue;
    vec2 d = s - vec2(p);
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = s; }
  }
  o = pack2x16(best);
}`;

// Итог: знаковое расстояние (+ внутри чернил), в бумажных единицах.
export const DIST = HEADER + PACK + `
uniform sampler2D uSeeds;
uniform sampler2D uMask;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 r = textureSize(uSeeds, 0);
  vec2 s = unpack2x16(texelFetch(uSeeds, p, 0));
  float m = texelFetch(uMask, p, 0).r;
  float scale = 1.0 / float(max(r.x, r.y));
  float d;
  if (s.x > 65000.0) {
    d = m >= 0.5 ? 0.5 : -0.5;          // во всём кадре нет границы
  } else {
    float px = length(s - vec2(p));
    d = m >= 0.5 ? px + 0.5 : -(px - 0.5);
    d *= scale;
  }
  o = packDist(d, m);
}`;

// Сглаживание поля (разделимое, 9 отсчётов) — убирает ступеньки пикселей маски.
export const DIST_BLUR = HEADER + PACK + `
uniform sampler2D uSrc;
uniform ivec2 uAxis;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 r = textureSize(uSrc, 0);
  float w[5] = float[5](0.2270, 0.1945, 0.1216, 0.0540, 0.0162);
  float acc = unpackDist(texelFetch(uSrc, p, 0)) * w[0];
  for (int i = 1; i < 5; i++) {
    ivec2 a = clamp(p + uAxis * i, ivec2(0), r - 1);
    ivec2 b = clamp(p - uAxis * i, ivec2(0), r - 1);
    acc += (unpackDist(texelFetch(uSrc, a, 0)) + unpackDist(texelFetch(uSrc, b, 0))) * w[i];
  }
  o = packDist(acc, texelFetch(uSrc, p, 0).b);
}`;
