import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { acceptDraft } from '../../src/bench/gold/accept';
import {
  collectCandidates, courseSentenceId, goldRightsOf, makeDraft, parseMeta, sentencesOfDocument, sentencesOfPlainText, sourceMetaOfDocument,
} from '../../src/bench/gold/draft';
import { fromEditing, parseGoldJsonl, toEditing, toJsonl } from '../../src/bench/gold/format';
import { goldStatus } from '../../src/bench/gold/status';
import type { GoldSentence } from '../../src/bench/gold/types';
import { adapterSystem } from '../../src/bench/words/systems';
import { thAdapter } from '../../src/adapters/th';

const SOURCE = { title: 'A lawful test text', licence: 'test only', rights: 'rights-safe' as const };
const TEXTS = Array.from({ length: 30 }, (_, i) => `ฉันรักพระเจ้าข้อ${'ที่'.repeat(1)}${'ก'.repeat(i + 1)}`);

const draftOf = (opt: { n?: number; seed?: number; heldOut?: boolean; exclude?: Set<string> } = {}) =>
  makeDraft(TEXTS, { stratum: 'stage0', n: opt.n ?? 5, seed: opt.seed ?? 1, heldOut: opt.heldOut ?? false, source: SOURCE },
    adapterSystem.segment, opt.exclude);
const draftText = (d: ReturnType<typeof draftOf>) => toEditing(d.entries, d.comments);

describe('sampling for a draft', () => {
  it('is deterministic for the same seed and different for another', () => {
    const a = draftOf({ seed: 1 });
    expect(a.entries.map((e) => e.id)).toEqual(draftOf({ seed: 1 }).entries.map((e) => e.id));
    expect(a.entries.map((e) => e.id)).not.toEqual(draftOf({ seed: 2 }).entries.map((e) => e.id));
    expect(a.entries).toHaveLength(5);
    expect(new Set(a.entries.map((e) => e.id)).size).toBe(5);
  });

  it('keeps the order of the text and never samples an excluded sentence', () => {
    const first = draftOf({ n: 10 });
    const positions = first.entries.map((e) => TEXTS.indexOf(e.text));
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    const exclude = new Set(first.entries.map((e) => e.id));
    const second = draftOf({ n: 25, exclude });
    expect(second.entries.some((e) => exclude.has(e.id))).toBe(false);
    expect(second.available).toBe(TEXTS.length - 10);
  });

  it('marks held-out sentences, writes the adapter segmentation as the draft and keeps the metadata', () => {
    const d = draftOf({ heldOut: true });
    expect(d.entries.every((e) => e.heldOut)).toBe(true);
    for (const e of d.entries) expect(e.boundaries).toEqual(adapterSystem.segment(e.text));
    const text = draftText(d);
    expect(text).toContain('[held-out]');
    const meta = parseMeta(text);
    expect(meta.get('stratum')).toBe('stage0');
    expect(meta.get('source-title')).toBe(SOURCE.title);
    expect(meta.get('source-rights')).toBe('rights-safe');
    expect(meta.get('drafted-by')).toMatch(/HELD OUT/);
    expect(fromEditing(text).problems).toEqual([]);
  });

  it('refuses an unknown stratum', () => {
    expect(() => makeDraft(TEXTS, { stratum: 'nope', n: 3, seed: 1, heldOut: false, source: SOURCE }, () => [])).toThrow(/unknown stratum/);
  });

  it('ids come from the stratum and the exact text', () => {
    expect(courseSentenceId('stage0', 'ฉัน')).toBe(courseSentenceId('stage0', 'ฉัน'));
    expect(courseSentenceId('stage0', 'ฉัน')).not.toBe(courseSentenceId('chotmai', 'ฉัน'));
  });
});

describe('candidates from a supplied text', () => {
  it('reads a v2 document (declared sentences as given, raw paragraphs split by the adapter) and plain text', () => {
    const doc = {
      sections: [{ paragraphs: [
        { sentences: [{ text: 'ฉันรักพระเจ้า' }, { text: 'ผมอยู่บ้าน' }] },
        { text: 'เรารักกัน\nเธอรักเรา' },
      ] }],
      source: { title: 'T', attribution: 'A', rights: 'public-domain' },
    };
    expect(sentencesOfDocument(doc, thAdapter.segmentSentences)).toEqual(['ฉันรักพระเจ้า', 'ผมอยู่บ้าน', 'เรารักกัน', 'เธอรักเรา']);
    expect(sentencesOfPlainText('ก ข\nค', thAdapter.segmentSentences)).toEqual(['ก ข', 'ค']);
    expect(sourceMetaOfDocument(doc)).toEqual({ title: 'T', licence: 'A; corpus rights: public-domain', rights: 'rights-safe' });
    expect(sourceMetaOfDocument({ title: 'x' })).toBeUndefined();
  });

  it('keeps rights honest: only clearly safe corpus rights map to rights-safe', () => {
    expect(goldRightsOf('public-domain')).toBe('rights-safe');
    expect(goldRightsOf('personal-copy')).toBe('personal-copy');
    expect(goldRightsOf('unverified')).toBe('personal-copy');
    expect(goldRightsOf(undefined)).toBe('personal-copy');
  });

  it('drops blanks, duplicates, text without Thai, forbidden characters and non-NFC text, and counts why', () => {
    const c = collectCandidates(['  ตาตา  ', 'ตาตา', 'abc', 'ตา|ตา', '#ตา', 'ตา', '', 'éตา']);
    expect(c.sentences).toEqual(['ตาตา', 'ตา']);
    expect(c.skipped).toEqual({ notNfc: 1, forbiddenCharacter: 2, noThai: 1, duplicate: 1 });
  });
});

describe('accept', () => {
  const fixed = (d: ReturnType<typeof draftOf>, from: string, to: string) => draftText(d).replace(from, to);

  it('refuses without --by', () => {
    const r = acceptDraft(draftText(draftOf()), { by: undefined, at: '2026-10-01', confirmUnchanged: true });
    expect(r).toMatchObject({ ok: false });
    expect((r as { refusals: string[] }).refusals.join()).toMatch(/--by/);
    expect(acceptDraft(draftText(draftOf()), { by: '  ', at: '2026-10-01', confirmUnchanged: true }).ok).toBe(false);
  });

  it('refuses an unedited draft unless --confirm-unchanged, and says so in the record when confirmed', () => {
    const text = draftText(draftOf());
    const refused = acceptDraft(text, { by: 'N. Reviewer', at: '2026-10-01' });
    expect(refused.ok).toBe(false);
    expect((refused as { refusals: string[] }).refusals.join()).toMatch(/unchanged/);
    const ok = acceptDraft(text, { by: 'N. Reviewer', at: '2026-10-01', confirmUnchanged: true });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.sentences).toHaveLength(5);
      expect(ok.sentences[0]).toMatchObject({ checkedBy: 'N. Reviewer', checkedAt: '2026-10-01', stratum: 'stage0', tokenizedBy: expect.stringMatching(/confirmed unchanged/) });
    }
  });

  it('accepts a corrected draft: gold rows with checkedBy / checkedAt, held-out carried, round-trips through JSON Lines', () => {
    const d = draftOf({ heldOut: true });
    const e0 = d.entries[0];
    // a person moves one boundary: remove the first "|" of the first sentence (or add one when there is none)
    const line = draftText(d).split('\n').find((l) => l.replace(/\|/gu, '') === e0.text) as string;
    const edited = line.includes('|') ? line.replace('|', '') : e0.text.slice(0, 3) + '|' + e0.text.slice(3);
    const r = acceptDraft(draftText(d).replace(line, edited), { by: 'N. Reviewer', at: '2026-10-01' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.heldOut).toBe(5);
    expect(r.sentences.every((s) => s.heldOut === true && s.checkedBy === 'N. Reviewer')).toBe(true);
    expect(r.sentences[0].tokenizedBy).toMatch(/corrected by hand/);
    expect(r.sentences[0].boundaries).not.toEqual(e0.boundaries);
    expect(parseGoldJsonl(toJsonl(r.sentences))).toEqual({ sentences: r.sentences, problems: [] });
  });

  it('refuses invalid boundaries, malformed drafts and a missing stratum or source', () => {
    const d = draftOf();
    const e0 = d.entries[0];
    const bad = draftText(d).split('\n').map((l) => (l.replace(/\|/gu, '') === e0.text ? e0.text.slice(0, 1) + '|' + e0.text.slice(1) : l)).join('\n');
    // cut at 1 splits ฉ from its vowel sign ั
    const r1 = acceptDraft(bad, { by: 'N', at: '2026-10-01' });
    expect(r1.ok).toBe(false);
    expect((r1 as { refusals: string[] }).refusals.join()).toMatch(/bad|before a Thai vowel|cluster/);
    expect(acceptDraft(fixed(d, '## stratum: stage0', '## stratum: nowhere'), { by: 'N', at: '2026-10-01', confirmUnchanged: true }).ok).toBe(false);
    expect(acceptDraft(fixed(d, '## source-rights: rights-safe', '## source-rights: public'), { by: 'N', at: '2026-10-01', confirmUnchanged: true }).ok).toBe(false);
    expect(acceptDraft('## stratum: stage0\n', { by: 'N', at: '2026-10-01', confirmUnchanged: true }).ok).toBe(false);
    expect(acceptDraft(fixed(d, '# ' + d.entries[1].id, '# ' + d.entries[0].id), { by: 'N', at: '2026-10-01' }).ok).toBe(false); // duplicate id
  });
});

describe('status', () => {
  const row = (id: string, stratum: string, checked: boolean, heldOut = false): GoldSentence => ({
    id, lang: 'th', stratum, text: 'ตาตา', boundaries: [2], source: SOURCE, tokenizedBy: 't',
    ...(checked ? { checkedBy: 'N', checkedAt: '2026-10-01' } : {}), ...(heldOut ? { heldOut: true } : {}),
  });

  it('counts checked sentences per course stratum, ignores the Wiktionary strata, names the empty strata', () => {
    const s = goldStatus([row('a', 'stage0', true), row('b', 'stage0', true, true), row('c', 'chotmai', false), row('d', 'wiktionary-example', true)]);
    expect(s.strata.find((x) => x.stratum === 'stage0')).toEqual({ stratum: 'stage0', checked: 2, heldOut: 1, unchecked: 0 });
    expect(s.strata.find((x) => x.stratum === 'chotmai')).toEqual({ stratum: 'chotmai', checked: 0, heldOut: 0, unchecked: 1 });
    expect(s.checkedTotal).toBe(2);
    expect(s.heldOutTotal).toBe(1);
    expect(s.emptyStrata).toHaveLength(7);
    expect(s.emptyStrata).toContain('chotmai');
    expect(s.vsTarget).toBe('below');
    expect(s.missingToMin).toBe(498);
  });

  it('an empty set is below target with every stratum empty', () => {
    const s = goldStatus([]);
    expect(s.emptyStrata).toHaveLength(8);
    expect(s.checkedTotal).toBe(0);
  });
});

// ───────────────────────────── the command-line tools ─────────────────────────────

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, script, ...args], { encoding: 'utf8', cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-bench-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('npm scripts', () => {
  it('gold:accept refuses without --by and writes nothing', () => {
    const draft = path.join(tmp, 'x.s1.draft.txt');
    fs.writeFileSync(draft, draftText(draftOf()), 'utf8');
    const r = run('scripts/gold-accept.mts', draft, '--confirm-unchanged');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/--by/);
    expect(fs.readdirSync(tmp)).toEqual(['x.s1.draft.txt']);
  }, 180_000);

  it('gold:accept refuses an unedited draft, accepts it with --confirm-unchanged to --out, and will not overwrite', () => {
    const draft = path.join(tmp, 'y.s1.draft.txt');
    fs.writeFileSync(draft, draftText(draftOf({ heldOut: true })), 'utf8');
    const out = path.join(tmp, 'y.gold.jsonl');
    expect(run('scripts/gold-accept.mts', draft, '--by', 'N. Reviewer', '--out', out).status).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
    const ok = run('scripts/gold-accept.mts', draft, '--by', 'N. Reviewer', '--confirm-unchanged', '--out', out);
    expect(ok.status, ok.out).toBe(0);
    expect(ok.out).toMatch(/5 sentences accepted for stratum stage0 \(5 held out\)/);
    expect(ok.out).not.toMatch(/ฉัน/u); // sentence text is never printed
    expect(parseGoldJsonl(fs.readFileSync(out, 'utf8')).problems).toEqual([]);
    expect(run('scripts/gold-accept.mts', draft, '--by', 'N. Reviewer', '--confirm-unchanged', '--out', out).status).toBe(1);
  }, 180_000);

  it('bench:words scores a gold file, keeps the errors file, skips held-out rows unless asked, and prints no held-out text', () => {
    const plain = { id: 'p1', lang: 'th', stratum: 'stage0', text: 'ตอนนี้ฉันรักพระเจ้า', boundaries: [], source: SOURCE, tokenizedBy: 'test' };
    const held = { ...plain, id: 'h1', text: 'ผมอยู่บ้านนี้', heldOut: true };
    const dir = path.join(tmp, 'gold');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.gold.jsonl'), toJsonl([plain as unknown as GoldSentence, held as unknown as GoldSentence]), 'utf8');
    const ord = run('scripts/bench-words.mts', '--gold', dir, '--systems', 'adapter,icu');
    expect(ord.status, ord.out).toBe(0);
    expect(ord.out).toMatch(/1 sentences from 1 gold file/);
    expect(ord.out).toMatch(/adapter {2}\[course\]/);
    expect(fs.existsSync(path.join(dir, 'errors', 'adapter.errors.jsonl'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'errors', 'adapter.errors.jsonl'), 'utf8')).not.toMatch(/ผมอยู่/u);
    const ho = run('scripts/bench-words.mts', '--gold', dir, '--systems', 'adapter', '--held-out');
    expect(ho.status, ho.out).toBe(0);
    expect(ho.out).toMatch(/1 held-out sentences/);
    expect(ho.out).not.toMatch(/ผม/u);
    expect(fs.existsSync(path.join(dir, 'errors', 'adapter.heldout.errors.jsonl'))).toBe(true);
    expect(run('scripts/bench-words.mts', '--gold', path.join(tmp, 'nothing-here')).status).toBe(1);
  }, 180_000);

  it('gold:status prints counts only', () => {
    const r = run('scripts/gold-status.mts', '--dir', path.join(tmp, 'gold'));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/stage0 +0 +0 +2 /);
    expect(r.out).toMatch(/checked in all: 0/);
    expect(r.out).not.toMatch(/ผม/u);
  }, 180_000);
});
