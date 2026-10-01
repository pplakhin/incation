// До/после: удержание кнопки показывает исходник, шторка делит кадр.
export function setupCompare({ holdBtn, splitBtn, line, frame, state, render }) {
  const hold = (on) => {
    state.view = on ? 1 : 0;
    render();
  };
  holdBtn.addEventListener('pointerdown', (e) => {
    holdBtn.setPointerCapture(e.pointerId);
    hold(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    holdBtn.addEventListener(ev, () => state.view && hold(false));
  }
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  holdBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
  holdBtn.addEventListener('keyup', () => hold(false));

  const place = () => { line.style.left = `${state.split * 100}%`; };
  const setSplit = (on) => {
    state.split = on ? 0.5 : -1;
    splitBtn.setAttribute('aria-pressed', on);
    line.hidden = !on;
    place();
    render();
  };
  splitBtn.addEventListener('click', () => setSplit(state.split < 0));

  const move = (e) => {
    const r = frame.getBoundingClientRect();
    state.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    place();
    render();
  };
  line.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    line.setPointerCapture(e.pointerId);
    line.addEventListener('pointermove', move);
  });
  line.addEventListener('pointerup', () => line.removeEventListener('pointermove', move));
  line.addEventListener('pointercancel', () => line.removeEventListener('pointermove', move));

  return { setSplit };
}
