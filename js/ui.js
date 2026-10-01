// Панель параметров: секции, слайдеры, палитра пигментов.
import { PRESETS } from './presets.js';
import { MAX_PIGMENTS } from './shaders/compose.js';

const pct = (d = 0) => (v) => `${(v * 100).toFixed(d)}%`;
const num = (d = 2) => (v) => (+v).toFixed(d);
const deg = (v) => `${Math.round(v)}°`;

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

  function range(key, label, min, max, step, fmt = num(2)) {
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

  function seg(key, options, onPick) {
    const box = el('div', { class: 'seg', role: 'group' });
    const btns = options.map(([value, text]) => {
      const b = el('button', { type: 'button', onclick: () => { ctx.set(key, value); ctx.commit(); onPick?.(value); refresh(); } }, text);
      box.append(b);
      return [value, b];
    });
    updaters.push(() => btns.forEach(([v, b]) => b.classList.toggle('active', P()[key] === v)));
    return box;
  }

  function check(key, label) {
    const input = el('input', { type: 'checkbox' });
    input.addEventListener('change', () => { ctx.set(key, input.checked); ctx.commit(); });
    updaters.push(() => { input.checked = !!P()[key]; });
    return el('label', { class: 'check' }, input, label);
  }

  function color(key, label) {
    const input = el('input', { type: 'color', 'aria-label': label });
    input.addEventListener('input', () => ctx.set(key, input.value));
    input.addEventListener('change', () => ctx.commit());
    updaters.push(() => { input.value = P()[key].toLowerCase(); });
    return el('label', { class: 'color-field' }, input, label);
  }

  function section(title, open, ...children) {
    const d = el('details', { class: 'sec' }, el('summary', {}, title), el('div', { class: 'sec-body' }, ...children));
    if (open) d.open = true;
    return d;
  }

  function when(pred, node) {
    updaters.push(() => { node.hidden = !pred(P()); });
    return node;
  }

  // --- пресеты ---
  const presetBox = el('div', { class: 'presets' });
  for (const pr of PRESETS) {
    const b = el('button', { type: 'button', class: 'chip', onclick: () => { ctx.applyPreset(pr.id); refresh(); } },
      el('span', { class: 'sw' }), pr.name);
    b.dataset.id = pr.id;
    presetBox.append(b);
  }
  updaters.push(() => presetBox.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.id === ctx.presetId)));

  // --- палитра пигментов ---
  const pigBox = el('div');
  function renderPigments() {
    pigBox.textContent = '';
    const pigs = P().pigments;
    pigs.forEach((pg, i) => {
      const upd = (k, v) => { const arr = structuredClone(P().pigments); arr[i][k] = v; ctx.setPigments(arr); };
      const swap = (j) => {
        // порядок = какой цвет уходит дальше всех; дистанции остаются на местах
        const arr = structuredClone(P().pigments);
        if (j < 0 || j >= arr.length) return;
        for (const k of ['color', 'strength']) [arr[i][k], arr[j][k]] = [arr[j][k], arr[i][k]];
        ctx.setPigments(arr); ctx.commit(); renderPigments();
      };
      const col = el('input', { type: 'color', value: pg.color.toLowerCase(), 'aria-label': `Цвет пигмента ${i + 1}` });
      col.addEventListener('input', () => upd('color', col.value));
      col.addEventListener('change', () => ctx.commit());
      const slider = (k, label, min, max, step, fmt) => {
        const input = el('input', { type: 'range', min, max, step, value: pg[k], 'aria-label': label });
        const out = el('output', {}, fmt(pg[k]));
        const paint = () => { out.textContent = fmt(+input.value); input.style.setProperty('--p', `${((+input.value - min) / (max - min)) * 100}%`); };
        paint();
        input.addEventListener('input', () => { paint(); upd(k, +input.value); });
        input.addEventListener('change', () => ctx.commit());
        return el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', {}, label), out), input);
      };
      const head = el('div', { class: 'pigment-head' }, col,
        el('span', { class: 'name' }, i === 0 ? 'У кромки' : `Пигмент ${i + 1}`),
        el('button', { type: 'button', class: 'btn', title: 'Ближе к кромке', onclick: () => swap(i - 1), disabled: i === 0 ? '' : null }, '↑'),
        el('button', { type: 'button', class: 'btn', title: 'Дальше от кромки', onclick: () => swap(i + 1), disabled: i === pigs.length - 1 ? '' : null }, '↓'),
        el('button', {
          type: 'button', class: 'btn', title: 'Удалить', disabled: pigs.length <= 1 ? '' : null,
          onclick: () => { const arr = structuredClone(P().pigments); arr.splice(i, 1); ctx.setPigments(arr); ctx.commit(); renderPigments(); },
        }, '×'));
      pigBox.append(el('div', { class: 'pigment' }, head,
        slider('strength', 'Сила', 0, 2, 0.01, num(2)),
        slider('pos', 'Дистанция от кромки', 0, 3, 0.01, num(2)),
        slider('width', 'Длина следа', 0.05, 3, 0.01, num(2)),
        slider('soft', 'Мягкость перехода', 0.01, 1, 0.01, num(2))));
    });
    if (pigs.length < MAX_PIGMENTS) {
      pigBox.append(el('div', { class: 'btn-row' }, el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const arr = structuredClone(P().pigments);
          const last = arr[arr.length - 1];
          arr.push({ color: '#F28A5B', pos: last.pos + 0.3, width: 0.4, strength: 0.7, soft: 0.3 });
          ctx.setPigments(arr); ctx.commit(); renderPigments();
        },
      }, '+ Пигмент')));
    }
  }
  updaters.push(renderPigments);

  // --- рисование маски ---
  const paintTools = el('div', {},
    el('div', { class: 'seg', role: 'group' },
      ...[['brush', 'Кисть'], ['erase', 'Ластик']].map(([v, t]) => {
        const b = el('button', { type: 'button', onclick: () => { ctx.paint.tool = v; refresh(); } }, t);
        updaters.push(() => b.classList.toggle('active', ctx.paint.tool === v));
        return b;
      })),
    (() => {
      const input = el('input', { type: 'range', min: 0.01, max: 0.25, step: 0.005, 'aria-label': 'Размер кисти' });
      const out = el('output');
      const paint = () => { out.textContent = pct(0)(+input.value); input.style.setProperty('--p', `${((+input.value - 0.01) / 0.24) * 100}%`); };
      input.addEventListener('input', () => { ctx.paint.size = +input.value; paint(); });
      updaters.push(() => { input.value = ctx.paint.size; paint(); });
      return el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', {}, 'Размер кисти'), out), input);
    })(),
    el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn', onclick: () => ctx.paint.fromLine() }, 'Как линия'),
      el('button', { type: 'button', class: 'btn', onclick: () => ctx.paint.fromLuma() }, 'Из яркости'),
      el('button', { type: 'button', class: 'btn', onclick: () => ctx.paint.clear() }, 'Очистить')),
    el('p', { class: 'note' }, 'Кистью закрашивается зона, куда впитались чернила. Проведите по превью.'));

  // --- сборка ---
  root.append(
    presetBox,
    section('Маска фронта', true,
      seg('maskMode', [['line', 'Линия'], ['luma', 'Яркость'], ['paint', 'Рисунок']]),
      range('angle', 'Направление фронта', 0, 360, 1, deg),
      when((p) => p.maskMode === 'line', range('position', 'Положение фронта', 0.05, 1, 0.005, pct(1))),
      range('meander', 'Крупная волна', 0, 0.12, 0.001, pct(1)),
      when((p) => p.maskMode === 'luma', el('div', {},
        range('threshold', 'Порог яркости', 0, 1, 0.005, num(2)),
        range('softness', 'Сглаживание', 0, 0.3, 0.005, num(2)),
        check('invert', 'Чернила в светлых зонах'))),
      when((p) => p.maskMode === 'paint', paintTools)),
    section('Кромка и гребешки', false,
      range('lobeAmp', 'Амплитуда гребешков', 0, 0.1, 0.001, pct(1)),
      range('lobeFreq', 'Частота гребешков', 1, 30, 0.1, num(1)),
      range('rough', 'Рваность кромки', 0, 0.025, 0.0005, pct(2)),
      range('roughFreq', 'Мелкость рваности', 15, 250, 1, num(0)),
      range('edge', 'Затемнение кромки', 0, 5, 0.01, num(2)),
      range('edgeWidth', 'Толщина тёмной кромки', 0.0005, 0.03, 0.0005, pct(2)),
      range('pocket', 'Карманы под гребешками', 0, 1, 0.01, num(2)),
      el('div', { class: 'colors' }, color('edgeColor', 'Цвет кромки'))),
    section('Кайма и пигменты', false,
      range('bandWidth', 'Ширина каймы', 0.02, 0.35, 0.001, pct(1)),
      range('chroma', 'Смещение каналов', 0, 0.2, 0.001, num(3)),
      range('residual', 'Остаток пигмента', 0, 0.4, 0.005, num(2)),
      seg('mode', [['subtractive', 'Смешение пигментов'], ['gradient', 'Градиент']]),
      pigBox),
    section('Интерьер', false,
      range('blur', 'Размытие исходника', 0, 1, 0.01, num(2)),
      range('smear', 'Растекание к фронту', 0, 0.6, 0.005, pct(0)),
      range('lanes', 'Полосы-дорожки', 0, 1, 0.01, num(2)),
      range('laneFreq', 'Частота дорожек', 1, 20, 0.1, num(1)),
      range('interior', 'Плотность цвета', 0, 1.5, 0.01, num(2)),
      range('blotch', 'Пятна', 0, 1, 0.01, num(2))),
    section('Пастель', false,
      range('white', 'Уровень белого', 0, 0.95, 0.01, num(2)),
      range('saturation', 'Насыщенность', 0, 2, 0.01, num(2)),
      range('paletteShift', 'Сдвиг к палитре', 0, 1, 0.01, num(2)),
      el('div', { class: 'colors' },
        color('interiorC', 'Синий'), color('interiorM', 'Розовый'),
        color('interiorY', 'Жёлтый'), color('interiorK', 'Серый'))),
    section('Бумага', false,
      range('grain', 'Зерно', 0, 1.5, 0.01, num(2)),
      range('granulation', 'Грануляция', 0, 1.5, 0.01, num(2)),
      range('grainScale', 'Мелкость зерна', 120, 1000, 5, num(0)),
      el('div', { class: 'colors' }, color('paper', 'Бумага'))),
    section('Шум', false,
      (() => {
        const input = el('input', { type: 'number', min: 0, max: 99999, step: 1, 'aria-label': 'Seed', inputmode: 'numeric' });
        input.addEventListener('change', () => { ctx.set('seed', Math.max(0, Math.round(+input.value || 0))); ctx.commit(); });
        updaters.push(() => { input.value = P().seed; });
        return el('div', { class: 'seed-row' }, el('span', {}, 'Seed'), input,
          el('button', { type: 'button', class: 'btn', onclick: () => { ctx.randomSeed(); refresh(); } }, '🎲 Случайно'));
      })()),
    el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn', onclick: () => { ctx.reset(); refresh(); } }, 'Сбросить настройки')),
    el('p', { class: 'privacy' }, 'Обработка идёт на вашем устройстве. Изображения никуда не отправляются.'),
  );

  function refresh() { for (const u of updaters) u(); }
  refresh();
  return { refresh };
}
