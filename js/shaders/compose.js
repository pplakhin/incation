// Итоговый проход: фронт, хроматографическая кайма, пастельный интерьер, бумага.
// Работает в «бумажных» координатах p = uv * aspect, поэтому превью и экспорт
// в любом разрешении выглядят одинаково.
import { HEADER, NOISE, PACK } from './common.js';

export const MAX_PIGMENTS = 6;

export const COMPOSE = HEADER + NOISE + PACK + `
#define MAXP ${MAX_PIGMENTS}
uniform vec2 uFull;       // полный размер результата, px
uniform vec2 uOffset;     // смещение тайла, px
uniform float uFlip;      // 1 — вывод на холст (ось y вверх)
uniform vec2 uAspect;
uniform sampler2D uDist;  // упакованное знаковое расстояние
uniform sampler2D uBlur;  // сильно размытый исходник
uniform sampler2D uSrc;   // исходник превью (для «до»)
uniform vec2 uDir;
uniform vec2 uSeed;

uniform float uLobeAmp, uLobeFreq, uRough, uRoughFreq, uPocket;
uniform float uBandW, uResidual, uEdge, uEdgeW, uChroma;
uniform vec3 uEdgeCol;
uniform int uPigCount;
uniform vec3 uPigCol[MAXP];
uniform float uPigPos[MAXP];
uniform float uPigWid[MAXP];
uniform float uPigStr[MAXP];
uniform float uPigSoft[MAXP];
uniform int uMode;        // 0 — субтрактивное смешение, 1 — gradient map

uniform float uSmear, uLanes, uLaneFreq, uInterior, uBlotch;
uniform float uWhite, uSat, uPalShift;
uniform vec3 uIntC, uIntM, uIntY, uIntK;

uniform vec3 uPaper;
uniform float uGrain, uGran, uGrainScale;
uniform int uView;        // 0 — результат, 1 — исходник, 2 — поле, 3 — интерьер
uniform float uSplit;     // до/после: x < uSplit показывает исходник
out vec4 o;

float distAt(vec2 uv) {
  vec2 ts = vec2(textureSize(uDist, 0));
  vec2 x = uv * ts - 0.5;
  vec2 f = fract(x);
  ivec2 i = ivec2(floor(x));
  ivec2 r = ivec2(ts) - 1;
  float a = unpackDist(texelFetch(uDist, clamp(i, ivec2(0), r), 0));
  float b = unpackDist(texelFetch(uDist, clamp(i + ivec2(1, 0), ivec2(0), r), 0));
  float c = unpackDist(texelFetch(uDist, clamp(i + ivec2(0, 1), ivec2(0), r), 0));
  float d = unpackDist(texelFetch(uDist, clamp(i + ivec2(1, 1), ivec2(0), r), 0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 tint(vec3 c, float rho) { return pow(max(c, vec3(0.004)), vec3(max(rho, 0.0))); }

// Пропускание слоёв пигментов на расстоянии x (в ширинах каймы) от фронта.
vec3 bands(float x, float lobe, float near, float laneMod, float laneN, out float dens) {
  float lobeK = lobe * near;
  // во впадинах между гребешками следующие пигменты подходят ближе к кромке
  float pull = mix(1.0, 0.45 + 0.55 * lobe, uPocket * near);
  vec3 T = vec3(1.0);
  dens = 0.0;
  if (uMode == 1) {
    // запасной режим: градиентная карта по расстоянию
    vec3 c = uPigCol[0];
    for (int i = 1; i < MAXP; i++) {
      if (i >= uPigCount) break;
      float a = uPigPos[i - 1], b = max(uPigPos[i], a + 1e-3);
      c = mix(c, uPigCol[i], smoothstep(a, b, x));
    }
    float fade = exp(-max(x - uPigPos[uPigCount - 1], 0.0) / max(uPigWid[uPigCount - 1], 1e-3));
    float rho = mix(uResidual, 1.0, fade) * mix(1.0, laneMod, smoothstep(0.0, 0.6, x));
    dens = rho;
    return mix(vec3(1.0), c, clamp(rho, 0.0, 1.0));
  }
  for (int i = 0; i < MAXP; i++) {
    if (i >= uPigCount) break;
    // в каждой дорожке пигменты уходят на свою дистанцию
    float a = uPigPos[i] * pull + (i > 0 ? uLanes * 1.4 * (laneN - 0.5) * float(i) : 0.0);
    float w = uPigWid[i];
    float s = uPigSoft[i];
    float str = uPigStr[i];
    if (i == 0) {
      // тёмные «карманы» пигмента под выпуклостями гребешков
      w *= mix(1.0, 0.45 + 1.3 * lobeK, uPocket);
      str *= mix(1.0, 0.7 + 1.1 * lobeK, uPocket);
    }
    float rise = smoothstep(a - s, a + s * 0.25, x);
    float tail = exp(-pow(max(x - a, 0.0) / max(w, 1e-3), 1.6));
    float res = uResidual / float(i + 1);
    float rho = str * rise * (res + (1.0 - res) * tail);
    if (i > 0) rho *= mix(1.0, laneMod, smoothstep(0.0, 0.6, x));
    T *= tint(uPigCol[i], rho);
    dens += rho;
  }
  return T;
}

void main() {
  vec2 px = gl_FragCoord.xy + uOffset;
  vec2 uv = px / uFull;
  if (uFlip > 0.5) uv.y = 1.0 - uv.y;
  vec2 p = uv * uAspect;
  float pxP = 1.0 / max(uFull.x, uFull.y);

  if (uView == 1 || uv.x < uSplit) { o = vec4(texture(uSrc, uv).rgb, 1.0); return; }

  // поле расстояний и его градиент (направление вглубь чернил)
  float sdf = distAt(uv);
  vec2 dts = 1.5 / vec2(textureSize(uDist, 0));
  vec2 g = vec2(distAt(uv + vec2(dts.x, 0.0)) - distAt(uv - vec2(dts.x, 0.0)),
                distAt(uv + vec2(0.0, dts.y)) - distAt(uv - vec2(0.0, dts.y))) / (2.0 * dts * uAspect);
  g = length(g) > 1e-4 ? normalize(g) : -uDir;
  vec2 perp = vec2(-uDir.y, uDir.x);

  // фронт: гребешки (клетки Уорли) + рваная кромка (fbm).
  // Гребешки считаются в ближайшей точке фронта, поэтому тянутся колоннами
  // поперёк него и не рисуют сетку клеток внутри чернил.
  vec2 pf = p - g * sdf;
  vec2 wl = worley(pf * uLobeFreq + uSeed);
  float e = clamp((wl.y - wl.x) * 1.6, 0.0, 1.0);
  float lobe = 1.0 - (1.0 - e) * (1.0 - e);
  // сглаженная версия без острого минимума — для пигментов, иначе во впадинах тонкие штрихи
  float lobeS = smoothstep(0.0, 1.0, e);
  float rough = (fbm(p * uRoughFreq + uSeed * 1.3, 4) - 0.5)
              + 0.45 * (vnoise(p * uRoughFreq * 5.0 + uSeed) - 0.5);
  float disp = uLobeAmp * (lobe - 0.35) + uRough * rough;
  float dF = sdf + disp;
  float near = exp(-max(sdf, 0.0) / (uBandW * 1.2 + uLobeAmp));
  float nearM = exp(-max(sdf, 0.0) / (uBandW * 0.8 + uLobeAmp));
  float x = (sdf + uLobeAmp * (lobe - 0.35) * nearM + uRough * rough * near) / uBandW;
  // влияние гребешков на пигменты гаснет быстрее: глубоко внутри проекция на фронт
  // неустойчива (срединная ось поля) и рисовала бы сетку линий
  float nearL = exp(-max(sdf, 0.0) / (uBandW * 0.45 + uLobeAmp));
  float lobeK = lobeS * nearL;

  // дорожки поперёк фронта
  float lt = dot(p, perp) * uLaneFreq;
  float lane = fbm(vec2(lt, dot(p, uDir) * uLaneFreq * 0.08) + uSeed * 0.37, 3);
  float laneMod = mix(1.0, smoothstep(0.32, 0.68, lane), uLanes);

  // интерьер: размытый исходник, протянутый вдоль градиента поля
  vec2 gUV = g / uAspect;
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int i = 0; i < 14; i++) {
    float f = float(i) / 13.0;
    float wt = 1.0 - 0.75 * f;
    acc += texture(uBlur, uv + gUV * (f * uSmear)).rgb * wt;
    ws += wt;
  }
  vec3 s = acc / ws;
  vec3 cmy = clamp(1.0 - s, 0.0, 1.0);
  // нейтральная часть плотности уходит в серо-лавандовый, цветная — в пигменты палитры
  float k = min(cmy.r, min(cmy.g, cmy.b));
  cmy -= k * 0.9;
  vec3 syn = tint(uIntC, cmy.r * 1.3) * tint(uIntM, cmy.g * 1.3) * tint(uIntY, cmy.b * 1.3) * tint(uIntK, k * 0.6);
  vec3 base = mix(s, syn, uPalShift);
  base = mix(vec3(luma(base)), base, uSat);
  base = mix(base, vec3(1.0), uWhite);
  float blotch = mix(1.0, smoothstep(0.32, 0.72, fbm(p * 2.4 + uSeed * 0.7, 4)) * 1.5, uBlotch);
  float rhoInt = uInterior * smoothstep(0.7, 2.0, x) * clamp(blotch, 0.0, 1.5) * laneMod;
  vec3 Tint = tint(base, rhoInt);

  // кайма со смещением каналов (chromatic offset)
  float dR, dG, dB;
  vec3 tR = bands(x + uChroma, lobeS, nearL, laneMod, lane, dR);
  vec3 tG = bands(x, lobeS, nearL, laneMod, lane, dG);
  vec3 tB = bands(x - uChroma, lobeS, nearL, laneMod, lane, dB);
  vec3 Tb = vec3(tR.r, tG.g, tB.b);
  float dens = dG;

  // кофейное кольцо у самой кромки
  float ring = uEdge * exp(-max(dF, 0.0) / uEdgeW) * (0.55 + 0.9 * lobeK);
  Tb *= tint(uEdgeCol, ring);
  dens += ring;

  // бумага: зерно холодного прессования и грануляция во впадинах
  vec2 gp = p * uGrainScale + uSeed * 3.1;
  vec2 wg = worley(gp);
  float bump = 1.0 - smoothstep(0.0, 0.95, wg.x);
  float fine = vnoise(gp * 2.9) * 0.6 + vnoise(gp * 6.1 + 5.0) * 0.4;
  float h = clamp(0.35 * bump + 0.65 * fine, 0.0, 1.0);
  float valley = 1.0 - h;
  vec3 paper = uPaper * (1.0 - uGrain * 0.045 * (valley - 0.5));

  vec3 T = Tb * Tint;
  T = pow(max(T, vec3(0.002)), vec3(1.0 + uGrain * 0.5 * (valley - 0.45)));
  float sn = vnoise(gp * 2.7 + 13.0) * 0.6 + valley * 0.55;
  float speck = smoothstep(0.72, 0.97, sn) * uGran * clamp(dens + rhoInt * 0.6, 0.0, 1.0);
  T = pow(T, vec3(1.0 + speck * 1.1));

  float cover = smoothstep(-pxP, pxP, dF);
  vec3 col = paper * mix(vec3(1.0), T, cover);

  if (uView == 2) col = vec3(0.5 + 4.0 * dF, 0.5 + 4.0 * sdf, cover);
  if (uView == 3) col = base;
  o = vec4(col, 1.0);
}`;
