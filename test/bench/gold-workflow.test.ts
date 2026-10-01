import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { toJsonl } from '../../src/bench/gold/format';
import {
  frozenFiles, frozenSetsHolding, freezeSet, listFrozen, readManifest, setHashOf, verifyFrozen,
} from '../../src/bench/gold/freeze';
import type { GoldSentence } from '../../src/bench/gold/types';
import {
  acceptUnitsDraft, collectParagraphs, makeUnitsDraft, paragraphsOfDocument, paragraphsOfPlainText,
} from '../../src/bench/gold/units-tools';
import { parseJsonl, toJsonl as unitsToJsonl, unitsOf } from '../../src/bench/units/gold';
import { evaluateSystem } from '../../src/bench/words/metrics';
import { renderFrozenReport } from '../../src/bench/words/report';
import { adapterSystem } from '../../src/bench/words/systems';

const SOURCE = { title: 'A lawful test text', licence: 'test only', rights: 'rights-safe' as const };
const TOOLS = { goldTools: 'gold-tools@2', adapter: 'adapter-th@2', node: 'v0', icu: '1', unicode: '1' };
const NOW = '2026-10-01T10:00:00.000Z';

const word = (id: string, stratum: string, words: string[], extra: Partial<GoldSentence> = {}): GoldSentence => {
  let text = '';
  const boundaries: number[] = [];
  words.forEach((w, k) => { if (k > 0) boundaries.push(text.length); text += w; });
  return {
    id, lang: 'th', stratum, text, boundaries, source: SOURCE, tokenizedBy: 'hand',
    checkedBy: 'N. Reviewer', checkedAt: '2026-09-30', ...extra,
  };
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-gold-workflow-'));
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });
let counter = 0;
const newDir = (): string => { const d = path.join(tmpRoot, `d${++counter}`); fs.mkdirSync(d, { recursive: true }); return d; };
const put = (dir: string, rel: string, text: string): string => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
  return p;
};

/** A gold directory with two word files (one stratum each, one held-out row) and one units file. */
function seed(dir: string): void {
  put(dir, 'stage0/a.gold.jsonl', toJsonl([
    word('s1', 'stage0', ['ฉัน', 'รัก', 'พระเจ้า']),
    word('s2', 'stage0', ['ผม', 'อยู่', 'บ้าน'], { heldOut: true }),
  ]));
  put(dir, 'chotmai/b.gold.jsonl', toJsonl([word('c1', 'chotmai', ['แม่', 'ไป', 'ตลาด'], { checkedBy: 'Second Person', checkedAt: '2026-10-01' })]));
  const para = 'ฉันไปตลาดครับ ผมอยู่บ้าน';
  put(dir, 'units/u.units.jsonl', unitsToJsonl([{
    id: 'u1', lang: 'th', stratum: 'stage0', paragraph: para, unitBoundaries: [para.indexOf('ผม')], source: SOURCE,
    segmentedBy: 'hand', checkedBy: 'N. Reviewer', checkedAt: '2026-09-30',
  }]));
}

describe('freeze', () => {
  it('records files with sha256, counts per stratum, who checked and the tools; is deterministic', () => {
    const d = newDir();
    seed(d);
    const a = freezeSet(d, { id: 'first', now: NOW, tools: TOOLS });
    const b = freezeSet(d, { id: 'second', now: NOW, tools: TOOLS });
    expect(a.files.map((f) => f.path)).toEqual(['chotmai/b.gold.jsonl', 'stage0/a.gold.jsonl', 'units/u.units.jsonl']);
    expect(a.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(a.counts).toEqual({ words: { stage0: 2, chotmai: 1 }, wordsHeldOut: { stage0: 1 }, units: { stage0: 1 } });
    expect(a.checkedBy).toEqual([
      { name: 'N. Reviewer', firstDate: '2026-09-30', lastDate: '2026-09-30', rows: 3 },
      { name: 'Second Person', firstDate: '2026-10-01', lastDate: '2026-10-01', rows: 1 },
    ]);
    expect(a.tools).toEqual(TOOLS);
    // same content and selection: same set hash and the same manifest apart from the name
    expect(a.setHash).toBe(b.setHash);
    expect({ ...a, id: 'x' }).toEqual({ ...b, id: 'x' });
    expect(readManifest(d, 'first')).toEqual(a);
    expect(listFrozen(d).map((m) => m.id)).toEqual(['first', 'second']);
    expect(verifyFrozen(d, a)).toEqual([]);
  });

  it('the set hash depends on the selection and on the content', () => {
    const d = newDir();
    seed(d);
    const all = freezeSet(d, { id: 'all', now: NOW, tools: TOOLS });
    const one = freezeSet(d, { id: 'one', strata: ['stage0'], now: NOW, tools: TOOLS });
    const held = freezeSet(d, { id: 'held', heldOutOnly: true, now: NOW, tools: TOOLS });
    expect(new Set([all.setHash, one.setHash, held.setHash]).size).toBe(3);
    expect(one.files.map((f) => f.path)).toEqual(['stage0/a.gold.jsonl', 'units/u.units.jsonl']);
    expect(one.counts.words).toEqual({ stage0: 2 });
    expect(held.files.map((f) => f.path)).toEqual(['stage0/a.gold.jsonl']);
    expect(held.counts).toEqual({ words: { stage0: 1 }, wordsHeldOut: { stage0: 1 }, units: {} });
    expect(setHashOf(all.selection, all.files)).toBe(all.setHash);
  });

  it('refuses unchecked rows (a machine draft is never reference), an empty selection, a bad or reused name', () => {
    const d = newDir();
    put(d, 'stage0/a.gold.jsonl', toJsonl([word('s1', 'stage0', ['ตา', 'ตา']), word('s2', 'stage0', ['ตา', 'ตา'], { checkedBy: undefined, checkedAt: undefined })]));
    expect(() => freezeSet(d, { id: 'x' })).toThrow(/not been checked by a named person/);
    const e = newDir();
    expect(() => freezeSet(e, { id: 'x' })).toThrow(/nothing to freeze/);
    seed(e);
    expect(() => freezeSet(e, { id: 'Bad Name' })).toThrow(/--name/);
    freezeSet(e, { id: 'ok', now: NOW, tools: TOOLS });
    expect(() => freezeSet(e, { id: 'ok' })).toThrow(/already exists.*immutable/);
    expect(() => freezeSet(e, { id: 'none', strata: ['regional'] })).toThrow(/nothing to freeze/);
  });

  it('verification fails when a file changed, vanished, or the manifest was edited', () => {
    const d = newDir();
    seed(d);
    const m = freezeSet(d, { id: 'v', now: NOW, tools: TOOLS });
    expect(verifyFrozen(d, m)).toEqual([]);
    fs.appendFileSync(path.join(d, 'stage0/a.gold.jsonl'), '\n');
    expect(verifyFrozen(d, m).join()).toMatch(/stage0\/a\.gold\.jsonl: the file has changed since it was frozen/);
    fs.rmSync(path.join(d, 'chotmai/b.gold.jsonl'));
    expect(verifyFrozen(d, m).join()).toMatch(/chotmai\/b\.gold\.jsonl: the file is missing/);
    const edited = { ...m, files: m.files.slice(1) };
    expect(verifyFrozen(newDir(), edited).join()).toMatch(/manifest itself was edited/);
  });

  it('knows which files belong to a frozen set', () => {
    const d = newDir();
    seed(d);
    freezeSet(d, { id: 'f1', strata: ['chotmai'], now: NOW, tools: TOOLS });
    expect(frozenFiles(d).get('chotmai/b.gold.jsonl')).toEqual(['f1']);
    expect(frozenSetsHolding(d, path.join(d, 'chotmai/b.gold.jsonl'))).toEqual(['f1']);
    expect(frozenSetsHolding(d, path.join(d, 'stage0/a.gold.jsonl'))).toEqual([]);
  });
});

describe('report header', () => {
  it('names the frozen id and set hash, the date, who checked, the tool versions, the errors path, the mode', () => {
    const d = newDir();
    seed(d);
    const m = freezeSet(d, { id: 'rep', now: NOW, tools: TOOLS });
    const rows = [word('s1', 'stage0', ['ฉัน', 'รัก', 'พระเจ้า'])];
    const md = renderFrozenReport({
      date: '2026-10-02', manifest: m, heldOutRun: false, reports: [evaluateSystem(rows, adapterSystem)], errorsDir: 'x/errors/rep', patterns: 5,
      runTools: { ...TOOLS, icu: '99' },
    });
    expect(md).toMatch(/^# Word segmentation report: frozen set rep/);
    expect(md).toContain('Date of this run: 2026-10-02');
    expect(md).toContain(`set hash \`${m.setHash}\``);
    expect(md).toContain('N. Reviewer (3 rows, 2026-09-30)');
    expect(md).toContain('Second Person');
    expect(md).toContain('ICU 99');
    expect(md).toContain('(differs from the freeze: compare with care)');
    expect(md).toContain('`x/errors/rep/`');
    expect(md).toContain('ordinary rows; held-out rows were not used');
    expect(md).toContain('| stage0 | adapter |');
    expect(md).toContain('stage0/a.gold.jsonl');
    expect(md).toMatch(/Do not tune .* on them/);
  });

  it('a held-out run prints no error patterns (no sentence text) and says so', () => {
    const d = newDir();
    seed(d);
    const m = freezeSet(d, { id: 'ho', now: NOW, tools: TOOLS });
    const md = renderFrozenReport({
      date: '2026-10-02', manifest: m, heldOutRun: true, reports: [evaluateSystem([word('h', 'stage0', ['ตอน', 'นี้', 'ฉัน'])], adapterSystem)],
      errorsDir: 'e', patterns: 20, runTools: TOOLS,
    });
    expect(md).toContain('HELD-OUT rows only');
    expect(md).not.toContain('Most frequent error patterns');
  });
});

describe('reading-unit draft and accept', () => {
  const PARAS = [
    'ฉันไปตลาดครับ ผมอยู่บ้าน', 'แม่ไปตลาดนะ ลูกอยู่บ้าน', 'พ่อรักลูกค่ะ แม่รักพ่อ', 'เด็กกินข้าว\nแม่ทำงาน', 'บ้านของฉันอยู่ใกล้โรงเรียน',
  ];

  it('paragraphs come from a document or from plain text; unusable ones are counted', () => {
    expect(paragraphsOfDocument({ sections: [{ paragraphs: [{ text: 'ก ข' }, { sentences: [{ text: 'ตา' }, { text: 'ตา' }], separator: '' }] }] })).toEqual(['ก ข', 'ตาตา']);
    expect(paragraphsOfPlainText('ก\nข\n\nค')).toEqual(['ก\nข', 'ค']);
    expect(paragraphsOfPlainText('ก\nข')).toEqual(['ก', 'ข']);
    const c = collectParagraphs([' ตาตา ', 'ตาตา', 'abc', '#ตา', 'ตา␣ตา', 'éตา']);
    expect(c.paragraphs).toEqual(['ตาตา']);
    expect(c.skipped).toEqual({ notNfc: 1, forbiddenCharacter: 2, noThai: 1, duplicate: 1 });
  });

  it('the draft is deterministic, valid, never the same paragraph twice, and carries the adapter\'s boundaries', () => {
    const opt = { stratum: 'stage0', n: 3, seed: 1, source: SOURCE };
    const a = makeUnitsDraft(PARAS, opt);
    expect(makeUnitsDraft(PARAS, opt).cases.map((c) => c.id)).toEqual(a.cases.map((c) => c.id));
    expect(a.cases).toHaveLength(3);
    expect(a.cases.every((c) => c.segmentedBy.includes('unchecked machine draft') && c.checkedBy === undefined)).toBe(true);
    expect(makeUnitsDraft(PARAS, opt, new Set(a.cases.map((c) => c.id))).cases.some((c) => a.cases.some((x) => x.id === c.id))).toBe(false);
    expect(a.meta.cases).toEqual(a.cases);
    expect(() => makeUnitsDraft(PARAS, { ...opt, stratum: 'nope' })).toThrow(/unknown stratum/);
  });

  it('round trip: a person joins two units; accepted with a name, the paragraph is unchanged, checkedBy/At are set', () => {
    const draft = makeUnitsDraft([PARAS[0]], { stratum: 'stage0', n: 1, seed: 1, source: SOURCE });
    expect(draft.cases[0].unitBoundaries).toHaveLength(1);
    expect(draft.editing).toMatch(/^# units-stage0-[0-9a-f]{8} stage0\n/);
    const edited = draft.editing.replace('␣\n', '␣'); // join the two units (the space stays)
    const r = acceptUnitsDraft(edited, draft.meta, { by: 'N. Reviewer', at: '2026-10-01' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0]).toMatchObject({ paragraph: PARAS[0], unitBoundaries: [], checkedBy: 'N. Reviewer', checkedAt: '2026-10-01' });
    expect(r.cases[0].segmentedBy).toMatch(/corrected by hand/);
    expect(unitsOf(r.cases[0]).join('')).toBe(PARAS[0]);
    expect(parseJsonl(unitsToJsonl(r.cases))).toEqual(r.cases);
  });

  it('refuses without --by, an unchanged draft unless confirmed, changed text and a damaged sidecar; a removed paragraph is just not accepted', () => {
    const draft = makeUnitsDraft(PARAS.slice(0, 2), { stratum: 'stage0', n: 2, seed: 1, source: SOURCE });
    const at = '2026-10-01';
    const refusals = (x: ReturnType<typeof acceptUnitsDraft>) => (x.ok ? [] : x.refusals).join(' | ');
    expect(refusals(acceptUnitsDraft(draft.editing, draft.meta, { by: undefined, at, confirmUnchanged: true }))).toMatch(/--by/);
    expect(refusals(acceptUnitsDraft(draft.editing, draft.meta, { by: 'N', at }))).toMatch(/unchanged/);
    const ok = acceptUnitsDraft(draft.editing, draft.meta, { by: 'N', at, confirmUnchanged: true });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.cases[0].segmentedBy).toMatch(/confirmed unchanged/);
    expect(refusals(acceptUnitsDraft(draft.editing.replace('ตลาด', 'ตลาดX'), draft.meta, { by: 'N', at }))).toMatch(/no longer re-join/);
    const firstBlock = draft.editing.split('\n\n')[0] + '\n';
    // a paragraph the person removed from the file is simply not accepted
    const partial = acceptUnitsDraft(firstBlock, draft.meta, { by: 'N', at, confirmUnchanged: true });
    expect(partial.ok && partial.cases.length).toBe(1);
    expect(refusals(acceptUnitsDraft(draft.editing, undefined, { by: 'N', at }))).toMatch(/sidecar/);
  });
});

// ───────────────────────────── the command-line tools, end to end ─────────────────────────────

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, script, ...args], { encoding: 'utf8', cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('npm scripts, in a temporary gold directory', () => {
  const d = newDir();
  const text = put(d, 'book.txt', 'ฉันไปตลาดครับ ผมอยู่บ้าน\nแม่ไปตลาดนะ ลูกอยู่บ้าน\nพ่อรักลูกค่ะ แม่รักพ่อ\nเด็กกินข้าวทุกวัน\n\nบ้านของฉันอยู่ใกล้โรงเรียน\nวันนี้ฝนตกหนัก\n');

  it('gold:draft --kind units writes a draft and a sidecar, prints no text; gold:accept --kind units writes the units file', () => {
    const dr = run('scripts/gold-draft.mts', text, '--stratum', 'stage0', '--kind', 'units', '--n', '2', '--dir', d);
    expect(dr.status, dr.out).toBe(0);
    expect(dr.out).toMatch(/2 paragraphs drafted as reading units for stratum stage0/);
    expect(dr.out).not.toMatch(/ฉัน/u);
    const draft = fs.readdirSync(path.join(d, 'units')).find((f) => f.endsWith('.units-draft.txt')) as string;
    expect(fs.existsSync(path.join(d, 'units', `${draft}.meta.json`))).toBe(true);
    const draftPath = path.join(d, 'units', draft);
    expect(run('scripts/gold-accept.mts', draftPath, '--kind', 'units', '--dir', d, '--confirm-unchanged').status).toBe(1); // no --by
    expect(run('scripts/gold-accept.mts', draftPath, '--kind', 'units', '--dir', d, '--by', 'N. Reviewer').status).toBe(1); // unchanged
    const ok = run('scripts/gold-accept.mts', draftPath, '--kind', 'units', '--dir', d, '--by', 'N. Reviewer', '--confirm-unchanged');
    expect(ok.status, ok.out).toBe(0);
    expect(ok.out).toMatch(/2 paragraphs accepted as reading units/);
    const out = path.join(d, 'units', draft.replace('.units-draft.txt', '.units.jsonl'));
    const cases = parseJsonl(fs.readFileSync(out, 'utf8'));
    expect(cases.map((c) => c.checkedBy)).toEqual(['N. Reviewer', 'N. Reviewer']);
    // a second draft does not offer the paragraphs already accepted (here that leaves none)
    const again = run('scripts/gold-draft.mts', text, '--stratum', 'stage0', '--kind', 'units', '--n', '10', '--seed', '2', '--dir', d);
    expect(again.status).toBe(1);
    expect(again.out).toMatch(/no paragraphs left to sample/);
  }, 240_000);

  it('gold:draft/accept words, then gold:freeze, gold:status, bench:words --frozen with a report, and the immutability refusals', () => {
    const dr = run('scripts/gold-draft.mts', text, '--stratum', 'stage0', '--n', '4', '--held-out', '--dir', d);
    expect(dr.status, dr.out).toBe(0);
    expect(dr.out).toMatch(/HELD OUT: not shown/);
    const draftPath = path.join(d, 'stage0', fs.readdirSync(path.join(d, 'stage0')).find((f) => f.endsWith('.draft.txt')) as string);
    const gold = path.join(d, 'stage0', 'book.s1.heldout.gold.jsonl');
    const acc = run('scripts/gold-accept.mts', draftPath, '--by', 'N. Reviewer', '--confirm-unchanged', '--dir', d);
    expect(acc.status, acc.out).toBe(0);
    expect(fs.existsSync(gold)).toBe(true);
    // nothing checked is frozen before it exists; freeze the whole directory (words + units)
    const fr = run('scripts/gold-freeze.mts', '--name', 'v1', '--dir', d);
    expect(fr.status, fr.out).toBe(0);
    expect(fr.out).toMatch(/frozen "v1" \(set hash [0-9a-f]{64}\)/);
    expect(fr.out).toMatch(/sentences:\s+stage0 4/);
    expect(fr.out).toMatch(/held out:\s+stage0 4/);
    expect(fr.out).not.toMatch(/ฉัน/u);
    expect(run('scripts/gold-freeze.mts', '--name', 'v1', '--dir', d).status).toBe(1); // immutable name
    expect(run('scripts/gold-freeze.mts', '--verify', 'v1', '--dir', d).out).toMatch(/verified/);
    const st = run('scripts/gold-status.mts', '--dir', d);
    expect(st.status, st.out).toBe(0);
    expect(st.out).toMatch(/reading units: 2 checked paragraph/);
    expect(st.out).toMatch(/frozen sets: v1 /);

    // accept refuses to write into a frozen file, even with --overwrite
    const again = run('scripts/gold-accept.mts', draftPath, '--by', 'N. Reviewer', '--confirm-unchanged', '--dir', d, '--overwrite');
    expect(again.status).toBe(1);
    expect(again.out).toMatch(/belongs to the frozen set\(s\) v1|already in the gold set/);

    // a held-out-only... the freeze includes held-out rows: ordinary run has none, an explicit held-out run has 4
    const none = run('scripts/bench-words.mts', '--frozen', 'v1', '--gold', d, '--systems', 'adapter');
    expect(none.status).toBe(1);
    expect(none.out).toMatch(/no \(non held-out\) sentences/);
    const rep = path.join(d, 'reports', 'out.md');
    const ho = run('scripts/bench-words.mts', '--frozen', 'v1', '--gold', d, '--systems', 'adapter,icu', '--held-out', '--report', rep);
    expect(ho.status, ho.out).toBe(0);
    expect(ho.out).toMatch(/frozen set: v1, set hash [0-9a-f]{64} \(all file hashes verified\)/);
    expect(ho.out).not.toMatch(/ฉัน/u);
    const md = fs.readFileSync(rep, 'utf8');
    expect(md).toMatch(/frozen set v1/);
    expect(md).toMatch(/HELD-OUT rows only/);
    expect(md).toMatch(/\| \*\*all\*\* \| adapter \|/);
    expect(fs.existsSync(path.join(d, 'errors', 'v1', 'adapter.heldout.errors.jsonl'))).toBe(true);
    // the default report path is under reports/
    const def = run('scripts/bench-words.mts', '--frozen', 'v1', '--gold', d, '--systems', 'adapter', '--held-out', '--report');
    expect(def.status, def.out).toBe(0);
    expect(def.out).toMatch(/report written to .*\/reports\/v1-\d{4}-\d{2}-\d{2}-heldout\.md/);

    // changing a frozen file makes the benchmark refuse to run, naming the file
    fs.appendFileSync(gold, '\n');
    const bad = run('scripts/bench-words.mts', '--frozen', 'v1', '--gold', d, '--systems', 'adapter', '--held-out');
    expect(bad.status).toBe(1);
    expect(bad.out).toMatch(/refuses to run/);
    expect(bad.out).toMatch(/book\.s1\.heldout\.gold\.jsonl: the file has changed since it was frozen/);
    expect(run('scripts/gold-freeze.mts', '--verify', 'v1', '--dir', d).status).toBe(1);
  }, 300_000);

  it('a frozen set of held-out rows only needs --held-out; --report needs --frozen', () => {
    const e = newDir();
    seed(e);
    expect(run('scripts/gold-freeze.mts', '--name', 'h', '--held-out-only', '--dir', e).status).toBe(0);
    const plain = run('scripts/bench-words.mts', '--frozen', 'h', '--gold', e, '--systems', 'adapter');
    expect(plain.status).toBe(1);
    expect(plain.out).toMatch(/held-out sentences only: run it with --held-out/);
    expect(run('scripts/bench-words.mts', '--frozen', 'h', '--gold', e, '--systems', 'adapter', '--held-out').status).toBe(0);
    const norep = run('scripts/bench-words.mts', '--gold', e, '--systems', 'adapter', '--report', path.join(e, 'x.md'));
    expect(norep.status).toBe(1);
    expect(norep.out).toMatch(/--report needs --frozen/);
  }, 240_000);
});
