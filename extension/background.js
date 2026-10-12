import { FORMATS, MAX_BYTES, outputFilename } from './shared.js';
import { readPageImage } from './page-source.js';

let creating;
async function setupOffscreen() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Decode images, encode them with Canvas and manage download Blob URLs.'
    });
  })();
  try { await creating; } finally { creating = undefined; }
}
async function request(message) {
  await setupOffscreen();
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', ...message });
  if (!result?.ok) throw new Error(result?.error || 'Image conversion did not respond.');
  return result;
}
async function installMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'save-picture-as', title: 'Save picture as', contexts: ['image'] });
  for (const [key, format] of Object.entries(FORMATS)) chrome.contextMenus.create({
    id: `save-${key}`, parentId: 'save-picture-as', title: `Save as ${format.label}…`, contexts: ['image']
  });
}
chrome.runtime.onInstalled.addListener(() => { installMenus().catch(console.error); });

async function release(downloadId) {
  const key = `download:${downloadId}`;
  const state = await chrome.storage.session.get(key);
  if (!state[key]) return;
  try { await request({ action: 'release', url: state[key] }); }
  finally { await chrome.storage.session.remove(key); }
}
chrome.downloads.onChanged.addListener(delta => {
  if (['complete', 'interrupted'].includes(delta.state?.current)) release(delta.id).catch(console.error);
});

export async function saveImage(info, tab) {
  const format = String(info.menuItemId).replace(/^save-/, '');
  if (!FORMATS[format] || !info.srcUrl) return;
  const source = info.srcUrl;
  if (!/^(https?:|data:|blob:)/i.test(source)) throw new Error('This image URL type is not supported.');
  let converted;
  // Blob URLs belong to the originating frame and cannot be fetched offscreen.
  if (!source.startsWith('blob:')) {
    try { converted = await request({ action: 'convert', source, format }); }
    catch (error) { if (!/^https?:/i.test(source)) throw error; }
  }
  if (!converted) {
    if (!Number.isInteger(tab?.id)) throw new Error('The original image tab is unavailable.');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: readPageImage, args: [source, MAX_BYTES]
    });
    const image = results[0]?.result;
    if (!image?.dataUrl) throw new Error(image?.error || 'The site did not allow access to this image.');
    converted = await request({ action: 'convert', source: image.dataUrl, format });
  }
  try {
    const id = await chrome.downloads.download({
      url: converted.url, filename: outputFilename(source, format, converted.name),
      saveAs: true, conflictAction: 'uniquify'
    });
    await chrome.storage.session.set({ [`download:${id}`]: converted.url });
    const [download] = await chrome.downloads.search({ id });
    if (download && download.state !== 'in_progress') await release(id);
  } catch (error) {
    await request({ action: 'release', url: converted.url }).catch(console.error);
    // Cancelling the Save As dialog is a normal user action.
    if (!/cancel/i.test(error.message)) throw error;
  }
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  saveImage(info, tab).catch(error => {
    console.error('Save picture as:', error);
    chrome.tabs.create({ url: chrome.runtime.getURL('error.html') + '?message=' + encodeURIComponent(error.message) });
  });
});
