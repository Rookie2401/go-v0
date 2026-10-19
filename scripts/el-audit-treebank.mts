/// <reference types="node" />
/**
 * npm run el:audit-treebank -- [--tokens 3000] [--texts tlg0012.tlg001,…]
 *
 * Audits adapter-el against the Perseus Ancient Greek Dependency Treebank 2.1 (data/raw/perseus-treebank, CC BY-SA 3.0), an INDEPENDENT
 * gold: for each chosen text the first N tokens are read sentence by sentence with the full Koine, Ancient and Modern indexes installed,
 * and the adapter's FIRST reading is compared with the treebank's lemma and part of speech. Reported per text: coverage (a reading at all),
 * lemma agreement, POS agreement, both-agree, how the sentences' period was decided, and the commonest disagreements. Nothing is tuned here.
 *
 * Writes docs/greek/TREEBANK-AUDIT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { elAdapter } from '../src/adapters/el';
import { installGreekIndex, type GreekFormIndex } from '../src/adapters/greek/index-store';
import { elKey, bare } from '../src/adapters/greek/text';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (args[i].startsWith('--') && args[i + 1] !== undefined) opt[args[i].slice(2)] = args[i + 1]; }
const MAX = Number(opt.tokens ?? 3000);
const dir = 'data/raw/perseus-treebank/extracted/treebank_data-master/v2.1/Greek/texts';
const TEXTS: Array<{ file: string; title: string; expect: string }> = [
  { file: 'tlg0012.tlg001.perseus-grc1.tb.xml', title: 'Homer, Iliad', expect: 'el-hom' },
  { file: 'tlg0012.tlg002.perseus-grc1.tb.xml', title: 'Homer, Odyssey', expect: 'el-hom' },
  { file: 'tlg0059.tlg001.perseus-grc1.tb.xml', title: 'Plato, Euthyphro', expect: 'el-att' },
  { file: 'tlg0003.tlg001.perseus-grc1.1.tb.xml', title: 'Thucydides, Histories 1', expect: 'el-att' },
  { file: 'tlg0016.tlg001.perseus-grc1.1.tb.xml', title: 'Herodotus, Histories 1 (Ionic)', expect: 'el-att' },
  { file: 'tlg0011.tlg004.perseus-grc1.tb.xml', title: 'Sophocles, Oedipus Tyrannus', expect: 'el-att' },
  { file: 'tlg0543.tlg001.perseus-grc1.tb.xml', title: 'Polybius, Histories 1 (Hellenistic Koine)', expect: 'el-att or el-koi: not told apart by vocabulary' },
  { file: 'tlg0007.tlg015.perseus-grc1.tb.xml', title: 'Plutarch, Alcibiades (literary Koine)', expect: 'el-att or el-koi: not told apart by vocabulary' },
];
const chosen = opt.texts ? TEXTS.filter((t) => opt.texts.split(',').some((p) => t.file.startsWith(p))) : TEXTS;

for (const [lang, file] of [['el', 'koine-index.json'], ['el', 'ancient-index.json'], ['el', 'modern-index.json']]) {
  const p = path.join('public', 'lexicon', lang, file);
  if (!fs.existsSync(p)) { console.error(`missing ${p}: build it first`); process.exit(1); }
  installGreekIndex(JSON.parse(fs.readFileSync(p, 'utf8')) as GreekFormIndex);
}

/** The treebank's postag first letter → UPOS (its tagset: n noun, v verb, a adjective, d adverb, l article, g particle, c conjunction, r preposition, p pronoun, m numeral, i interjection, e exclamation, u punctuation). */
const POS: Record<string, string> = { n: 'NOUN', v: 'VERB', a: 'ADJ', d: 'ADV', l: 'DET', g: 'PART', c: 'CONJ', r: 'ADP', p: 'PRON', m: 'NUM', i: 'INTJ', e: 'INTJ', u: 'PUNCT', x: 'X' };
const attr = (s: string, name: string): string | undefined => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(s); return m ? m[1] : undefined; };

interface Row { text: string; tokens: number; covered: number; lemmaOk: number; posOk: number; bothOk: number; periods: Record<string, number>; expect: string; worst: Array<[string, number]>; samples: string[] }
const rows: Row[] = [];
for (const t of chosen) {
  const xml = fs.readFileSync(path.join(dir, t.file), 'utf8');
  const sentences = xml.split(/<sentence /).slice(1);
  const row: Row = { text: t.title, tokens: 0, covered: 0, lemmaOk: 0, posOk: 0, bothOk: 0, periods: {}, expect: t.expect, worst: [], samples: [] };
  const miss = new Map<string, number>();
  for (const s of sentences) {
    if (row.tokens >= MAX) break;
    const words = [...s.matchAll(/<word [^>]*\/>/g)].map((m) => m[0]).map((w) => ({ form: attr(w, 'form') ?? '', lemma: attr(w, 'lemma') ?? '', postag: attr(w, 'postag') ?? '' }))
      .filter((w) => w.form && !/^[\p{P}\p{S}]+$/u.test(w.form) && w.postag[0] !== 'u');
    if (!words.length) continue;
    // the sentence as the treebank's tokens joined (its own tokenisation: elided forms stand with their apostrophe)
    const text = words.map((w) => w.form).join(' ');
    const tokens = elAdapter.tokenize(text);
    const analysed = elAdapter.analyze(tokens);
    const wordTokens = tokens.map((tk, i) => [tk, analysed[i]] as const).filter(([tk]) => tk.isWord);
    // align by order: the adapter splits an elision mark off (δ᾽ → δ + ᾽), so the word tokens line up with the treebank words one to one
    if (wordTokens.length !== words.length) { row.samples.push(`[skip: ${words.length} treebank words vs ${wordTokens.length} tokens] ${text.slice(0, 60)}`); continue; }
    const period = analysed.find((a) => a.candidates.length)?.candidates[0]?.notes?.period;
    if (typeof period === 'string') row.periods[period] = (row.periods[period] ?? 0) + 1;
    words.forEach((w, i) => {
      row.tokens++;
      const top = wordTokens[i][1].candidates[0];
      if (!top) { miss.set(`∅ ${w.form} (${w.lemma})`, (miss.get(`∅ ${w.form} (${w.lemma})`) ?? 0) + 1); return; }
      row.covered++;
      const goldLemma = elKey(w.lemma.replace(/\d+$/, ''));
      const gotLemma = elKey(top.lemma ?? '');
      const lemmaOk = gotLemma === goldLemma || bare(gotLemma) === bare(goldLemma);
      const goldPos = POS[w.postag[0]] ?? 'X';
      const gotPos = top.pos === 'PROPN' ? 'NOUN' : top.pos === 'SCONJ' ? 'CONJ' : top.pos ?? 'X';
      const posOk = gotPos === goldPos || (goldPos === 'ADJ' && gotPos === 'NUM') || (goldPos === 'PRON' && gotPos === 'DET') || (goldPos === 'DET' && gotPos === 'PRON');
      if (lemmaOk) row.lemmaOk++;
      if (posOk) row.posOk++;
      if (lemmaOk && posOk) row.bothOk++;
      if (!lemmaOk) { const k = `${w.form}: got ${top.lemma} (${top.pos}), gold ${w.lemma} (${goldPos})`; miss.set(k, (miss.get(k) ?? 0) + 1); }
    });
  }
  row.worst = [...miss].sort((a, b) => b[1] - a[1]).slice(0, 12);
  rows.push(row);
  console.log(`${t.title}: ${row.tokens} tokens, covered ${(100 * row.covered / row.tokens).toFixed(1)} %, lemma ${(100 * row.lemmaOk / row.tokens).toFixed(1)} %, POS ${(100 * row.posOk / row.tokens).toFixed(1)} %, periods ${JSON.stringify(row.periods)}`);
}

const pct = (a: number, b: number): string => `${(100 * a / Math.max(1, b)).toFixed(1)} %`;
const doc = `# Greek: audit against the Perseus treebank — ${new Date().toISOString().slice(0, 10)}

Independent gold: the Ancient Greek Dependency Treebank 2.1 (Perseus, CC BY-SA 3.0; \`data/raw/perseus-treebank\`). For each text the first
${MAX} tokens were read sentence by sentence by adapter-el@${elAdapter.version} with the full Koine, Ancient and Modern indexes installed; the adapter's
FIRST reading is compared with the treebank's lemma (accents folded; the treebank's homograph numbers dropped) and part of speech (its tagset
mapped to UPOS; a name counts as a noun, an article as a determiner or pronoun). There is no parser: a form with several readings in the
chosen period keeps them all and the commonest-attested one is first, so "lemma" here is the first-reading figure of a dictionary lookup
ordered by attestation, not a disambiguation result. Nothing was tuned on these texts.

| text | tokens | covered | lemma = gold | POS = gold | both | sentences read as (expected ${'`'}period${'`'}) |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.text} | ${r.tokens} | ${pct(r.covered, r.tokens)} | ${pct(r.lemmaOk, r.tokens)} | ${pct(r.posOk, r.tokens)} | ${pct(r.bothOk, r.tokens)} | ${Object.entries(r.periods).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')} (${r.expect}) |`).join('\n')}

## Commonest disagreements (first reading ≠ treebank lemma) and uncovered forms, per text

${rows.map((r) => `### ${r.text}\n${r.worst.map(([k, n]) => `- ${n}× ${k}`).join('\n')}${r.samples.length ? `\n- skipped sentences (token count mismatch): ${r.samples.length}` : ''}`).join('\n\n')}

Reading the numbers: "covered" is what the indexes hold for the written form; a Homeric form absent from every Wiktionary table (dialectal
spellings, rare compounds, proper names) is uncovered and gets NO reading. A lemma disagreement is often a true homograph the sentence does
not decide (ἦ, ἥ, ἡ; τε; οἱ), a differently cited lemma (the treebank's εἰμί1 vs εἰμί, Wiktionary's citation of a deponent), or a name read as a
common noun; each kind is visible in the lists above. POS agreement is reported separately because it is what the card's Form line states.
`;
fs.mkdirSync('docs/greek', { recursive: true });
fs.writeFileSync('docs/greek/TREEBANK-AUDIT.md', doc);
console.log('wrote docs/greek/TREEBANK-AUDIT.md');
