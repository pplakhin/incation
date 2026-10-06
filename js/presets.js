// Параметры по умолчанию и пресеты по мотивам референсов.
// Расстояния — в долях длинной стороны кадра.

export const DEFAULTS = {
  maskMode: 'line',
  // фронт: вертикальная грань на frontX (чернила слева), горизонтальная на frontY
  // (чернила снизу), доли ширины/высоты кадра. frontX = 1 или frontY = 0 — грань выключена.
  frontX: 0.72,
  frontY: 0,
  cornerRadius: 0.1,
  meander: 0.02,
  threshold: 0.5,
  softness: 0.08,
  invert: false,

  lobeAmp: 0.022,
  lobeFreq: 11,
  rough: 0.006,
  roughFreq: 70,
  pocket: 0.8,

  bandWidth: 0.11,
  residual: 0.04,
  edge: 2.2,
  edgeWidth: 0.005,
  edgeColor: '#0B1F6B',
  chroma: 0.03,
  mode: 'subtractive',
  pigmentStrength: 1,
  pigments: [
    { color: '#1340D0', pos: 0.0, width: 0.3, strength: 1.0, soft: 0.03 },
    { color: '#E23A86', pos: 0.36, width: 0.36, strength: 0.85, soft: 0.3 },
    { color: '#F7CF36', pos: 0.78, width: 0.5, strength: 0.9, soft: 0.35 },
  ],

  darken: 0.65,
  blur: 0.62,
  smear: 0.18,
  lanes: 0.25,
  laneFreq: 7,
  interior: 0.75,
  blotch: 0.75,
  white: 0.6,
  saturation: 1.35,
  paletteShift: 0.6,
  interiorC: '#6E86E6',
  interiorM: '#EE6A9C',
  interiorY: '#F4D45C',
  interiorK: '#9C9AD0',

  paper: '#F5F1EA',
  grain: 0.7,
  granulation: 0.45,
  grainScale: 480,

  seed: 7,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export const PRESETS = [
  {
    id: 'stripes',
    name: 'Полосы',
    params: { frontX: 0.72, frontY: 0, bandWidth: 0.1, lobeAmp: 0.02, lobeFreq: 12, lanes: 0.8, laneFreq: 6, smear: 0.3, white: 0.62 },
  },
  {
    id: 'top',
    name: 'Фронт сверху',
    params: { frontX: 1, frontY: 0.1, bandWidth: 0.22, lobeAmp: 0.05, lobeFreq: 5, meander: 0.03, pocket: 1, lanes: 0.25, laneFreq: 3, edgeWidth: 0.008 },
  },
  {
    id: 'right',
    name: 'Фронт справа',
    params: { frontX: 0.82, frontY: 0, bandWidth: 0.2, lobeAmp: 0.035, lobeFreq: 4, meander: 0.05, pocket: 1, lanes: 0.2, laneFreq: 3, edgeWidth: 0.007, chroma: 0.04 },
  },
  {
    id: 'soft',
    name: 'Мягкий',
    params: { frontX: 0.78, frontY: 0, bandWidth: 0.08, lobeAmp: 0.012, edge: 0.8, chroma: 0.02, white: 0.7, saturation: 1.1 },
  },
];

export function presetParams(id) {
  const pr = PRESETS.find((p) => p.id === id) || PRESETS[0];
  return Object.assign(clone(DEFAULTS), clone(pr.params));
}
