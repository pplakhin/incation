// Ползунки фронта по краям изображения: X — вдоль нижнего края (вертикальная грань),
// Y — вдоль левого (горизонтальная). Крайнее положение со стороны бумаги выключает грань.
const OFF = { frontX: 1, frontY: 0 };
const SNAP = 0.03; // у края грань выключается

export function setupFronts({ frame, ctx }) {
  const axes = [
    { key: 'frontX', cls: 'fx', label: 'Положение фронта по горизонтали', horizontal: true },
    { key: 'frontY', cls: 'fy', label: 'Положение фронта по вертикали', horizontal: false },
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
  const isOff = (a, v) => Math.abs(v - OFF[a.key]) < 1e-6;

  function paint() {
    for (const a of axes) {
      const v = value(a);
      const pos = `${v * 100}%`;
      a.knob.style[a.horizontal ? 'left' : 'top'] = pos;
      a.guide.style[a.horizontal ? 'left' : 'top'] = pos;
      a.track.classList.toggle('off', isOff(a, v));
      a.knob.setAttribute('aria-valuenow', Math.round(v * 100));
      a.knob.setAttribute('aria-valuetext', isOff(a, v) ? 'выключено' : `${Math.round(v * 100)}%`);
      a.knob.title = isOff(a, v) ? 'Грань выключена — потяните, чтобы включить' : a.label;
    }
  }

  function set(a, v) {
    v = Math.min(1, Math.max(0, v));
    if (Math.abs(v - OFF[a.key]) < SNAP) v = OFF[a.key];
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
