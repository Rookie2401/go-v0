/**
 * gzip for the node:http bridge (main.ts). JSON compresses about eight to one, and a sync pull or a vocabulary page is mostly JSON, so this is the cheapest
 * way to make the service fast over a phone's connection or a tunnel. Only a response that is JSON, over 1 KB, asked for with `Accept-Encoding: gzip` and not
 * already encoded is compressed; the rest goes out as it was. The handler itself (handler.ts) never compresses: in-process callers and tests see plain bodies.
 */
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);

/** Responses at or under this size are not worth the CPU and the header. */
export const GZIP_MIN_BYTES = 1024;

const acceptsGzip = (acceptEncoding: string | undefined): boolean => {
  if (!acceptEncoding) return false;
  return acceptEncoding.split(',').some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (name !== 'gzip' && name !== '*') return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
};

/** The payload and headers to send: gzipped when it pays, else untouched. `Vary: Accept-Encoding` is set whenever the answer could have gone either way. */
export async function maybeGzip(payload: Buffer, headers: Record<string, string>, acceptEncoding: string | undefined): Promise<{ payload: Buffer; headers: Record<string, string> }> {
  const type = headers['content-type'] ?? headers['Content-Type'] ?? '';
  if (!type.startsWith('application/json') || headers['content-encoding'] || payload.length <= GZIP_MIN_BYTES) return { payload, headers };
  const out: Record<string, string> = { ...headers, Vary: 'Accept-Encoding' };
  if (!acceptsGzip(acceptEncoding)) return { payload, headers: out };
  const zipped = await gzipAsync(payload, { level: 6 });
  const rest = Object.fromEntries(Object.entries(out).filter(([k]) => k.toLowerCase() !== 'content-length'));
  return { payload: zipped, headers: { ...rest, 'Content-Encoding': 'gzip', 'Content-Length': String(zipped.length) } };
}
