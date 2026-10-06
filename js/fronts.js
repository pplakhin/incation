// Ползунок положения фронта на краю изображения: для вертикального фронта —
// вдоль нижнего края, для горизонтального — вдоль левого. Виден только активный.

export function setupFronts({ frame, ctx }) {
  const axes = [
    { key: 'frontX', mode: 'v', cls: 'fx', label: 'Положение вертикального фронта', horizontal: true },
    { key: 'frontY', mode: 'h', cls: 'fy', label: 'Положение горизонтального фронта', horizontal: false },
  ].map((a) => {
    const track = document.createElement('div');
    track.className = `axis ${a.cls}`;
    const knob = document.createElement('span');
    knob.className = 'axis-knob';
    knob.tabIndex = 0;
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', a.label);
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', '100');
    track.append(knob);
    const guide = document.createElement('div');
    guide.className = `axis-guide ${a.cls}`;
    guide.hidden = true;
    frame.append(track, guide);
    return { ...a, track, knob, guide };
  });

  const value = (a) => ctx.params[a.key];

  function paint() {
    // место под ползунок резервируется только у того края, где он виден
    frame.parentElement.classList.toggle('front-h', ctx.params.frontMode === 'h');
    for (const a of axes) {
      const v = value(a);
      const pos = `${v * 100}%`;
      a.knob.style[a.horizontal ? 'left' : 'top'] = pos;
      a.guide.style[a.horizontal ? 'left' : 'top'] = pos;
      a.track.hidden = (ctx.params.frontMode === 'h' ? 'h' : 'v') !== a.mode;
      a.knob.setAttribute('aria-valuenow', Math.round(v * 100));
      a.knob.title = a.label;
    }
  }

  function set(a, v) {
    v = Math.min(1, Math.max(0, v));
    ctx.set(a.key, Math.round(v * 1000) / 1000);
    paint();
  }

  for (const a of axes) {
    const fromEvent = (e) => {
      const r = a.track.getBoundingClientRect();
      return a.horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    };
    const move = (e) => set(a, fromEvent(e));
    const end = () => {
      a.track.removeEventListener('pointermove', move);
      a.guide.hidden = true;
      a.track.classList.remove('drag');
      ctx.commit();
    };
    a.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      a.track.setPointerCapture(e.pointerId);
      a.track.addEventListener('pointermove', move);
      a.guide.hidden = false;
      a.track.classList.add('drag');
      a.knob.focus({ preventScroll: true });
      move(e);
    });
    a.track.addEventListener('pointerup', end);
    a.track.addEventListener('pointercancel', end);
    a.knob.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.01;
      // по вертикали значение растёт вниз (ось y экрана)
      const keys = a.horizontal
        ? { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
        : { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      set(a, value(a) + keys[e.key] * step);
      ctx.commit();
    });
  }

  paint();
  return { refresh: paint };
}
