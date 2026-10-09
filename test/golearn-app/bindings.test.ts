// @vitest-environment node
/**
 * The adapter between the application and the language-packs package, against the real package and the real dictionary
 * files on disk: what the screens are given is what the installer and the registry really say.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('lists every pack with its status and level; Albanian and (at a minimal level) Spanish are installable, German, Hindi and Thai are experimental, only the two Norwegian packs are planned', () => {
    const packs = b.packs();
    expect(packs.map((p) => p.languageId).sort()).toEqual(['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th']);
    const sq = b.packFor('sq')!;
    expect(sq).toMatchObject({ packId: 'pack:sq', status: 'installable', name: 'Albanian', scriptId: 'Latn', defaultVarietyId: 'sq-standard' });
    expect(sq.attribution).toEqual(['Wiktionary, via kaikki.org — CC BY-SA 4.0']);
    expect(sq.licences.length).toBeGreaterThan(0);
    expect(sq.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['sq-standard']);
    expect(sq.remoteVoiceProvider).toBeTruthy();
    for (const p of packs.filter((x) => ['nb', 'nn'].includes(x.languageId))) expect(p, p.packId).toMatchObject({ status: 'planned', level: 'planned', levelLabel: 'planned, not installable' });
    for (const p of packs.filter((x) => ['de', 'hi', 'th'].includes(x.languageId))) expect(p, p.packId).toMatchObject({ status: 'installable', level: 'experimental', levelLabel: 'experimental, seed-only lemmatisation, unreviewed' });
    expect(sq).toMatchObject({ level: 'installable', levelLabel: 'installable' });
    expect(b.packFor('es')).toMatchObject({ packId: 'pack:es', status: 'installable', reviewStatus: 'machine-drafted' });
    expect(b.packFor('xx')).toBeUndefined();
    expect(b.packFor('constructor')).toBeUndefined();
  });

  it('teams: a team is not a language, and Norway’s two written standards are a required choice', () => {
    const teams = b.teams();
    expect(teams.map((t) => t.teamId).sort()).toEqual(['albania', 'germany', 'honduras', 'india', 'norway', 'thailand']);
    const norway = teams.find((t) => t.teamId === 'norway')!;
    expect(norway.languages.map((l) => l.languageId)).toEqual(['nb', 'nn']);
    expect(norway.languages.every((l) => l.requiredChoice)).toBe(true);
    const albania = teams.find((t) => t.teamId === 'albania')!;
    expect(albania.teamId).not.toBe(albania.languages[0].languageId);
    expect(albania.languages[0]).toMatchObject({ languageId: 'sq', varietyId: 'sq-standard' });
    for (const t of teams) for (const l of t.languages) expect(b.packFor(l.languageId), `${t.teamId}/${l.languageId}`).toBeDefined();
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
    const r = await b.install(b.packFor('nb')!, { fetch: diskFetch, baseUrl: BASE, storage: createMemoryStorageArea() });
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
    expect(b.tutorial('de')).toBeUndefined();
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
