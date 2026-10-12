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
export async function encodeImage(blob, format) {
  const spec = FORMATS[format];
  if (!spec) throw new Error('Unsupported output format.');
  if (blob.size > MAX_BYTES) throw new Error('Image exceeds the 32 MB input limit.');
  const source = URL.createObjectURL(blob);
  const image = new Image();
  let canvas;
  try {
    image.src = source;
    await Promise.race([image.decode(), new Promise((_, reject) => {
      image._timer = setTimeout(() => reject(new Error('Image decoding timed out.')), 20000);
    })]);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image is empty or unsupported.');
    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('Image exceeds the 40 megapixel limit.');
    canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    if (format === 'jpg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0);
    const output = await new Promise(resolve => canvas.toBlob(resolve, spec.mime, spec.quality));
    if (!output || output.type !== spec.mime) throw new Error('Chrome could not encode the selected format.');
    return output;
  } finally {
    clearTimeout(image._timer);
    URL.revokeObjectURL(source);
    image.src = '';
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
