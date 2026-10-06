// Панель в виде акварельной палитры: кюветы-пресеты, три раздела-кюветы,
// в каждом — две-три настройки. Сверху — выбор фронта.
import { PRESETS } from './presets.js';

const pct = (d = 0) => (v) => `${(v * 100).toFixed(d)}%`;
const num = (d = 2) => (v) => (+v).toFixed(d);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

let uid = 0;

export function buildUI(root, ctx) {
  const updaters = [];
  const P = () => ctx.params;

  function range(key, label, min, max, step, fmt) {
    const id = `c${uid++}`;
    const input = el('input', { type: 'range', id, min, max, step });
    const out = el('output', { for: id });
    const paint = () => {
      const v = +input.value;
      out.textContent = fmt(v);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
    };
    input.addEventListener('input', () => { paint(); ctx.set(key, +input.value); });
    input.addEventListener('change', () => ctx.commit());
    updaters.push(() => { input.value = P()[key]; paint(); });
    return el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', { for: id }, label), out), input);
  }

  // три цвета пигментов — круглые кюветы
  function pigmentWells() {
    const box = el('div', { class: 'wells' });
    const inputs = [0, 1, 2].map((i) => {
      const input = el('input', { type: 'color', 'aria-label': `Пигмент ${i + 1}` });
      input.addEventListener('input', () => {
        const arr = structuredClone(P().pigments);
        if (!arr[i]) return;
        arr[i].color = input.value;
        ctx.setPigments(arr);
      });
      input.addEventListener('change', () => ctx.commit());
      box.append(el('label', { class: 'well' }, input));
      return input;
    });
    updaters.push(() => inputs.forEach((inp, i) => {
      const pg = P().pigments[i];
      inp.parentElement.hidden = !pg;
      if (pg) {
        inp.value = pg.color.toLowerCase();
        inp.parentElement.style.setProperty('--c', pg.color);
      }
    }));
    return el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', {}, 'Цвета пигментов')), box);
  }

  // --- фронт: ориентация и сторона эффекта; положение — ползунком на краю изображения ---
  const icon = (d) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = d;
    return svg;
  };
  const ICON = {
    v: '<rect x="2" y="3" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="3" width="9" height="14" rx="2" fill="currentColor" opacity=".35"/><path d="M11 3v14" stroke="currentColor" stroke-width="2"/>',
    h: '<rect x="2" y="3" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="9" width="16" height="8" rx="2" fill="currentColor" opacity=".35"/><path d="M2 9h16" stroke="currentColor" stroke-width="2"/>',
  };
  function seg(items, small) {
    const box = el('div', { class: small ? 'seg small' : 'seg', role: 'radiogroup' });
    const btns = items.map((it) => {
      const b = el('button', { type: 'button', role: 'radio', title: it.title, onclick: () => { it.pick(); ctx.commit(); } },
        it.icon ? icon(it.icon) : null, el('span', {}, it.label));
      box.append(b);
      return b;
    });
    updaters.push(() => items.forEach((it, i) => {
      const on = it.active();
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-checked', on);
      if (it.text) btns[i].lastChild.textContent = it.text();
    }));
    return box;
  }
  const isH = () => P().frontMode === 'h';
  const sideKey = () => (isH() ? 'sideY' : 'sideX');
  const front = el('div', { class: 'front', 'aria-label': 'Фронт' },
    seg([
      { label: 'Вертикальное', icon: ICON.v, title: 'Вертикальный фронт: эффект слева или справа', active: () => !isH(), pick: () => ctx.set('frontMode', 'v') },
      { label: 'Горизонтальное', icon: ICON.h, title: 'Горизонтальный фронт: эффект сверху или снизу', active: isH, pick: () => ctx.set('frontMode', 'h') },
    ]),
    seg([
      // sideX: 1 — слева; sideY: −1 — сверху
      { label: '', text: () => (isH() ? 'Эффект сверху' : 'Эффект слева'), active: () => P()[sideKey()] === (isH() ? -1 : 1), pick: () => ctx.set(sideKey(), isH() ? -1 : 1) },
      { label: '', text: () => (isH() ? 'Эффект снизу' : 'Эффект справа'), active: () => P()[sideKey()] === (isH() ? 1 : -1), pick: () => ctx.set(sideKey(), isH() ? 1 : -1) },
    ], true),
  );

  // --- пресеты-кюветы с миниатюрами ---
  const presetBox = el('div', { class: 'pans', role: 'group', 'aria-label': 'Пресеты' });
  const thumbs = {};
  for (const pr of PRESETS) {
    const img = el('canvas', { class: 'pan-swatch', width: 1, height: 1 });
    thumbs[pr.id] = img;
    const b = el('button', { type: 'button', class: 'pan', title: pr.name, onclick: () => { ctx.applyPreset(pr.id); refresh(); } },
      img, el('span', {}, pr.name));
    b.dataset.id = pr.id;
    presetBox.append(b);
  }
  updaters.push(() => presetBox.querySelectorAll('.pan').forEach((b) => b.classList.toggle('active', b.dataset.id === ctx.presetId)));

  // --- разделы: «кюветы» с тремя настройками ---
  const sections = [
    {
      id: 'source', name: 'Исходное изображение', short: 'Изображение', color: '#E9B949',
      body: [
        range('darken', 'Затемнение эффектом', 0, 1, 0.01, pct(0)),
        range('blur', 'Размытие', 0, 1, 0.01, num(2)),
      ],
    },
    {
      id: 'edge', name: 'Кромка и гребешки', short: 'Кромка', color: '#1340D0',
      body: [
        range('lobeAmp', 'Высота гребешков', 0, 0.1, 0.001, pct(1)),
        range('lobeFreq', 'Частота гребешков', 1, 30, 0.1, num(1)),
        range('edge', 'Затемнение кромки', 0, 5, 0.01, num(2)),
      ],
    },
    {
      id: 'band', name: 'Кайма и пигменты', short: 'Кайма', color: '#DE2F7E',
      body: [
        range('bandWidth', 'Ширина каймы', 0.02, 0.35, 0.001, pct(1)),
        range('pigmentStrength', 'Насыщенность', 0.2, 1.8, 0.01, num(2)),
        pigmentWells(),
      ],
    },
  ];
  let current = sections[0].id;
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const bodies = el('div', { class: 'tab-body' });
  for (const s of sections) {
    const tab = el('button', { type: 'button', class: 'tab', role: 'tab', title: s.name, onclick: () => { current = s.id; refresh(); } },
      el('i', { style: `--c:${s.color}` }), el('span', {}, s.short));
    const body = el('div', { role: 'tabpanel', 'aria-label': s.name }, el('h2', {}, s.name), ...s.body);
    tabs.append(tab);
    bodies.append(body);
    updaters.push(() => {
      tab.classList.toggle('active', current === s.id);
      tab.setAttribute('aria-selected', current === s.id);
      body.hidden = current !== s.id;
    });
  }

  root.append(
    front,
    presetBox,
    tabs,
    bodies,
    el('div', { class: 'foot' },
      el('button', { type: 'button', class: 'link', onclick: () => { ctx.reset(); refresh(); } }, 'Сбросить'),
      el('span', {}, 'Фото не покидают устройство')),
  );

  function refresh() { for (const u of updaters) u(); }
  refresh();
  return { refresh, thumbs };
}
