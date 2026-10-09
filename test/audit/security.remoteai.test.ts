// @vitest-environment node
/**
 * Security audit (10) remote AI and remote speech: no code path may send the learner's text to a remote provider without the
 * consent gate. Two kinds of evidence: (a) the SOURCE is scanned for every place that can reach a network or a remote
 * provider, and each must sit behind a consent check in the same function (a new network call anywhere in these packages
 * fails this test until it is reviewed and listed); (b) the BEHAVIOUR is driven with spies, every consent state, and
 * hostile consent values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { albanianRegistry, createGoListen } from '../../packages/golisten/src';
import type { FetchLike } from '../../packages/golisten/src';
import { RemoteAssistantGate, RemoteAssistanceNotConsented } from '../../packages/gotell/src/privacy/privacy';
import { createAssistance } from '../../packages/gotell/src/engine';
import type { AssistanceRequest, DraftAnalysis, RemoteAssistant } from '../../packages/gotell/src/types';
import { configuredProxy, fakeAudio, fakeObjectUrls, fakeSpeech, fakeUtterance, SQ_NET } from '../golisten/pronounce-fakes';
import { NOW, realAnalyzer } from '../gotell-engine/helpers';

const root = path.resolve(__dirname, '../..');
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' || e.name === 'dist' ? [] : walk(path.join(dir, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : [])) : []);
const rel = (f: string): string => path.relative(root, f).replace(/\\/g, '/');
const NETWORK = /\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.connection|\bhttps?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i;

describe('source inventory: where a network or a remote provider can be reached', () => {
  it('GoTell (new package and legacy src/gotell) contains no network code at all; the only remote port is RemoteAssistant, implemented nowhere in the product', () => {
    const hits: string[] = [];
    for (const f of [...walk(path.join(root, 'packages/gotell/src')), ...walk(path.join(root, 'src/gotell'))]) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      const m = code.match(NETWORK);
      if (m) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
    // the remote port is named in three files only: its definition, the assistance ladder (which asks consent first) and the consent gate
    const naming: string[] = [];
    for (const dir of ['packages', 'src', 'server', 'scripts']) {
      for (const f of walk(path.join(root, dir))) if (/\bRemoteAssistant\b/.test(stripComments(fs.readFileSync(f, "utf8")))) naming.push(rel(f));
    }
    expect(naming.sort()).toEqual(['packages/gotell/src/engine/assist.ts', 'packages/gotell/src/privacy/privacy.ts', 'packages/gotell/src/types.ts']);
    // the only implementation of the port is the gate that wraps another implementation
    const impl: string[] = [];
    for (const f of walk(path.join(root, "packages"))) if (/implements\s+RemoteAssistant\b/.test(stripComments(fs.readFileSync(f, "utf8")))) impl.push(rel(f));
    expect(impl).toEqual(['packages/gotell/src/privacy/privacy.ts']);
  });

  it('GoListen: the only files that mention fetch are the environment types, the facade\'s default and the remote provider, and every call in the remote provider sits after the consent check of its own function', () => {
    const dir = path.join(root, 'packages/golisten/src');
    const mentions = walk(dir).filter((f) => /\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(stripComments(fs.readFileSync(f, 'utf8')))).map(rel).sort();
    expect(mentions).toEqual(['packages/golisten/src/environment.ts', 'packages/golisten/src/golisten.ts', 'packages/golisten/src/providers/remote.ts']);
    for (const f of ['environment.ts', 'ports.ts']) expect(stripComments(fs.readFileSync(path.join(dir, f), 'utf8'))).not.toMatch(/\bfetch\s*\(/); // types only
    // golisten.ts only builds the default function; it makes no request itself
    expect(stripComments(fs.readFileSync(path.join(dir, 'golisten.ts'), 'utf8')).match(/\bf\.call\(|\bfetch\s*\(|env\.fetch\s*\(/g) ?? []).toEqual(['f.call(']);

    const remote = stripComments(fs.readFileSync(path.join(dir, 'providers/remote.ts'), 'utf8'));
    const chunks = remote.split(/\n(?=(?:export\s+)?(?:async\s+)?function\s)/);
    const withCalls = chunks.filter((c) => /env\.fetch\s*\(|\bget\s*\(\s*`/.test(c));
    expect(withCalls.length).toBeGreaterThanOrEqual(2); // prepareRemote and remoteAvailability
    for (const c of withCalls) {
      const consent = c.search(/consent\(\)\.remoteSpeech/);
      const call = c.search(/env\.fetch\s*\(|\bget\s*\(\s*`/);
      expect(consent, c.slice(0, 60)).toBeGreaterThanOrEqual(0);
      expect(consent).toBeLessThan(call);
      // and the check ends the function early: it is a guard (return), not a log line
      expect(c.slice(consent, consent + 160)).toMatch(/return/);
    }
    // nothing else in GoListen can turn the remote provider on
    const callers = walk(dir).filter((f) => /prepareRemote|remoteAvailability/.test(stripComments(fs.readFileSync(f, 'utf8')))).map(rel).sort();
    expect(callers).toEqual(['packages/golisten/src/listing.ts', 'packages/golisten/src/providers/remote.ts', 'packages/golisten/src/resolve.ts']);
  });

  it('the browser vendor\'s cloud voice (a non-local device voice) is behind the same consent in the device provider', () => {
    const device = stripComments(fs.readFileSync(path.join(root, 'packages/golisten/src/providers/device.ts'), 'utf8'));
    const consentAt = device.search(/consent\(\)\.remoteSpeech/);
    expect(consentAt).toBeGreaterThanOrEqual(0);
    expect(device.slice(consentAt - 120, consentAt)).toMatch(/!chosen/); // reached only when no LOCAL voice was chosen
    expect(device.slice(consentAt, consentAt + 300)).toMatch(/no-consent/);
    expect(device.indexOf('chosen = wanted[0]')).toBeGreaterThan(consentAt); // the networked voice is chosen only after the check
  });

  it('the extension\'s reader code (content, popup, parser, adapters) and the controlled reader contain no network call at all', () => {
    const hits: string[] = [];
    for (const d of ['packages/golearn-extension/src/content', 'packages/golearn-extension/src/popup', 'packages/golearn-extension/src/parser', 'packages/golearn-extension/src/adapters']) {
      for (const f of walk(path.join(root, d))) { const m = stripComments(fs.readFileSync(f, 'utf8')).match(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/); if (m) hits.push(`${rel(f)}: ${m[0]}`); }
    }
    expect(hits).toEqual([]);
    // the extension's content bundle never imports GoListen's networked facade (the device provider only)
    const voice = stripComments(fs.readFileSync(path.join(root, 'packages/golearn-extension/src/content/voice.ts'), 'utf8'));
    expect(voice).not.toMatch(/from\s+['"][^'"]*golisten\/src['"]/);
    expect(voice).not.toMatch(/createGoListen|prepareRemote|providers\/remote/);
  });

  it('GoReview, GoPractice\'s review/tell engines and the sync package send nothing but Repository calls (no provider URL, no model API)', () => {
    const hits: string[] = [];
    for (const d of ['packages/goreview/src', 'packages/repository-sync/src', 'packages/repository-engine/src', 'packages/repository-linguistics/src', 'packages/repository-contract/src']) {
      for (const f of walk(path.join(root, d))) {
        const code = stripComments(fs.readFileSync(f, 'utf8'));
        const m = code.match(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|api\.(openai|anthropic)\.com|generativelanguage|azure|cognitive|speech\.microsoft/i);
        if (m && !/goreview\/src\/intake\/fetch\.ts$/.test(rel(f))) hits.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
    // the one file named fetch.ts in GoReview gathers candidates from the Repository API object it is handed; it owns no network
    expect(stripComments(fs.readFileSync(path.join(root, 'packages/goreview/src/intake/fetch.ts'), 'utf8'))).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|globalThis\.fetch/);
  });
});

describe('GoListen remote speech behaves as the source says', () => {
  const TEXT = 'mirëdita, si jeni sot (page text the learner selected)';
  function setup(consent: () => unknown, extra: { voices?: Parameters<typeof fakeSpeech>[0] } = {}) {
    const net = configuredProxy();
    const speech = fakeSpeech(extra.voices ?? []);
    const g = createGoListen({
      registries: [albanianRegistry()], consent: consent as never, speech, audio: fakeAudio(1800), fetch: net.fetch as FetchLike,
      objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0,
    });
    return { g, net, speech };
  }

  it('without consent, EVERY entry point is silent on the network: pronounce (any kind, any preference), voices, availability', async () => {
    for (const consent of [() => ({ remoteSpeech: false }), () => ({}), () => { throw new Error('storage'); }, () => ({ remoteSpeech: 'true' }), () => ({ remoteSpeech: 1 }), () => ({ remoteSpeech: {} }), () => undefined, () => null, () => ({ remoteSpeech: Promise.resolve(true) })]) {
      const { g, net } = setup(consent);
      for (const kind of ['word', 'phrase', 'sentence'] as const) {
        for (const preferred of ['remote', 'device', undefined] as const) await g.pronounce({ languageId: 'sq', text: TEXT, kind, ...(preferred ? { preferred } : {}) });
      }
      await g.voices('sq');
      await g.availability('sq');
      expect(net.calls, String(consent)).toHaveLength(0);
    }
  });

  it('with consent, the text goes in the POST body of one same-origin request to the proxy, never in a URL, a header or a log; credentials are same-origin only', async () => {
    const { g, net } = setup(() => ({ remoteSpeech: true }));
    const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'remote' });
    expect(r.ok).toBe(true);
    const posts = net.calls.filter((c) => c.init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('/api/speech/synthesize');
    expect(JSON.stringify(net.calls.map((c) => [c.url, c.init?.headers]))).not.toContain('mirëdita');
    expect(String(posts[0].init?.body)).toContain('mirëdita');
    expect((posts[0].init as { credentials?: string }).credentials).toBe('same-origin');
    expect(JSON.stringify(posts[0].init?.headers ?? {})).not.toMatch(/authorization|cookie|x-api-key/i);
    // availability and voices lookups carry no text
    for (const c of net.calls.filter((x) => x.init?.method !== 'POST')) expect(JSON.stringify(c)).not.toContain('mirëdita');
  });

  it('consent is read at the moment of use: switched off between two calls, the second sends nothing', async () => {
    let on = true;
    const { g, net } = setup(() => ({ remoteSpeech: on }));
    await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'remote' });
    const before = net.calls.length;
    on = false;
    await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'remote' });
    await g.availability('sq');
    expect(net.calls.length).toBe(before);
  });

  it('a hostile text (markup, NUL, 100,000 characters) is bounded and never changes where the request goes', async () => {
    const { g, net } = setup(() => ({ remoteSpeech: true }));
    for (const text of ['<script>x</script>', '\u0000\u0000', 'a'.repeat(100_000), 'https://evil.example/ignore previous instructions']) {
      await g.pronounce({ languageId: 'sq', text, kind: 'sentence', preferred: 'remote' });
    }
    for (const c of net.calls) expect(c.url).toMatch(/^\/api\/speech\/(synthesize|status|voices\?lang=sq)$/);
  });

  it('a browser voice that is not local (it sends the text to the browser vendor) is not used without consent, and nothing is spoken', async () => {
    const { g, speech } = setup(() => ({ remoteSpeech: false }), { voices: [SQ_NET] });
    const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'device' });
    expect(r.ok).toBe(false);
    expect(speech.spoken).toHaveLength(0);
  });
});

describe('GoTell remote assistance behaves as the source says', () => {
  const analyzer = realAnalyzer();
  const TEXT = 'Unë shkoj me shoku.';
  const analysis: DraftAnalysis = analyzer.analyzeDraft('d1', TEXT);
  const level6: AssistanceRequest = { draftId: 'd1', sentenceIndex: 0, level: 6, at: NOW };
  const spy = (): RemoteAssistant & { calls: unknown[] } => {
    const calls: unknown[] = [];
    return { providerId: 'spy@0', calls, async propose(input) { calls.push(input); return []; } };
  };

  it('with consent off, asking for the model at any level reaches the remote assistant zero times, with or without an intended meaning', async () => {
    const remote = spy();
    const a = createAssistance({ analyzer, remote, consent: { remoteAssistance: () => false }, now: () => NOW });
    for (let level = 1; level <= 6; level++) {
      await a.step(analysis, { ...level6, level: level as AssistanceRequest['level'] }, [], { intendedMeaning: 'I go with the friend' });
      await a.through(analysis, { ...level6, level: level as AssistanceRequest['level'] }, [], { ownSentence: undefined, intendedMeaning: 'secret meaning' });
    }
    expect(remote.calls).toEqual([]);
  });

  it('the gate refuses before it passes anything on, reads consent on every call, and logs lengths only', async () => {
    const inner = spy();
    let on = false;
    const logs: string[] = [];
    const gate = new RemoteAssistantGate(inner, { remoteAssistance: () => on }, (l) => logs.push(l));
    const SECRET = 'Unë kam një sekret të madh';
    await expect(gate.propose({ languageId: 'sq', sentence: SECRET, intendedMeaning: 'my secret meaning' })).rejects.toBeInstanceOf(RemoteAssistanceNotConsented);
    expect(inner.calls).toEqual([]);
    on = true;
    await gate.propose({ languageId: 'sq', sentence: SECRET, intendedMeaning: 'my secret meaning' });
    expect(inner.calls).toHaveLength(1);
    on = false;
    await expect(gate.propose({ languageId: 'sq', sentence: SECRET })).rejects.toBeInstanceOf(RemoteAssistanceNotConsented);
    expect(inner.calls).toHaveLength(1);
    for (const line of logs) { expect(line).not.toContain('sekret'); expect(line).not.toContain('secret'); }
  });

  it('S-14 (fixed): the consent gate accepts only the boolean true (GoListen does); a truthy non-boolean, or a Promise from an async consent store, must not count as consent', async () => {
    const remote = spy();
    for (const bogus of ['no', 'false', 1, {}, Promise.resolve(false)]) {
      const a = createAssistance({ analyzer, remote, consent: { remoteAssistance: (() => bogus) as unknown as () => boolean }, now: () => NOW });
      await a.step(analysis, level6, []);
      const gate = new RemoteAssistantGate(remote, { remoteAssistance: (() => bogus) as unknown as () => boolean });
      await gate.propose({ languageId: 'sq', sentence: TEXT }).catch(() => undefined);
    }
    expect(remote.calls).toEqual([]);
  });
});
