import { fetchImage, encodeImage } from './converter.js';
const urls = new Set();
// Serial conversion bounds peak memory when several downloads are requested.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  if (message.action === 'release') {
    if (urls.delete(message.url)) URL.revokeObjectURL(message.url);
    respond({ ok: true });
    return;
  }
  if (message.action !== 'convert') return;
  const task = queue.then(async () => {
    if (!/^(https?:|data:)/i.test(message.source)) throw new Error('Unsupported image URL.');
    const input = await fetchImage(message.source);
    const output = await encodeImage(input.blob, message.format);
    const url = URL.createObjectURL(output);
    urls.add(url);
    return { ok: true, url, name: input.name };
  });
  queue = task.catch(() => {});
  task.then(respond, error => respond({ ok: false, error: error.message || 'Cannot decode this image.' }));
  return true;
});
