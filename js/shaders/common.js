// Общие GLSL-функции: шум без sin() (стабилен на мобильных GPU),
// fbm, клеточный шум Уорли и упаковка 16-битных чисел в RGBA8.

export const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

export const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / n;
}

// (F1, F2) — расстояния до ближайшей и второй точки
vec2 worley(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash22(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const PACK = `
vec4 pack2x16(vec2 v) {
  v = clamp(floor(v + 0.5), 0.0, 65535.0);
  return vec4(floor(v.x / 256.0), mod(v.x, 256.0), floor(v.y / 256.0), mod(v.y, 256.0)) / 255.0;
}
vec2 unpack2x16(vec4 c) {
  c = floor(c * 255.0 + 0.5);
  return vec2(c.r * 256.0 + c.g, c.b * 256.0 + c.a);
}
// знаковое расстояние в «бумажных» единицах, диапазон [-0.5, 0.5]
vec4 packDist(float d, float mask) {
  float v = clamp((d + 0.5) * 65535.0, 0.0, 65535.0);
  v = floor(v + 0.5);
  return vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, mask, 1.0);
}
float unpackDist(vec4 c) {
  c = floor(c * 255.0 + 0.5);
  return (c.r * 256.0 + c.g) / 65535.0 - 0.5;
}
`;
