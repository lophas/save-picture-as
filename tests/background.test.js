import test from 'node:test';
import assert from 'node:assert/strict';

test('menu saves, blob frame fallback, lifecycle cleanup and concurrent offscreen creation', async () => {
  const values = {};
  const downloads = [];
  const released = [];
  const injections = [];
  const menus = [];
  let creates = 0;
  let exists = false;
  let changed;
  let installed;
  let failedFetch = false;
  let cancelled = false;
  globalThis.chrome = {
    runtime: {
      getURL: path => `chrome-extension://test/${path}`,
      getContexts: async () => exists ? [{}] : [],
      onInstalled: { addListener(fn) { installed = fn; } },
      sendMessage: async message => {
        if (message.action === 'release') { released.push(message.url); return { ok: true }; }
        if (failedFetch && message.source.startsWith('http')) return { ok: false, error: 'HTTP 403' };
        return { ok: true, url: `blob:converted-${downloads.length}`, name: '' };
      }
    },
    offscreen: { async createDocument() { creates++; await new Promise(resolve => setTimeout(resolve, 5)); exists = true; } },
    contextMenus: { removeAll: async () => {}, create: menu => menus.push(menu), onClicked: { addListener() {} } },
    storage: { session: {
      async get(key) { return { [key]: values[key] }; },
      async set(entries) { Object.assign(values, entries); },
      async remove(key) { delete values[key]; }
    } },
    scripting: { async executeScript(request) { injections.push(request); return [{ result: { dataUrl: 'data:image/png;base64,eA==' } }]; } },
    downloads: {
      onChanged: { addListener(fn) { changed = fn; } },
      async download(request) { if (cancelled) throw new Error('User cancelled'); downloads.push(request); return downloads.length; },
      async search() { return [{ state: 'in_progress' }]; }
    },
    tabs: { create() { throw new Error('Unexpected error tab'); } }
  };
  const { saveImage } = await import('../extension/background.js');
  installed();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(menus.length, 4);
  await Promise.all([
    saveImage({ menuItemId: 'save-png', srcUrl: 'https://test/original.avif' }, { id: 2 }),
    saveImage({ menuItemId: 'save-jpg', srcUrl: 'https://test/other.webp' }, { id: 2 })
  ]);
  assert.equal(creates, 1);
  assert.equal(downloads[0].filename, 'original.png');
  assert.equal(downloads[0].saveAs, true);
  assert.equal(downloads[1].filename, 'other.jpg');
  changed({ id: 1, state: { current: 'complete' } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(values['download:1'], undefined);
  assert.equal(released.length, 1);
  await saveImage({ menuItemId: 'save-webp', srcUrl: 'blob:https://test/id', frameId: 4 }, { id: 2 });
  assert.deepEqual(injections[0].target, { tabId: 2, frameIds: [4] });
  assert.equal(downloads[2].filename, 'image.webp');
  failedFetch = true;
  await saveImage({ menuItemId: 'save-png', srcUrl: 'https://test/protected.jpg' }, { id: 2 });
  assert.equal(injections.length, 2);
  assert.equal(downloads[3].filename, 'protected.png');
  cancelled = true;
  await saveImage({ menuItemId: 'save-png', srcUrl: 'data:image/png;base64,eA==' }, { id: 2 });
  assert.equal(released.length, 2);
  await assert.rejects(saveImage({ menuItemId: 'save-png', srcUrl: 'file:///image.png' }, { id: 2 }), /not supported/);
  delete globalThis.chrome;
});
