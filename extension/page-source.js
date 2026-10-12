// Injected only after a user selects a format; runs in the clicked frame.
// Kept self-contained because executeScript serializes the function.
export async function readPageImage(source, maxBytes) {
  try {
    let response;
    // same-origin keeps same-site auth while omitting credentials for CDNs.
    try {
      response = await fetch(source, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
    } catch (error) {
      if (error.name !== 'TypeError' || !/^https?:/i.test(source)) throw error;
    }
    if (!response || [401, 403].includes(response.status)) {
      response = await fetch(source, { credentials: 'include', signal: AbortSignal.timeout(20000) });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) throw new Error('Image exceeds the 32 MB input limit.');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Image exceeds the 32 MB input limit.'); }
      chunks.push(value);
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Cannot read this image.'));
      reader.readAsDataURL(blob);
    });
    return { dataUrl };
  } catch (error) { return { error: error.message }; }
}
