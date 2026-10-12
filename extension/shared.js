export const FORMATS = Object.freeze({
  webp: { mime: 'image/webp', extension: 'webp', label: 'WebP', quality: 0.95 },
  jpg: { mime: 'image/jpeg', extension: 'jpg', label: 'JPG', quality: 0.95 },
  png: { mime: 'image/png', extension: 'png', label: 'PNG' }
});
export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_PIXELS = 40 * 1000 * 1000;

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
export function dispositionName(header = '') {
  const encoded = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encoded) return decode(encoded[1].trim());
  const plain = header.match(/filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]+))/i);
  return plain ? (plain[1] ?? plain[2]).trim().replace(/\\"/g, '"') : '';
}
export function outputFilename(source, format, suggested = '') {
  if (!FORMATS[format]) throw new Error('Unsupported output format');
  let name = suggested;
  if (!name && /^https?:/i.test(source)) {
    const url = new URL(source);
    name = decode(url.pathname.split('/').pop() || '');
    if (!name || !/\.[a-z0-9]{2,5}$/i.test(name)) {
      for (const key of ['filename', 'file', 'name']) {
        const hint = url.searchParams.get(key);
        if (hint && /\.(?:avif|webp|jpe?g|png|gif|svg|bmp|tiff?|ico)$/i.test(hint)) { name = hint; break; }
      }
    }
  }
  name = (name || 'image').normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_');
  name = name.replace(/\.(?:avif|webp|jpe?g|png|gif|svg|bmp|tiff?|ico)$/i, '').replace(/^[. ]+|[. ]+$/g, '') || 'image';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return Array.from(name).slice(0, 150).join('') + '.' + FORMATS[format].extension;
}
