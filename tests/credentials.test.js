import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchImage } from '../extension/converter.js';
import { readPageImage } from '../extension/page-source.js';

const CDN = 'https://kep.cdn.indexvas.hu/photo.jpg';
test('public wildcard CDN is read without credentials', async t => {
  const attempts = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    attempts.push(options.credentials);
    if (options.credentials === 'include') throw new TypeError('Failed to fetch');
    return new Response('image', { headers: { 'access-control-allow-origin': '*', 'content-type': 'image/jpeg' } });
  });
  assert.equal(await (await fetchImage(CDN)).blob.text(), 'image');
  assert.deepEqual(attempts, ['omit']);
});
for (const status of [401, 403, 'network']) {
  test(`authenticated fetch retries after ${status}`, async t => {
    const attempts = [];
    t.mock.method(globalThis, 'fetch', async (_, options) => {
      attempts.push(options.credentials);
      if (options.credentials === 'omit') {
        if (status === 'network') throw new TypeError('Failed to fetch');
        return new Response('', { status });
      }
      return new Response('authenticated image');
    });
    assert.equal(await (await fetchImage(CDN)).blob.text(), 'authenticated image');
    assert.deepEqual(attempts, ['omit', 'include']);
  });
}
test('timeout does not cause another network request', async t => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => { attempts++; throw new DOMException('Timed out', 'TimeoutError'); });
  await assert.rejects(fetchImage(CDN), /Timed out/);
  assert.equal(attempts, 1);
});
test('injected fallback accepts wildcard CDN and keeps same-origin credentials', async t => {
  const oldReader = globalThis.FileReader;
  globalThis.FileReader = class {
    async readAsDataURL(blob) {
      this.result = 'data:image/jpeg;base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64');
      this.onload();
    }
  };
  t.after(() => { globalThis.FileReader = oldReader; });
  const attempts = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    attempts.push(options.credentials);
    if (options.credentials === 'include') throw new TypeError('Failed to fetch');
    return new Response('image', { headers: { 'access-control-allow-origin': '*', 'content-type': 'image/jpeg' } });
  });
  const result = await readPageImage(CDN, 1024);
  assert.match(result.dataUrl, /^data:image\/jpeg;base64,/);
  assert.deepEqual(attempts, ['same-origin']);
});
