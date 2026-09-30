/** Browser file helpers for the importer and backup screens: read a chosen file as text, hand the learner a file. */

/** Read a File as UTF-8 text (Blob.text where it exists, FileReader otherwise). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

/** Offer `text` to the learner as a downloaded file. Nothing leaves the device: it is a local Blob. */
export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const canObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  const url = canObjectUrl ? URL.createObjectURL(blob) : `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  if (canObjectUrl) setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
