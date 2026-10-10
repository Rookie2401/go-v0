// @vitest-environment node
/**
 * The adapter between the application and the language-packs package, against the real package and the real dictionary
 * files on disk: what the screens are given is what the installer and the registry really say.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as LP from '../../packages/language-packs/src';
import { createPackBindings, packStorage } from '../../packages/golearn-extension/app/bindings';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';

const PUBLIC = path.resolve(__dirname, '../../public');
const diskFetch = (async (input: RequestInfo | URL) => {
  const file = path.join(PUBLIC, new URL(String(input)).pathname);
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('no', { status: 404 });
}) as typeof fetch;
const BASE = 'http://app.test/';

describe('the pack bindings', () => {
  const b = createPackBindings();

  it('lists every pack with its status and level; Albanian and (at a minimal level) Spanish are installable, German, Hindi, Thai and the two Norwegian packs are experimental', () => {
    const packs = b.packs();
    expect(packs.map((p) => p.languageId).sort()).toEqual(['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th']);
    const sq = b.packFor('sq')!;
    expect(sq).toMatchObject({ packId: 'pack:sq', status: 'installable', name: 'Albanian', scriptId: 'Latn', defaultVarietyId: 'sq-standard' });
    expect(sq.attribution).toEqual(['Wiktionary, via kaikki.org — CC BY-SA 4.0']);
    expect(sq.licences.length).toBeGreaterThan(0);
    expect(sq.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['sq-standard']);
    expect(sq.remoteVoiceProvider).toBeTruthy();
    for (const p of packs.filter((x) => ['de', 'hi', 'th', 'nb', 'nn'].includes(x.languageId))) expect(p, p.packId).toMatchObject({ status: 'installable', level: 'experimental', levelLabel: 'experimental, seed-only lemmatisation, unreviewed' });
    expect(sq).toMatchObject({ level: 'installable', levelLabel: 'installable' });
    expect(b.packFor('es')).toMatchObject({ packId: 'pack:es', status: 'installable', reviewStatus: 'machine-drafted' });
    expect(b.packFor('xx')).toBeUndefined();
    expect(b.packFor('constructor')).toBeUndefined();
  });

  it('languages: six, in the catalogue’s order; Norwegian asks for its written standard, Spanish offers a regional preference, and every choice names a pack that exists', () => {
    const languages = b.languages();
    expect(languages).toHaveLength(6);
    expect(languages.map((l) => l.languageId)).toEqual(LP.LANGUAGE_CATALOGUE.map((e) => e.languageId));
    expect(languages.map((l) => l.name.split(' ')[0])).toEqual(['Norwegian', 'German', 'Albanian', 'Hindi', 'Thai', 'Spanish']);
    for (const l of languages) {
      expect(l.nativeName, l.name).toBeTruthy();
      expect(l.scriptId, l.name).toBeTruthy();
      expect(l.level, l.name).toBeTruthy();
      expect(l.whatWorks.length, l.name).toBeGreaterThan(0);
      expect(l.whatDoesNot.length, l.name).toBeGreaterThan(0);
      expect(l.audio, l.name).toBeTruthy();
    }
    const norwegian = languages[0];
    expect(norwegian.choice).toMatchObject({ kind: 'standard', required: true });
    expect(norwegian.choice!.options.map((o) => o.id)).toEqual(['nb', 'nn']);
    const spanish = languages.find((l) => l.name.startsWith('Spanish'))!;
    expect(spanish.choice).toMatchObject({ kind: 'variety', required: false });
    expect(spanish.choice!.options.map((o) => o.varietyId)).toContain('es-HN');
    for (const l of languages) for (const o of l.choice?.options ?? []) expect(b.packFor(o.languageId), `${l.name}/${o.id}`).toBeDefined();
    expect(b.packFor(languages.find((l) => l.name.startsWith('Albanian'))!.languageId)).toBeDefined();
    // the words the old team screen used are not the bindings’ any more
    expect((b as unknown as Record<string, unknown>).teams).toBeUndefined();
  });

  it('installs Albanian from the real dictionary files: dictionary description, a shard, and every validation case', async () => {
    const area = createMemoryStorageArea();
    const sq = b.packFor('sq')!;
    const progress: Array<[number, number, string | undefined]> = [];
    const r = await b.install(sq, { fetch: diskFetch, baseUrl: BASE, storage: area, onProgress: (d, t, l) => progress.push([d, t, l]) });
    expect(r.ok).toBe(true);
    expect(r.version).toBe(sq.version);
    expect(r.checks.map((c) => c.id).slice(0, 2)).toEqual(['dictionary-manifest', 'sample-shard']);
    expect(r.checks.length).toBeGreaterThanOrEqual(16);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.checks[0].label).toMatch(/kaikki-sq/);
    expect(progress.length).toBeGreaterThanOrEqual(4);
    expect(progress.at(-1)![0]).toBe(4);
    // the record is under the golearn: prefix
    expect(Object.keys(await area.get(null))).toEqual(['golearn:pack:installed:pack:sq']);
    // and reads back
    const v = await b.verify(sq, area);
    expect(v.ok).toBe(true);
    expect(v.version).toBe(sq.version);
    expect(v.checks.length).toBe(r.checks.length);
  });

  it('a dictionary that is not there is reported as a failed check, not an exception', async () => {
    const area = createMemoryStorageArea();
    const r = await b.install(b.packFor('sq')!, { fetch: (async () => new Response('no', { status: 404 })) as typeof fetch, baseUrl: BASE, storage: area });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/dictionary-unreachable/);
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].ok).toBe(false);
    expect(await area.get(null)).toEqual({});
    const offline = await b.install(b.packFor('sq')!, { fetch: (async () => { throw new Error('offline'); }) as typeof fetch, baseUrl: BASE, storage: area });
    expect(offline.ok).toBe(false);
    expect(offline.checks[0].detail).toMatch(/offline/);
  });

  it('a planned pack is refused by the installer itself, with its own reason', async () => {
    const nb = b.packFor('nb')!;
    // no pack is planned any more: make one by saying so in the manifest the installer is handed
    const planned = { ...nb, status: 'planned' as const, level: 'planned' as const, manifest: { ...(nb.manifest as object), status: 'planned', level: 'planned' } };
    const r = await b.install(planned, { fetch: diskFetch, baseUrl: BASE, storage: createMemoryStorageArea() });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/planned/);
  });

  it('verify says so when nothing is installed, and when the record is for another version', async () => {
    const area = createMemoryStorageArea();
    const sq = b.packFor('sq')!;
    const none = await b.verify(sq, area);
    expect(none).toMatchObject({ ok: false, checks: [] });
    expect(none.message).toMatch(/no installation record/);
    await packStorage(area).set('pack:installed:pack:sq', { version: 'old', installedAt: '2026-01-01T00:00:00Z', verified: { dictionaryManifest: true, sampleShard: true, validation: [] } });
    const stale = await b.verify(sq, area);
    expect(stale.ok).toBe(false);
    expect(stale.version).toBe('old');
    expect(stale.message).toMatch(/Reinstall/);
  });

  it('the Albanian orientation: every practice target is a word of its sentence, and the real parser reads it as that word', () => {
    expect(b.tutorial('es')?.languageId).toBe('es'); // the Spanish orientation exists at a minimal, unreviewed level
    expect(b.tutorial('xx')).toBeUndefined();
    const t = b.tutorial('sq')!;
    expect(t.steps.length).toBeGreaterThanOrEqual(8);
    expect(t.notice).toMatch(/native speaker/i);
    const practice = t.steps.filter((s) => s.practice);
    expect(practice.length).toBeGreaterThanOrEqual(1);
    for (const s of practice) {
      const { sentence, target } = s.practice!;
      const at = sentence.indexOf(target);
      expect(at, `${s.id}: ${target} in ${sentence}`).toBeGreaterThanOrEqual(0);
      const card = parseSelection({ surface: target, context: { kind: 'sentence', confidence: 1, sentence, selStart: at, selEnd: at + target.length } });
      expect(card.surface, s.id).toBe(target);
      expect(card.context.kind, s.id).toBe('sentence');
      expect(card.tokenCount, s.id).toBe(1);
    }
    const passage = t.steps.find((s) => s.passage)!;
    expect(passage.passage!.sentences.length).toBeGreaterThan(3);
  });
});
