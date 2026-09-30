/**
 * Microphone recording via MediaRecorder, feature-detected. Recording + replay only: no scoring of any kind.
 */
export function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

export interface ActiveRecording {
  /** Stops recording, releases the microphone and resolves with the captured bytes. */
  stop(): Promise<{ bytes: Uint8Array; mime: string; durationMs: number }>;
}

/** Blob → bytes, with a FileReader fallback for engines without Blob.arrayBuffer. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the recording'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function startRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  return {
    stop: () => new Promise((resolve, reject) => {
      recorder.onerror = () => reject(new Error('recording failed'));
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        void blobBytes(new Blob(chunks, { type: mime })).then((bytes) => resolve({ bytes, mime, durationMs: Date.now() - startedAt }), reject);
      };
      if (recorder.state !== 'inactive') recorder.stop(); else recorder.onstop?.(new Event('stop'));
    }),
  };
}
