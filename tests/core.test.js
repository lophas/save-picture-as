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
test('encoding uses requested MIME, whites JPG, and releases resources on failure', async t => {
  const draws = [];
  const revoked = [];
  let mimeMismatch = false;
  let pixels = false;
  let decodeFailure = false;
  t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  const oldImage = globalThis.Image;
  const oldDocument = globalThis.document;
  globalThis.Image = class {
    naturalWidth = 2;
    get naturalHeight() { return pixels ? 30000000 : 2; }
    async decode() { if (decodeFailure) throw new Error('Decode failed'); }
  };
  globalThis.document = { createElement() { return {
    getContext() { return { fillStyle: '', fillRect() { draws.push('white'); }, drawImage() { draws.push('draw'); } }; },
    toBlob(callback, mime) { callback(new Blob(['output'], { type: mimeMismatch ? 'image/png' : mime })); }
  }; } };
  t.after(() => { globalThis.Image = oldImage; globalThis.document = oldDocument; });
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
  assert.equal(revoked.length, 6);
});
