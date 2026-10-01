import { Renderer } from './renderer.js';
import { DEFAULTS, PRESETS, presetParams } from './presets.js';
import { makeSample } from './sample.js';
import { buildUI } from './ui.js';
import { PaintMask } from './paint.js';
import { setupCompare } from './compare.js';
import { exportSize, renderPNG, download, canShareFile, isTouch, isIOS } from './export.js';

const $ = (id) => document.getElementById(id);
const STORE = 'incation:v1';

const canvas = $('view');
const stage = $('stage');
const frame = $('frame');
const panel = $('panel');

const state = {
  params: presetParams(PRESETS[0].id),
  presetId: PRESETS[0].id,
  view: 0,
  split: -1,
  srcW: 0,
  srcH: 0,
  source: null, // canvas превью исходника
  name: 'incation',
};

// ---------- уведомления ----------
let toastTimer;
function toast(text, ms = 2600) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- сохранённые настройки ----------
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && saved.params) {
    state.params = Object.assign(structuredClone(DEFAULTS), saved.params);
    state.presetId = saved.presetId ?? null;
  }
} catch { /* приватный режим или повреждённые данные — берём значения по умолчанию */ }

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ params: state.params, presetId: state.presetId }));
  } catch { /* хранилище недоступно */ }
}

// ---------- рендер ----------
let renderer;
function createRenderer() {
  renderer = new Renderer(canvas);
  if (state.source) renderer.setSource(state.source);
  renderer.setPaint(paint.canvas);
}

const paint = new PaintMask();
try {
  createRenderer();
} catch (e) {
  console.error(e);
  $('nogl').hidden = false;
  throw e;
}

let raf = 0;
function requestRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!renderer || !state.source) return;
    if (paint.version !== paint.uploaded) {
      renderer.setPaint(paint.canvas);
      paint.uploaded = paint.version;
    }
    renderer.render(state.params, { view: state.view, split: state.split });
  });
}

// потеря контекста (iOS при сворачивании, перегрузка GPU)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer = null;
});
canvas.addEventListener('webglcontextrestored', () => {
  try {
    paint.uploaded = -1;
    createRenderer();
    requestRender();
  } catch (e) {
    console.error(e);
    toast('Не удалось восстановить WebGL. Перезагрузите страницу.', 0);
  }
});

// ---------- размер превью ----------
function layout() {
  if (!state.srcW) return;
  const cs = getComputedStyle(stage);
  const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (aw <= 0 || ah <= 0) return;
  const ar = state.srcW / state.srcH;
  let w = aw, h = aw / ar;
  if (h > ah) { h = ah; w = ah * ar; }
  frame.style.width = `${Math.round(w)}px`;
  frame.style.height = `${Math.round(h)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  const cap = isTouch() ? 1400 : 2200;
  const k = Math.min(1, cap / Math.max(cw, ch));
  cw = Math.max(1, Math.round(cw * k));
  ch = Math.max(1, Math.round(ch * k));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  requestRender();
}
new ResizeObserver(layout).observe(stage);

// ---------- загрузка изображения ----------
async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function setSource(img, w, h, name) {
  const max = isTouch() ? 1024 : 1600;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; // прозрачность PNG ложится на белое
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  state.source = c;
  state.srcW = w;
  state.srcH = h;
  state.name = name;
  if (renderer) renderer.setSource(c);
  paint.resize(w, h);
  paint.fromLine(state.params.angle, state.params.position);
  layout();
}

async function openFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    toast('Это не изображение.');
    return;
  }
  toast('Открываю…', 0);
  try {
    const img = await decode(file);
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    setSource(img, img.naturalWidth, img.naturalHeight, `${base}-incation`);
    toast(`Загружено: ${img.naturalWidth}×${img.naturalHeight}`);
  } catch (e) {
    console.error(e);
    toast('Не удалось открыть файл. Подходят JPEG, PNG, WebP; HEIC открывается только в Safari.', 5000);
  }
}

$('file').addEventListener('change', (e) => {
  openFile(e.target.files[0]);
  e.target.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  $('drop').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  openFile([...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')));
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) openFile(item.getAsFile());
});

// ---------- рисование маски ----------
paint.uploaded = -1;
let last = null;
const brush = $('brush');
function frameUV(e) {
  const r = frame.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
function showBrush(e) {
  const on = state.params.maskMode === 'paint' && e.pointerType === 'mouse';
  brush.hidden = !on;
  if (!on) return;
  const r = frame.getBoundingClientRect();
  const d = paint.size * Math.max(r.width, r.height);
  brush.style.width = brush.style.height = `${d}px`;
  brush.style.left = `${e.clientX - r.left}px`;
  brush.style.top = `${e.clientY - r.top}px`;
}
frame.addEventListener('pointerdown', (e) => {
  if (state.params.maskMode !== 'paint' || e.button > 0) return;
  frame.setPointerCapture(e.pointerId);
  last = frameUV(e);
  paint.stroke(...last, ...last);
  requestRender();
});
frame.addEventListener('pointermove', (e) => {
  showBrush(e);
  if (!last) return;
  const p = frameUV(e);
  paint.stroke(...last, ...p);
  last = p;
  requestRender();
});
const endStroke = () => { if (last) { last = null; state.presetId = null; persist(); } };
frame.addEventListener('pointerup', endStroke);
frame.addEventListener('pointercancel', endStroke);
frame.addEventListener('pointerleave', () => { brush.hidden = true; });

// ---------- панель ----------
let ui;
const ctx = {
  get params() { return state.params; },
  get presetId() { return state.presetId; },
  set(key, value) {
    state.params[key] = value;
    state.presetId = null;
    // пока пользователь не рисовал, рисунок стартует с текущей линии фронта
    if (key === 'maskMode' && value === 'paint' && !paint.touched) {
      paint.fromLine(state.params.angle, state.params.position);
    }
    requestRender();
  },
  setPigments(arr) {
    state.params.pigments = arr;
    state.presetId = null;
    requestRender();
  },
  commit() {
    persist();
    ui?.refresh();
  },
  applyPreset(id) {
    const mode = state.params.maskMode;
    state.params = presetParams(id);
    // пресет меняет вид, но не отменяет выбранный источник маски
    if (mode !== 'line') state.params.maskMode = mode;
    state.presetId = id;
    persist();
    requestRender();
  },
  randomSeed() {
    state.params.seed = Math.floor(Math.random() * 100000);
    persist();
    requestRender();
  },
  reset() {
    state.params = presetParams(PRESETS[0].id);
    state.presetId = PRESETS[0].id;
    paint.fromLine(state.params.angle, state.params.position);
    persist();
    requestRender();
  },
  paint: {
    get tool() { return paint.tool; },
    set tool(v) { paint.tool = v; },
    get size() { return paint.size; },
    set size(v) { paint.size = v; },
    fromLine() { paint.fromLine(state.params.angle, state.params.position); requestRender(); },
    fromLuma() { paint.fromLuma(state.source, state.params.threshold, state.params.invert); requestRender(); },
    clear() { paint.clear(); requestRender(); },
  },
};
ui = buildUI($('panel-body'), ctx);

// ---------- шторка на телефоне ----------
const SHEET = ['peek', 'half', 'full'];
function setSheet(s) {
  panel.dataset.state = s;
  $('app').dataset.sheet = s;
  panel.style.transform = '';
}
(() => {
  const handle = $('handle');
  let y0 = 0, t0 = 0, base = 0, moved = false, dragging = false;
  const offsetOf = (s) => {
    const H = panel.offsetHeight, vh = window.innerHeight;
    const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek')) || 132;
    return s === 'full' ? 0 : s === 'half' ? H - 0.46 * vh : H - peek;
  };
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    y0 = e.clientY;
    t0 = performance.now();
    base = offsetOf(panel.dataset.state);
    handle.setPointerCapture(e.pointerId);
    panel.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - y0;
    if (Math.abs(dy) > 6) moved = true;
    if (moved) panel.style.transform = `translateY(${Math.max(0, Math.min(offsetOf('peek'), base + dy))}px)`;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
    const cur = panel.dataset.state;
    if (!moved) {
      setSheet(cur === 'peek' ? 'half' : cur === 'half' ? 'full' : 'half');
      return;
    }
    const dy = e.clientY - y0;
    const v = dy / Math.max(1, performance.now() - t0); // px/мс
    const pos = base + dy;
    let next;
    if (Math.abs(v) > 0.5) {
      const i = SHEET.indexOf(cur) + (v < 0 ? 1 : -1);
      next = SHEET[Math.max(0, Math.min(2, i))];
    } else {
      next = SHEET.reduce((a, s) => (Math.abs(offsetOf(s) - pos) < Math.abs(offsetOf(a) - pos) ? s : a), 'peek');
    }
    setSheet(next);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  // раскрытие секции в свёрнутой шторке поднимает её
  $('panel-body').addEventListener('click', (e) => {
    const sum = e.target.closest('summary');
    if (sum && panel.dataset.state === 'peek' && matchMedia('(max-width: 899px)').matches) {
      if (!sum.parentElement.open) setSheet('half');
      else { e.preventDefault(); setSheet('half'); }
    }
  });
})();

// ---------- до/после ----------
setupCompare({
  holdBtn: $('hold'),
  splitBtn: $('split'),
  line: $('split-line'),
  frame,
  state,
  render: requestRender,
});

// ---------- сохранение ----------
let exporting = false;
$('save').addEventListener('click', async () => {
  if (exporting || !renderer || !state.source) return;
  exporting = true;
  $('save').disabled = true;
  const { w, h, reduced } = exportSize(state.srcW, state.srcH);
  toast(`Готовлю PNG ${w}×${h}…`, 0);
  await new Promise((r) => setTimeout(r, 30));
  try {
    const blob = await renderPNG(renderer, state.params, w, h);
    const name = `${state.name}.png`;
    const note = reduced
      ? `Размер уменьшен до ${w}×${h}: исходник ${state.srcW}×${state.srcH} больше лимита холста этого устройства.`
      : `PNG ${w}×${h}`;
    if (isTouch() || isIOS()) {
      showModal(blob, name, note);
      toast('Готово', 1200);
    } else {
      download(blob, name);
      toast(reduced ? note : `Сохранено: ${name} (${w}×${h})`, reduced ? 6000 : 2600);
    }
  } catch (e) {
    console.error(e);
    toast('Не хватило памяти для экспорта. Попробуйте фото меньшего размера.', 5000);
  } finally {
    exporting = false;
    $('save').disabled = false;
    requestRender();
  }
});

let modalURL;
function showModal(blob, name, note) {
  const file = new File([blob], name, { type: 'image/png' });
  if (modalURL) URL.revokeObjectURL(modalURL);
  modalURL = URL.createObjectURL(blob);
  $('modal-img').src = modalURL;
  $('modal-info').textContent = note;
  const dl = $('modal-download');
  dl.href = modalURL;
  dl.download = name;
  const share = $('modal-share');
  share.hidden = !canShareFile(file);
  share.onclick = async () => {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name !== 'AbortError') toast('Поделиться не получилось — используйте «Скачать PNG».', 4000);
    }
  };
  $('modal').hidden = false;
}
$('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });

// ---------- старт ----------
const sample = makeSample(1200, 1600);
setSource(sample, sample.width, sample.height, 'incation-demo');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}

// для отладки из консоли
window.incation = { state, requestRender, get renderer() { return renderer; } };
