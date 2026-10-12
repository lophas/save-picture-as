import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, outputFilename, dispositionName, MAX_BYTES } from '../extension/shared.js';
import { fetchImage, encodeImage } from '../extension/converter.js';

for (const key of Object.keys(FORMATS)) {
  test(`preserves original name and replaces extension: ${key}`, () => {
    assert.equal(outputFilename('https://cdn.test/photos/%C3%A1rv%C3%ADz.avif?width=500', key), `árvíz.${key}`);
  });
}
test('filename headers, URLs, embedded sources and unsafe names', () => {
  assert.equal(dispositionName("attachment; filename*=UTF-8''%C3%A1rv%C3%ADz.png"), 'árvíz.png');
  assert.equal(dispositionName('inline; filename="cat photo.webp"'), 'cat photo.webp');
  assert.equal(outputFilename('https://test/image?id=1&filename=actual.png', 'jpg'), 'actual.jpg');
  assert.equal(outputFilename('blob:https://test/id', 'png'), 'image.png');
  assert.equal(outputFilename('data:image/png;base64,x', 'webp'), 'image.webp');
  assert.equal(outputFilename('https://test/photo.jpg', 'png', 'header.avif'), 'header.png');
  assert.equal(outputFilename('', 'png', '../CON.png'), '_CON.png');
  assert.equal(outputFilename('', 'png', 'a/b:c.jpg'), 'a_b_c.png');
  assert.throws(() => outputFilename('', 'exe'), /Unsupported/);
});
test('fetch checks HTTP status, bounded streaming, and header names', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('image', { headers: { 'content-disposition': 'inline; filename="test.png"' } }));
  const result = await fetchImage('https://test/image');
  assert.equal(result.name, 'test.png');
  assert.equal(await result.blob.text(), 'image');
  globalThis.fetch = async () => new Response('', { status: 403 });
  await assert.rejects(fetchImage('https://test/image'), /403/);
  globalThis.fetch = async () => new Response('', { headers: { 'content-length': MAX_BYTES + 1 } });
  await assert.rejects(fetchImage('https://test/image'), /32 MB/);
  let cancelled = false;
  globalThis.fetch = async () => ({ ok: true, headers: new Headers(), body: new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_BYTES + 1)); },
    cancel() { cancelled = true; }
  }) });
  await assert.rejects(fetchImage('https://test/image'), /32 MB/);
  assert.equal(cancelled, true);
});
test('bitmap encoding works without DOM decode, whites JPG and releases resources', async t => {
  const draws = [];
  let closed = 0;
  let mimeMismatch = false;
  let pixels = false;
  let decodeFailure = false;
  const oldBitmap = globalThis.createImageBitmap;
  const oldCanvas = globalThis.OffscreenCanvas;
  globalThis.createImageBitmap = async () => {
    if (decodeFailure) throw new Error('Decode failed');
    return { width: 2, height: pixels ? 30000000 : 2, close() { closed++; } };
  };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { fillStyle: '', fillRect() { draws.push('white'); }, drawImage() { draws.push('draw'); } }; }
    async convertToBlob({ type }) { return new Blob(['output'], { type: mimeMismatch ? 'image/png' : type }); }
  };
  t.after(() => { globalThis.createImageBitmap = oldBitmap; globalThis.OffscreenCanvas = oldCanvas; });
  for (const key of ['jpg', 'webp', 'png']) {
    draws.length = 0;
    const result = await encodeImage(new Blob(['input']), key);
    assert.equal(result.type, FORMATS[key].mime);
    assert.deepEqual(draws, key === 'jpg' ? ['white', 'draw'] : ['draw']);
  }
  mimeMismatch = true;
  await assert.rejects(encodeImage(new Blob(['input']), 'webp'), /encode/);
  mimeMismatch = false;
  pixels = true;
  await assert.rejects(encodeImage(new Blob(['input']), 'png'), /megapixel/);
  pixels = false;
  decodeFailure = true;
  await assert.rejects(encodeImage(new Blob(['input']), 'png'), /Decode/);
  assert.equal(closed, 5);
});
