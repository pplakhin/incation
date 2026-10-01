// Процедурная демо-картинка: закат, горы, поле с цветами.
export function makeSample(w = 1200, h = 1600) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#3d6fd6');
  sky.addColorStop(0.45, '#e58fb6');
  sky.addColorStop(1, '#ffd479');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const sun = g.createRadialGradient(w * 0.62, h * 0.4, 0, w * 0.62, h * 0.4, w * 0.2);
  sun.addColorStop(0, '#fff6c8');
  sun.addColorStop(0.45, '#ffc93c');
  sun.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);

  const ridge = (base, amp, col, seed) => {
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.017 + seed * 2) * amp * 0.4;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = col;
    g.fill();
  };
  ridge(h * 0.5, h * 0.05, '#7a6fc4', 1.3);
  ridge(h * 0.56, h * 0.04, '#4b4aa0', 2.7);
  ridge(h * 0.63, h * 0.025, '#2f8a6a', 0.4);

  const field = g.createLinearGradient(0, h * 0.63, 0, h);
  field.addColorStop(0, '#3fa36e');
  field.addColorStop(1, '#1f5c45');
  g.fillStyle = field;
  g.fillRect(0, h * 0.66, w, h);

  const petals = ['#e8325a', '#ff7aa8', '#ffcf33', '#ffffff', '#b23ad6'];
  for (let i = 0; i < 260; i++) {
    const y = h * 0.66 + rnd() ** 0.8 * h * 0.34;
    const x = rnd() * w;
    const r = 6 + (y - h * 0.6) * 0.05 * rnd();
    g.fillStyle = petals[Math.floor(rnd() * petals.length)];
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
