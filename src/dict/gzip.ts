/**
 * Gzip at rest, read side: browser-safe. Full-2 shards are stored as `f-xx.json.gz`; the reader gets bytes and turns them
 * into text. Works in browsers and workers (`DecompressionStream`), in Node (the same global, else `node:zlib`), and when the
 * server or browser already content-encoded the answer (the bytes then are plain JSON: detected by the gzip magic number,
 * never assumed).
 */
export const isGzip = (b: Uint8Array): boolean => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

export async function inflateGzip(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'function' && typeof Blob === 'function' && typeof Response === 'function') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    return new Response(stream as unknown as BodyInit).text();
  }
  const name = 'node:zlib'; // a variable specifier: a browser bundle never tries to resolve it
  const zlib = (await import(/* @vite-ignore */ name)) as { gunzipSync(b: Uint8Array): { toString(enc: string): string } };
  return zlib.gunzipSync(bytes).toString('utf8');
}

/** The text of a response body that may or may not be gzip. */
export async function bytesToText(bytes: Uint8Array): Promise<string> {
  return isGzip(bytes) ? inflateGzip(bytes) : new TextDecoder('utf-8').decode(bytes);
}
