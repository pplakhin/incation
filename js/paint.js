// Маска, нарисованная вручную: белое — зона чернил, чёрное — чистая бумага.
const RES = 768;

export class PaintMask {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tool = 'brush';
    this.size = 0.06; // доля длинной стороны
    this.version = 0;
  }

  resize(w, h) {
    const s = RES / Math.max(w, h);
    this.canvas.width = Math.max(8, Math.round(w * s));
    this.canvas.height = Math.max(8, Math.round(h * s));
    this.version++;
  }

  // то же, что маска «Линия» в шейдере (без шумов — их добавит шейдер)
  fromLine(angle, position) {
    const { g, canvas } = this;
    const W = canvas.width, H = canvas.height, L = Math.max(W, H);
    const a = (angle * Math.PI) / 180;
    const dx = Math.cos(a), dy = -Math.sin(a);
    const ext = 0.5 * (Math.abs(dx) * W + Math.abs(dy) * H);
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = '#fff';
    g.fillRect(-4 * L, -4 * L, 4 * L + (position * 2 - 1) * ext, 8 * L);
    g.restore();
    this.version++;
  }

  fromLuma(source, threshold, invert) {
    const { g, canvas } = this;
    const W = canvas.width, H = canvas.height;
    // размытие через уменьшение: ctx.filter есть не во всех браузерах
    const small = document.createElement('canvas');
    small.width = Math.max(4, Math.round(W / 10));
    small.height = Math.max(4, Math.round(H / 10));
    const sg = small.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(source, 0, 0, small.width, small.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (!invert) l = 1 - l;
      const v = l >= threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.touched = true;
    this.version++;
  }

  clear() {
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.touched = true;
    this.version++;
  }

  // u, v — доли ширины/высоты изображения
  stroke(u0, v0, u1, v1) {
    const { g, canvas } = this;
    const W = canvas.width, H = canvas.height;
    g.strokeStyle = g.fillStyle = this.tool === 'erase' ? '#000' : '#fff';
    g.lineWidth = this.size * Math.max(W, H);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(u0 * W, v0 * H);
    g.lineTo(u1 * W, v1 * H);
    g.stroke();
    this.touched = true;
    this.version++;
  }
}
