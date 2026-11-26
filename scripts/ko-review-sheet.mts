/// <reference types="node" />
/**
 * npm run ko:review-sheet -- [--out C:/Users/CJWal/dev/tmp-mem/ko-review] [--per-file 900]
 *
 * A review sheet of every entry of the COMPILED CORE (src/adapters/korean/generated/core.ts), for a review of the first meanings: one entry
 * per line, TAB-separated, in files sheet-01.tsv, sheet-02.tsv ... of about 900 entries:
 *   id | headword with its entry label | shared class | count in the priors corpus | the first meaning the card shows today (after overrides)
 *   | decided by a hand override or an own gloss (yes/no) | the source's senses in order, numbered (the numbers an override uses), each with its
 *   tags in brackets, " ;; " between senses, at most 8.
 * The senses come from the same reading of the Wiktionary extract as the lexicon build (src/dict/korean.ts). Deterministic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { KO_CORE } from '../src/adapters/korean/generated/core';
import { koHomonymLemma, koSharedPos, type KoLexEntry } from '../src/adapters/korean/index-store';
import { koBuildRows, koDistinctSenses, koLoadDocs, koReadSlim } from '../src/dict/korean';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const OUT = opt.out ?? 'C:/Users/CJWal/dev/tmp-mem/ko-review';
const PER = Number(opt['per-file'] ?? 900);
const INPUT = opt.in ?? 'data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl';

const { rows } = koBuildRows(await koReadSlim(INPUT), koLoadDocs());
const key = (e: { lemma: string; tag: string; clf?: boolean; hom?: number }): string => `${e.lemma}\u0000${e.tag}\u0000${e.clf ? 1 : 0}\u0000${e.hom ?? 0}`;
const byKey = new Map(rows.map((r) => [key(r), r]));

const entries: KoLexEntry[] = [];
const seen = new Set<string>();
for (const list of Object.values(KO_CORE.entries)) for (const e of list) { const k = key(e); if (!seen.has(k)) { seen.add(k); entries.push(e); } }
entries.sort((a, b) => (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0) || (a.hom ?? 0) - (b.hom ?? 0) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

const clean = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim();
const lines: string[] = [];
const stats = { one: 0, twoDecided: 0, twoOpen: 0, noRow: 0 };
entries.forEach((e, i) => {
  const r = byKey.get(key(e));
  if (!r) stats.noRow++;
  const senses = (r?.senseTexts ?? []).slice(0, 8).map((s, j) => `${j + 1}. ${clean(s.full).slice(0, 160)}${s.tags?.length ? ` [${s.tags.join(', ')}]` : ''}`).join(' ;; ');
  const decided = !!(r && (r.decided || r.glossOwn || r.own));
  const distinct = koDistinctSenses(r?.liveKeys ?? []);
  if (distinct < 2) stats.one++; else if (decided) stats.twoDecided++; else stats.twoOpen++;
  lines.push([`ko-${String(i + 1).padStart(5, '0')}`, `${koHomonymLemma(e.lemma, e.hom)}${e.set ? ` (${e.set})` : ''}`, koSharedPos(e) ?? e.tag, String(e.n ?? 0), clean(e.gloss ?? ''), decided ? 'yes' : 'no', senses].join('\t'));
});

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^sheet-\d+\.tsv$/.test(f)) fs.rmSync(path.join(OUT, f));
const files = Math.ceil(lines.length / PER);
for (let f = 0; f < files; f++) fs.writeFileSync(path.join(OUT, `sheet-${String(f + 1).padStart(2, '0')}.tsv`), `${lines.slice(f * PER, (f + 1) * PER).join('\n')}\n`);
console.log(`${files} files, ${lines.length} entries in ${OUT}; one distinct sense ${stats.one}, two or more with an override or own gloss ${stats.twoDecided}, two or more without ${stats.twoOpen}; core entries with no source row ${stats.noRow}`);
