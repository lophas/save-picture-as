import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

const profile = await mkdtemp(resolve(tmpdir(), 'save-picture-test-'));
const extension = resolve('extension');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
let server;
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const inputs = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 1, 1);
    const images = {};
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      const blob = await canvas.convertToBlob({ type: mime });
      images[mime] = await new Promise(resolve => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
      });
    }
    images['image/svg+xml'] = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1" fill="red"/></svg>');
    return images;
  });
  const png = Buffer.from(inputs['image/png'].split(',')[1], 'base64');
  server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Content-Disposition': 'inline; filename="fixture.png"' });
    response.end(png);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  inputs['wildcard CDN'] = `http://127.0.0.1:${server.address().port}/picture`;
  await worker.evaluate(async () => {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Browser smoke test' });
  });
  for (const [input, source] of Object.entries(inputs)) {
    for (const [format, expected] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']]) {
      const result = await worker.evaluate(async ({ source, format }) => {
        const result = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'convert', source, format });
        if (!result.ok) throw new Error(result.error);
        return result;
      }, { source, format });
      assert.equal(result.ok, true);
      if (input === 'wildcard CDN') assert.equal(result.name, 'fixture.png');
      const id = worker.url().split('/')[2];
      await page.goto(`chrome-extension://${id}/error.html`);
      const output = await page.evaluate(async url => {
        const blob = await (await fetch(url)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
        const pixel = Array.from(ctx.getImageData(15, 15, 1, 1).data);
        const result = { type: blob.type, width: bitmap.width, height: bitmap.height, pixel };
        bitmap.close(); return result;
      }, result.url);
      assert.equal(output.type, expected);
      assert.equal(output.width, 16); assert.equal(output.height, 16);
      if (input !== 'image/jpeg') {
        if (format === 'jpg') {
          assert.equal(output.pixel[3], 255);
          assert.ok(output.pixel.slice(0, 3).every(value => value > 200), JSON.stringify(output));
        } else assert.equal(output.pixel[3], 0);
      }
      await worker.evaluate(url => chrome.runtime.sendMessage({ target: 'offscreen', action: 'release', url }), result.url);
      console.log(`${input} -> ${format}: MIME, size, pixels and cleanup OK`);
    }
  }
} finally {
  await context.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
