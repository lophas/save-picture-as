import { FORMATS, MAX_BYTES, MAX_PIXELS, dispositionName } from './shared.js';

export async function fetchImage(source) {
  let response;
  // Public CDNs often send ACAO: *. Try without credentials before auth.
  try {
    response = await fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
  } catch (error) {
    if (error.name !== 'TypeError' || !/^https?:/i.test(source)) throw error;
  }
  if (!response || [401, 403].includes(response.status)) {
    response = await fetch(source, { credentials: 'include', signal: AbortSignal.timeout(20000) });
  }
  if (!response.ok) throw new Error(`Image request failed (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image exceeds the 32 MB input limit.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Image exceeds the 32 MB input limit.'); }
    chunks.push(value);
  }
  return { blob: new Blob(chunks, { type: response.headers.get('content-type') || '' }), name: dispositionName(response.headers.get('content-disposition') || '') };
}
async function decodeImage(blob) {
  if (blob.type.split(';')[0] !== 'image/svg+xml') {
    let timer;
    let expired = false;
    const decoding = createImageBitmap(blob).then(bitmap => {
      if (expired) { bitmap.close(); throw new Error('Image decoding timed out.'); }
      return bitmap;
    });
    try {
      return await Promise.race([decoding, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error('Image decoding timed out.')); }, 20000);
      })]);
    } finally { clearTimeout(timer); }
  }
  // SVG needs the image loader; onload does not wait for a visible render frame.
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timer;
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Cannot decode this SVG image.'));
      timer = setTimeout(() => reject(new Error('SVG loading timed out.')), 20000);
      image.src = url;
    });
    return {
      image, width: image.naturalWidth, height: image.naturalHeight,
      close() { image.src = ''; }
    };
  } catch (error) { image.src = ''; throw error; }
  finally {
    clearTimeout(timer);
    image.onload = image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

export async function encodeImage(blob, format) {
  const spec = FORMATS[format];
  if (!spec) throw new Error('Unsupported output format.');
  if (blob.size > MAX_BYTES) throw new Error('Image exceeds the 32 MB input limit.');
  let decoded;
  let canvas;
  try {
    decoded = await decodeImage(blob);
    const { width, height } = decoded;
    if (!width || !height) throw new Error('This image is empty or unsupported.');
    if (width * height > MAX_PIXELS) throw new Error('Image exceeds the 40 megapixel limit.');
    // Both decoding and encoding must be independent of hidden-document rendering.
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    if (format === 'jpg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
    context.drawImage(decoded.image || decoded, 0, 0);
    const output = await canvas.convertToBlob({ type: spec.mime, quality: spec.quality });
    if (!output || output.type !== spec.mime) throw new Error('Chrome could not encode the selected format.');
    return output;
  } finally {
    decoded?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
