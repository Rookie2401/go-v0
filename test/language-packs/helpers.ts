import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC = path.resolve(__dirname, '../../public');
export const BASE = 'https://app.test/';

/** A fetch that serves `public/` from disk for BASE URLs, and answers 404 for anything missing. Counts its requests. */
export function diskFetch(root = PUBLIC): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (!url.startsWith(BASE)) return new Response('not here', { status: 404 });
    const file = path.join(root, decodeURIComponent(url.slice(BASE.length).split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('missing', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200 });
  }) as typeof fetch & { calls: string[] };
  f.calls = calls;
  return f;
}

export function memoryStorage(): { map: Map<string, unknown>; get(k: string): unknown; set(k: string, v: unknown): void } {
  const map = new Map<string, unknown>();
  return { map, get: (k) => map.get(k), set: (k, v) => { map.set(k, v); } };
}
