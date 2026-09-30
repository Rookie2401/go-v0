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
        void new Blob(chunks, { type: mime }).arrayBuffer().then((buf) => resolve({ bytes: new Uint8Array(buf), mime, durationMs: Date.now() - startedAt }), reject);
      };
      if (recorder.state !== 'inactive') recorder.stop(); else recorder.onstop?.(new Event('stop'));
    }),
  };
}
