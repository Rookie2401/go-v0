/**
 * The check functions behind `npm run speech:check` (scripts/speechChecks.ts). All upstream traffic is mocked: nothing
 * here touches a network, and nothing proves anything about the live service or any voice.
 */
import { describe, expect, it, vi } from 'vitest';
import { encodeWav } from '../../src/golisten';
import { loadBundledCorpus } from '../../src/ingest';
import esDoc from '../../data/corpus/es/bible-1john-1.json';
import {
  AUDITION_STATEMENT, CHECK_KEY, NOT_CONFIGURED_LINE, configurationReport, findLeaks, formatLive, formatTable, runLiveSynthesis, runProviderIndependentChecks, selectSpanishSample,
  type CheckResult,
} from '../../scripts/speechChecks';

const KEY = 'REAL-LOOKING-KEY-0123456789abcdef-DO-NOT-PRINT';
const REGION = 'westeurope';
const bi = (b: Uint8Array) => b as unknown as BodyInit;
const tone = () => {
  const n = 24_000;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 24_000);
  return encodeWav({ samples: s, sampleRate: 24_000 });
};

describe('configurationReport', () => {
  it('configured: prints the region and never the key (line, lines and the whole report)', async () => {
    const r = await configurationReport({ key: KEY, region: REGION });
    expect(r.configured).toBe(true);
    expect(r.line).toBe('configured: yes (region westeurope)');
    expect(r.lines).toEqual(['configured: yes (region westeurope)']);
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(r.lines.join('\n')).not.toContain(KEY);
  });

  it('not configured: the exact instruction, and which variable is missing (names only)', async () => {
    const none = await configurationReport({});
    expect(none.configured).toBe(false);
    expect(none.line).toBe('configured: no — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server');
    expect(none.line).toBe(NOT_CONFIGURED_LINE);
    expect(none.lines[1]).toBe('missing: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION');

    const keyOnly = await configurationReport({ key: KEY });
    expect(keyOnly.configured).toBe(false);
    expect(keyOnly.lines).toEqual([NOT_CONFIGURED_LINE, 'missing: AZURE_SPEECH_REGION']);
    expect(JSON.stringify(keyOnly)).not.toContain(KEY);

    const regionOnly = await configurationReport({ region: REGION });
    expect(regionOnly.configured).toBe(false);
    expect(regionOnly.lines[1]).toBe('missing: AZURE_SPEECH_KEY');
  });

  it('means what the proxy means: a malformed region is not configured (and the key is still not printed)', async () => {
    const r = await configurationReport({ key: KEY, region: 'not a region!' });
    expect(r.configured).toBe(false);
    expect(r.lines.join('\n')).not.toContain(KEY);
    expect(r.lines[1]).toMatch(/not a valid Azure region/);
  });
});

describe('provider-independent chain', () => {
  it('every check passes, none of them reports the test key, and every promised area is covered', async () => {
    const out = await runProviderIndependentChecks();
    const failed = out.results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(out.ok).toBe(true);
    expect(out.results.map((r) => r.id)).toEqual([
      'cache-key', 'setup', 'locale', 'voice-review', 'invalidation', 'retry', 'dead', 'partial', 'unconfigured', 'fixture-playback', 'real-playback', 'key-secrecy',
    ]);
    const table = formatTable(out.results);
    expect(table).not.toContain(CHECK_KEY);
    expect(JSON.stringify(out.results)).not.toContain(CHECK_KEY);
    expect(table.match(/PASS/g)?.length).toBe(out.results.length);
  }, 60_000);

  it('the leak search can fail: a planted key is found, an empty key finds nothing', () => {
    expect(findLeaks(['a', `x ${CHECK_KEY} y`, 'b'], CHECK_KEY)).toEqual([`x ${CHECK_KEY} y`]);
    expect(findLeaks(['a'], '')).toEqual([]);
  });

  it('formatTable marks failures and wraps long details', () => {
    const rows: CheckResult[] = [
      { id: 'a', name: 'good', ok: true, detail: 'fine' },
      { id: 'b', name: 'bad', ok: false, detail: 'word '.repeat(60).trim() },
    ];
    const t = formatTable(rows, 60);
    expect(t).toMatch(/PASS\s+a\s+good/);
    expect(t).toMatch(/FAIL\s+b\s+bad/);
    expect(Math.max(...t.split('\n').map((l) => l.length))).toBeLessThanOrEqual(70);
  });
});

describe('runLiveSynthesis (mocked: the real service is never called here)', () => {
  const sentence = 'Si confesamos nuestros pecados.';
  type Call = { url: string; body?: string; key?: string };
  function mock(opts: { voices?: Array<Record<string, string>>; synth?: () => Response }) {
    const calls: Call[] = [];
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined, key: (init?.headers as Record<string, string> | undefined)?.['Ocp-Apim-Subscription-Key'] });
      if (url.endsWith('/voices/list')) return new Response(JSON.stringify(opts.voices ?? []), { status: 200 });
      return opts.synth ? opts.synth() : new Response(bi(tone()), { status: 200 });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('one synthesis request, the sentence it was given, WAV validated, locale and duration reported, audition still required', async () => {
    const m = mock({ voices: [{ ShortName: 'es-MX-DaliaNeural', Locale: 'es-MX', Gender: 'Female' }] });
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: m.fn });
    expect(r).toMatchObject({ ok: true, voice: 'es-MX-DaliaNeural', requestedLocale: 'es-HN', deliveredLocale: 'es-MX', sampleRate: 24_000, durationMs: 1000, problems: [] });
    const synth = m.calls.filter((c) => c.url.endsWith('/cognitiveservices/v1'));
    expect(synth).toHaveLength(1);
    expect(synth[0].url).toBe(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`);
    expect(synth[0].body).toContain(sentence);
    expect(synth[0].key).toBe(KEY); // the key goes to the service in the one header, nowhere else
    const lines = formatLive(r);
    expect(lines.join('\n')).toContain('delivered locale es-MX');
    expect(lines.join('\n')).toContain('duration 1000 ms');
    expect(lines.join('\n')).toContain(AUDITION_STATEMENT);
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('prefers an es-HN voice when the live list has one (the Honduras course is then exact)', async () => {
    const m = mock({ voices: [{ ShortName: 'es-MX-DaliaNeural', Locale: 'es-MX' }, { ShortName: 'es-HN-KarlaNeural', Locale: 'es-HN', Gender: 'Female' }] });
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: m.fn });
    expect(r).toMatchObject({ ok: true, voice: 'es-HN-KarlaNeural', requestedLocale: 'es-HN', deliveredLocale: 'es-HN' });
  });

  it('falls back to the static voice table when the voice list is unavailable', async () => {
    const m = mock({ voices: [] });
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: m.fn });
    expect(r.ok).toBe(true);
    expect(r.voice).toBe('es-MX-DaliaNeural');
  });

  it('a service refusal is a failure with the proxy error code, not a pass, and never carries the key', async () => {
    const m = mock({ voices: [], synth: () => new Response(`bad key ${KEY}`, { status: 401 }) });
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: m.fn });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HTTP 401 missing-credentials/);
    expect(JSON.stringify(r)).not.toContain(KEY);
    const lines = formatLive(r).join('\n');
    expect(lines).toMatch(/^REAL SPEECH: FAILED/);
    expect(lines).not.toContain(KEY);
    expect(lines).not.toContain(AUDITION_STATEMENT);
  });

  it('a WAV that fails validation (silence) is a failure with the validator problems', async () => {
    const m = mock({ voices: [], synth: () => new Response(bi(encodeWav({ samples: new Int16Array(24_000), sampleRate: 24_000 })), { status: 200 }) });
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: m.fn });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('silent');
    expect(formatLive(r).join('\n')).toMatch(/REAL SPEECH: FAILED/);
  });

  it('a network failure is reported without the thrown text', async () => {
    const fn = vi.fn(async () => { throw new Error(`socket closed for ${KEY}`); }) as unknown as typeof fetch;
    const r = await runLiveSynthesis({ env: { key: KEY, region: REGION }, sentence, fetch: fn });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe('selectSpanishSample', () => {
  it('is the first sentence of the Spanish verified document (read from the data file, not retyped), even though other languages share the id', () => {
    const docs = loadBundledCorpus();
    expect(docs.filter((d) => d.id === 'bible-1john-1').length).toBeGreaterThan(1); // the id exists in several languages
    const expected = esDoc.sections[0].paragraphs[0].sentences![0].text;
    expect(selectSpanishSample(docs)).toBe(expected);
    expect(selectSpanishSample(docs.filter((d) => d.lang !== 'es'))).toBeUndefined();
  });
});
