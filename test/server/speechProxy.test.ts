/**
 * The Vite plugin adapter (Node http <-> pure handler) and the environment reader. The upstream is a MOCKED fetch; the
 * only sockets are loopback ones to a throw-away http server on an ephemeral port.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_ENV_NAMES, readSpeechEnv, speechProxy } from '../../server/speechProxy';
import { MAX_BODY_BYTES } from '../../server/speechHandler';
import { fixtureChunks, renderFixtureChunks } from '../../src/golisten';

const KEY = 'SECRET-KEY-0123456789abcdef';
const REGION = 'westeurope';

type Mw = (req: IncomingMessage, res: ServerResponse, next: (e?: unknown) => void) => void;
const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Mounts the plugin on a bare http server exactly as Vite's connect stack would call it (dev or preview hook). */
async function mount(hook: 'configureServer' | 'configurePreviewServer', opts: Parameters<typeof speechProxy>[0]) {
  const plugin = speechProxy(opts);
  let mw: Mw | undefined;
  const fake = { middlewares: { use: (fn: Mw) => { mw = fn; } } };
  (plugin[hook] as unknown as (s: unknown) => void)(fake);
  const srv = createServer((req, res) => mw!(req, res, () => { res.statusCode = 404; res.setHeader('x-fell-through', 'yes'); res.end('static'); }));
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { plugin, base };
}

const wav = () => renderFixtureChunks(fixtureChunks('hola mundo', 'es'), { sampleRate: 24000 }).bytes;
const upstreamOk = () => vi.fn(async () => new Response(wav() as unknown as BodyInit, { status: 200 })) as unknown as typeof fetch;
const json = { 'content-type': 'application/json' };
const body = JSON.stringify({ text: 'Yo creo en Dios.', voice: 'es-MX-DaliaNeural', locale: 'es-MX' });

describe.each(['configureServer', 'configurePreviewServer'] as const)('speechProxy() through %s', (hook) => {
  it('serves status, voices and synthesize from env, and lets every other path fall through to Vite', async () => {
    const up = upstreamOk();
    const { base } = await mount(hook, { env: () => ({ key: KEY, region: REGION }), fetch: up });

    const status = await fetch(`${base}/api/speech/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ configured: true, region: REGION, provider: 'azure-speech' });

    const synth = await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: json, body });
    expect(synth.status).toBe(200);
    expect(synth.headers.get('content-type')).toBe('audio/wav');
    expect(synth.headers.get('x-speech-delivered-locale')).toBe('es-MX');
    const bytes = new Uint8Array(await synth.arrayBuffer());
    expect(bytes.length).toBe(wav().length);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');

    const other = await fetch(`${base}/index.html`);
    expect(other.status).toBe(404);
    expect(other.headers.get('x-fell-through')).toBe('yes');
    expect(await (await fetch(`${base}/api/speechless`)).text()).toBe('static'); // prefix match is on path segments
  });

  it('reads the environment on every request (a restart is only needed for process.env, not .env.local edits)', async () => {
    let env: { key?: string; region?: string } = {};
    const { base } = await mount(hook, { env: () => env, fetch: upstreamOk() });
    expect((await (await fetch(`${base}/api/speech/status`)).json() as { configured: boolean }).configured).toBe(false);
    const r = await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: json, body });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: 'missing-credentials' });
    env = { key: KEY, region: REGION };
    expect((await (await fetch(`${base}/api/speech/status`)).json() as { configured: boolean }).configured).toBe(true);
  });

  it('413 for a body over the limit (declared or streamed), nothing reaches upstream', async () => {
    const up = upstreamOk();
    const { base } = await mount(hook, { env: () => ({ key: KEY, region: REGION }), fetch: up });
    const r = await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: json, body: JSON.stringify({ text: 'a'.repeat(MAX_BODY_BYTES + 10), voice: 'es-MX-DaliaNeural' }) });
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: 'payload-too-large' });
    expect(up).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin Origin with 403 and applies the per-minute limit', async () => {
    const up = upstreamOk();
    const { base } = await mount(hook, { env: () => ({ key: KEY, region: REGION }), fetch: up, rateLimitPerMinute: 2 });
    const evil = await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: { ...json, origin: 'https://evil.example' }, body });
    expect(evil.status).toBe(403);
    expect(up).not.toHaveBeenCalled();
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: json, body })).status);
    expect(codes).toEqual([200, 200, 429]);
  });

  it('a crash inside the handler path answers 500 with no detail and logs nothing with the key', async () => {
    const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error');
    const lines: string[] = [];
    const { base } = await mount(hook, { env: () => { throw new Error(`env exploded ${KEY}`); }, fetch: upstreamOk(), log: (l) => lines.push(l) });
    const r = await fetch(`${base}/api/speech/status`);
    expect(r.status).toBe(500);
    const text = await r.text();
    expect(text).not.toContain(KEY);
    expect(lines.join('')).not.toContain(KEY);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('environment handling', () => {
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'go-speech-env-')); dirs.push(d); return d; };

  it('reads exactly the two speech variables from .env.local, whatever else the file holds', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.env.local'), `AZURE_SPEECH_KEY=${KEY}\nAZURE_SPEECH_REGION=${REGION}\nOTHER_SECRET=nope\nVITE_PUBLIC=ok\n`);
    const env = readSpeechEnv(dir, 'development', {});
    expect(env).toEqual({ key: KEY, region: REGION });
    expect(Object.keys(env).sort()).toEqual(['key', 'region']);
    expect(JSON.stringify(env)).not.toContain('nope');
    expect(SPEECH_ENV_NAMES).toEqual(['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION']);
  });

  it('process.env wins over the file; blank values count as unset; no file means unconfigured', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.env.local'), `AZURE_SPEECH_KEY=file-key\nAZURE_SPEECH_REGION=\n`);
    expect(readSpeechEnv(dir, 'development', { AZURE_SPEECH_KEY: 'process-key', AZURE_SPEECH_REGION: 'eastus' })).toEqual({ key: 'process-key', region: 'eastus' });
    expect(readSpeechEnv(dir, 'development', {})).toEqual({ key: 'file-key', region: undefined });
    expect(readSpeechEnv(tmp(), 'production', {})).toEqual({ key: undefined, region: undefined });
  });

  it('can never reach the client: no config hook, no define, and the names are not VITE_-prefixed', () => {
    const plugin = speechProxy();
    expect(plugin.name).toBe('go-speech-proxy');
    expect(plugin).not.toHaveProperty('config');
    expect(plugin).not.toHaveProperty('define');
    expect(typeof plugin.configureServer).toBe('function');
    expect(typeof plugin.configurePreviewServer).toBe('function');
    for (const n of SPEECH_ENV_NAMES) expect(n.startsWith('VITE_')).toBe(false);
  });
});
