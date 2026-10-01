// Dual Kawase: дешёвое сильное размытие цепочкой уменьшений/увеличений.
import { HEADER } from './common.js';

export const DOWN = HEADER + `
uniform sampler2D uSrc;
uniform vec2 uRes;      // размер цели
uniform float uOffset;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 hp = uOffset * 0.5 / uRes;
  vec4 s = texture(uSrc, uv) * 4.0;
  s += texture(uSrc, uv - hp);
  s += texture(uSrc, uv + hp);
  s += texture(uSrc, uv + vec2(hp.x, -hp.y));
  s += texture(uSrc, uv - vec2(hp.x, -hp.y));
  o = s / 8.0;
}`;

export const UP = HEADER + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uOffset;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 hp = uOffset * 0.5 / uRes;
  vec4 s = texture(uSrc, uv + vec2(-hp.x * 2.0, 0.0));
  s += texture(uSrc, uv + vec2(-hp.x, hp.y)) * 2.0;
  s += texture(uSrc, uv + vec2(0.0, hp.y * 2.0));
  s += texture(uSrc, uv + vec2(hp.x, hp.y)) * 2.0;
  s += texture(uSrc, uv + vec2(hp.x * 2.0, 0.0));
  s += texture(uSrc, uv + vec2(hp.x, -hp.y)) * 2.0;
  s += texture(uSrc, uv + vec2(0.0, -hp.y * 2.0));
  s += texture(uSrc, uv + vec2(-hp.x, -hp.y)) * 2.0;
  o = s / 12.0;
}`;

export const COPY = HEADER + `
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 o;
void main() { o = texture(uSrc, gl_FragCoord.xy / uRes); }`;
