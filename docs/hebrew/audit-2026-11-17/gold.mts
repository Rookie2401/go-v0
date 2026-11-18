// The Tanakh read back through the adapter as the CARD reads it (parser/index.ts `pick`: the candidate with the highest confidence, ties in
// adapter order), against the Open Scriptures reading of that very token in the repository's own data (packages/biblia/public/data/he).
// Three registers of the same text: as printed (points + cantillation), points only (accents, meteg, paseq removed), consonants only.
// Usage: gold.mts <register: full|pointed|bare> <out file> [Book Book ...]   (no books = all 39)
import fs from 'node:fs';
import { adapter, bare, BIBLIA, loadFull, strip } from './lib.mts';
import { lemmaStem, lookupHebrewLemma } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/index-store';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
await loadFull();
const register = process.argv[2] as 'full' | 'pointed' | 'bare';
const outFile = process.argv[3]!;
const books = process.argv.slice(4).length ? process.argv.slice(4) : fs.readdirSync(BIBLIA).filter((f) => f.endsWith('.json') && f !== 'SOURCES.json').map((f) => f.replace('.json', ''));
const conv = register === 'full' ? (s: string) => s : register === 'pointed' ? strip : bare;
const pick = (cands: any[]): any => (cands.length ? cands.reduce((m, c) => (c.confidence > m.confidence ? c : m), cands[0]) : undefined);
const mainCode = (lemma: string, code: string): string => { const d = decodeOshb(lemma, code); return code.slice(1).split('/')[d.mainIndex] ?? ''; };
type Tot = { verses: number; skipped: number; tokens: number; none: number; exact: number; lemmaOnly: number; lemmaPosOnly: number; wrongLemma: number; wrongPos: number; stateOnly: number; homonym: number; notOshb: number; aramaicInHebrew: number; hebrewInAramaic: number; firstExact: number; firstLemma: number; several: number; unconf: number; periods: Record<string, number>; goldMissing: number; aramaicTokens: number; aramaicLemmaOk: number };
const mk = (): Tot => ({ verses: 0, skipped: 0, tokens: 0, none: 0, exact: 0, lemmaOnly: 0, lemmaPosOnly: 0, wrongLemma: 0, wrongPos: 0, stateOnly: 0, homonym: 0, notOshb: 0, aramaicInHebrew: 0, hebrewInAramaic: 0, firstExact: 0, firstLemma: 0, several: 0, unconf: 0, periods: {}, goldMissing: 0, aramaicTokens: 0, aramaicLemmaOk: 0 });
const all = mk();
const per: Record<string, Tot> = {};
const wrong = new Map<string, { n: number; where: string }>();
const lines: string[] = [];
for (const book of books) {
  const t = (per[book] = mk());
  const b = JSON.parse(fs.readFileSync(`${BIBLIA}/${book}.json`, 'utf8'));
  b.chapters.forEach((ch: any, ci: number) => {
    for (const v of ch.verses) {
      const text = conv(String(v.t).normalize('NFC'));
      const tokens = adapter.tokenize(text);
      const wordIdx = tokens.map((x: any, i: number) => (x.isWord ? i : -1)).filter((i: number) => i >= 0);
      t.verses++;
      if (wordIdx.length !== v.w.length) { t.skipped++; continue; }
      const an = adapter.analyze(tokens);
      const period = an[wordIdx[0]]?.candidates[0]?.notes?.period ?? 'none';
      t.periods[period] = (t.periods[period] ?? 0) + 1;
      wordIdx.forEach((ti: number, k: number) => {
        const gold = v.w[k];
        if (!gold) { t.goldMissing++; return; }
        t.tokens++;
        const [gl, gc] = gold;
        const gAram = gc[0] === 'A';
        if (gAram) t.aramaicTokens++;
        const cands = an[ti].candidates;
        const c = pick(cands);
        const first = cands[0];
        if (!c) { t.none++; return; }
        if (cands.length > 1) t.several++;
        if (c.unconfirmed) t.unconf++;
        const gid = lemmaStem(gl);
        const sameLemma = (x: any): boolean => x?.notes?.lemmaId === gid && (x?.notes?.source === 'oshb' || x?.sourceId === 'oshb-tanakh' || /oshb/.test(String(x?.sourceId)));
        const exactOf = (x: any): boolean => sameLemma(x) && x?.notes?.code === gc;
        if (exactOf(first)) t.firstExact++;
        if (sameLemma(first)) t.firstLemma++;
        const cAram = (c.varieties ?? []).includes('arc-bib');
        if (gAram && sameLemma(c)) t.aramaicLemmaOk++;
        if (exactOf(c)) { t.exact++; return; }
        const key = `${tokens[ti].normalized}\tshown ${c.lemma}/${c.pos}/${c.notes?.code ?? c.notes?.source}${cAram ? '/ARAMAIC' : ''}\tgold ${gl} ${gc}`;
        const e = wrong.get(key) ?? { n: 0, where: `${book} ${ci + 1}:${v.n}` };
        e.n++; wrong.set(key, e);
        if (sameLemma(c)) {
          t.lemmaOnly++;
          const sc = String(c.notes?.code ?? '');
          // only the state differs (absolute / construct / determined): one letter of the code, a ↔ c ↔ d
          const d = sc.length === gc.length ? [...sc].map((ch, i) => (ch !== gc[i] ? i : -1)).filter((i) => i >= 0) : [];
          if (d.length === 1 && /[acd]/.test(gc[d[0]]) && /[acd]/.test(sc[d[0]])) t.stateOnly++;
          return;
        }
        const goldRow = lookupHebrewLemma(gid);
        if (goldRow && c.notes?.source === 'oshb' && goldRow[0] === c.lemma && goldRow[2] === c.pos) { t.homonym++; return; }
        t.wrongLemma++;
        if (c.notes?.source !== 'oshb') t.notOshb++;
        if (cAram && !gAram) t.aramaicInHebrew++;
        if (!cAram && gAram) t.hebrewInAramaic++;
      });
    }
  });
  const pc = (n: number): string => (100 * n / Math.max(1, t.tokens)).toFixed(1);
  lines.push(`${book}\tverses ${t.verses} (skipped ${t.skipped})\ttokens ${t.tokens}\tno reading ${t.none} (${pc(t.none)} %)\tcard = gold ${pc(t.exact)} %\tright lemma, other form ${t.lemmaOnly} (${pc(t.lemmaOnly)} %; state only ${t.stateOnly})	other homonym number of the same headword ${t.homonym}\tWRONG LEMMA ${t.wrongLemma} (${pc(t.wrongLemma)} %)\tof which Aramaic shown in a Hebrew verse ${t.aramaicInHebrew}, not from OSHB ${t.notOshb}\tadapter-order first = gold ${pc(t.firstExact)} %\tseveral readings ${pc(t.several)} %\tunconfirmed ${t.unconf}\tperiods ${JSON.stringify(t.periods)}`);
  for (const k of Object.keys(all) as Array<keyof Tot>) { if (k === 'periods') { for (const [p, n] of Object.entries(t.periods)) all.periods[p] = (all.periods[p] ?? 0) + n; } else (all as any)[k] += (t as any)[k]; }
  console.log(lines[lines.length - 1]);
}
const pc = (n: number): string => (100 * n / Math.max(1, all.tokens)).toFixed(2);
const summary = `TOTAL [${register}] books ${books.length}; verses ${all.verses} (word count differs from the alignment, skipped: ${all.skipped}); tokens ${all.tokens}; no reading ${all.none} (${pc(all.none)} %); card = gold reading ${all.exact} (${pc(all.exact)} %); right lemma but another form ${all.lemmaOnly} (${pc(all.lemmaOnly)} %), of which only the state differs ${all.stateOnly}; same headword and part of speech but another homonym number ${all.homonym} (${pc(all.homonym)} %); WRONG LEMMA ${all.wrongLemma} (${pc(all.wrongLemma)} %) [Aramaic reading shown on a Hebrew token ${all.aramaicInHebrew}; Hebrew reading on an Aramaic token ${all.hebrewInAramaic}; reading not from OSHB ${all.notOshb}]; adapter-order first = gold ${all.firstExact} (${pc(all.firstExact)} %), first has gold lemma ${pc(all.firstLemma)} %; several readings ${pc(all.several)} %; unconfirmed ${all.unconf} (${pc(all.unconf)} %); Aramaic tokens ${all.aramaicTokens}, their lemma right ${all.aramaicLemmaOk}; periods ${JSON.stringify(all.periods)}`;
console.log(summary);
const top = [...wrong.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 400).map(([k, e]) => `${e.n}\t${k}\t(first at ${e.where})`);
fs.writeFileSync(outFile, [summary, '', ...lines, '', '== commonest card ≠ gold (count, form, shown, gold) ==', ...top].join('\n'));
