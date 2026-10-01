// Экспорт PNG в полном разрешении исходника с честными ограничениями платформы.
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Лимиты холста: Safari на iOS не создаёт canvas больше ~16,7 Мп,
// на остальных мобильных держимся того же ради памяти.
export function exportSize(w, h) {
  const mobile = isTouch() || isIOS();
  const maxArea = mobile ? 16_777_216 : 33_554_432;
  const maxSide = mobile ? 8192 : 12288;
  const s = Math.min(1, Math.sqrt(maxArea / (w * h)), maxSide / Math.max(w, h));
  return {
    w: Math.max(1, Math.floor(w * s)),
    h: Math.max(1, Math.floor(h * s)),
    reduced: s < 1,
  };
}

export async function renderPNG(renderer, params, W, H) {
  const px = renderer.renderPixels(params, W, H);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
  const blob = await new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  c.width = c.height = 0; // сразу освобождаем память (важно на iOS)
  return blob;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}
