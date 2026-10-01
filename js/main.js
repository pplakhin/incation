import { Renderer } from './renderer.js';
import { DEFAULTS, PRESETS, presetParams } from './presets.js';
import { makeSample } from './sample.js';
import { buildUI } from './ui.js';
import { setupCompare } from './compare.js';
import { exportSize, renderPNG, download, canShareFile, isTouch, isIOS } from './export.js';

const $ = (id) => document.getElementById(id);
const STORE = 'incation:v2';

const canvas = $('view');
const stage = $('stage');
const frame = $('frame');

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
    state.params = Object.assign(structuredClone(DEFAULTS), saved.params, { maskMode: 'line' });
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
}

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
    createRenderer();
    drawThumbs();
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

// ---------- миниатюры пресетов в кюветах ----------
function drawThumbs() {
  if (!renderer || !state.source || !ui) return;
  const L = 112;
  const s = L / Math.max(state.srcW, state.srcH);
  const w = Math.max(1, Math.round(state.srcW * s)), h = Math.max(1, Math.round(state.srcH * s));
  for (const pr of PRESETS) {
    const c = ui.thumbs[pr.id];
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(new ImageData(renderer.renderPixels(presetParams(pr.id), w, h), w, h), 0, 0);
  }
}

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
  drawThumbs();
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

// ---------- панель ----------
let ui;
const ctx = {
  get params() { return state.params; },
  get presetId() { return state.presetId; },
  set(key, value) {
    state.params[key] = value;
    state.presetId = null;
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
    state.params = presetParams(id);
    state.presetId = id;
    persist();
    requestRender();
  },
  reset() {
    state.params = presetParams(PRESETS[0].id);
    state.presetId = PRESETS[0].id;
    persist();
    requestRender();
  },
};
ui = buildUI($('panel-body'), ctx);

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
