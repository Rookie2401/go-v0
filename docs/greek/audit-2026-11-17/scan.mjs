// Mechanical scan of the three built Greek indexes (read-only): the data behind the card. node --max-old-space-size=6000 scan.mjs
import fs from 'node:fs';
const P = 'C:/Users/CJWal/dev/go-v0/public/lexicon/el/';
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const hasLen = (s) => /[\u0304\u0306]/.test(s.normalize('NFD'));
const bare = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase();
const XREF = /^(?:[A-Z][a-z-]+(?:,? (?:and|or) [A-Z][a-z-]+)* (?:prose |poetic )?form of|alternative (?:form|spelling) of|synonym of|(?:first|second|third)-person|inflection of|.{0,30}\bform of\b)/;

for (const [file, name] of [['koine-index.json', 'KOINE (MorphGNT, full)'], ['ancient-index.json', 'ANCIENT (Wiktionary)'], ['modern-index.json', 'MODERN (Wiktionary)']]) {
  const idx = JSON.parse(fs.readFileSync(P + file, 'utf8'));
  const lemmas = Object.entries(idx.lemmas);
  const forms = Object.entries(idx.forms);
  log(`\n== ${name}: ${lemmas.length} lemmas, ${forms.length} form keys, ${forms.reduce((s, [, r]) => s + r.length, 0)} readings`);
  const noGloss = lemmas.filter(([, r]) => !r[1]);
  const lenHead = lemmas.filter(([, r]) => hasLen(r[0]));
  const xref = lemmas.filter(([, r]) => r[1] && XREF.test(r[1]));
  log(`   lemma rows with no gloss: ${noGloss.length}; headword carries a macron or breve: ${lenHead.length} (of these with no gloss: ${lenHead.filter(([, r]) => !r[1]).length}); gloss is a cross-reference ("… form of …"): ${xref.length}`);
  log(`   examples no gloss: ${noGloss.slice(0, 12).map(([, r]) => r[0]).join(', ')}`);
  log(`   examples cross-reference gloss: ${xref.slice(0, 10).map(([, r]) => `${r[0]} = ${r[1].slice(0, 40)}`).join(' | ')}`);
  // duplicate headwords: the same word once with and once without length marks
  const byBareHead = new Map();
  for (const [id, r] of lemmas) { const k = `${r[0].normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC')}|${r[2]}`; (byBareHead.get(k) ?? byBareHead.set(k, []).get(k)).push(id); }
  const dup = [...byBareHead.entries()].filter(([, ids]) => ids.length > 1 && ids.some((id) => hasLen(idx.lemmas[id][0])) && ids.some((id) => !hasLen(idx.lemmas[id][0])));
  log(`   words that are two lemma rows (one headword with length marks, one without): ${dup.length}; e.g. ${dup.slice(0, 8).map(([k, ids]) => ids.map((id) => idx.lemmas[id][0]).join(' / ')).join('; ')}`);
  const posCount = {};
  for (const [, r] of lemmas) posCount[r[2]] = (posCount[r[2]] ?? 0) + 1;
  log(`   lemmas by part of speech: ${JSON.stringify(posCount)}`);
  if (idx.codes !== 'kaikki-tags') continue;
  let rows = 0, impf = 0, plup = 0, perfHeader = 0, past = 0, pastNoTense = 0, dependent = 0, citation = 0, alt = 0, noFeat = 0;
  const headers = {};
  const unknownTags = {};
  const KNOWN = new Set(['first-person', 'second-person', 'third-person', 'singular', 'dual', 'plural', 'masculine', 'feminine', 'neuter', 'nominative', 'genitive', 'dative', 'accusative', 'vocative', 'active', 'middle', 'passive', 'mediopassive', 'middle-passive', 'indicative', 'subjunctive', 'optative', 'imperative', 'infinitive', 'participle', 'present', 'imperfect', 'future', 'aorist', 'perfect', 'pluperfect', 'future-perfect', 'imperfective', 'perfective', 'comparative', 'superlative', 'adverbial', 'citation-form', 'alternative']);
  const nomSg = new Map(); // lemma id -> set of nominative singular forms from undialected tables
  for (const [key, rs] of forms) for (const r of rs) {
    rows++;
    const tags = r[1] ? r[1].split('|') : [];
    if (tags.includes('citation-form')) { citation++; continue; }
    if (tags.includes('alternative')) { alt++; continue; }
    const header = tags.find((t) => t.startsWith('table:'));
    if (header) headers[header] = (headers[header] ?? 0) + 1;
    const h = (header ?? '').toLowerCase();
    if (h.includes('imperfect') && !h.includes('imperfective')) impf++;
    if (h.includes('pluperfect')) plup++;
    if (h.includes('perfect') && !h.includes('imperfect') && !h.includes('pluperfect')) perfHeader++;
    if (tags.includes('past')) { past++; if (!tags.includes('imperfect') && !tags.includes('aorist')) pastNoTense++; }
    if (tags.includes('dependent')) dependent++;
    for (const t of tags) if (!t.startsWith('table:') && !KNOWN.has(t)) unknownTags[t] = (unknownTags[t] ?? 0) + 1;
    if (tags.includes('nominative') && tags.includes('singular') && !tags.includes('dual') && !tags.includes('plural') && (!header || /^table:(Attic )?declension/.test(header)) && (idx.lemmas[r[0]]?.[2] === 'NOUN')) (nomSg.get(r[0]) ?? nomSg.set(r[0], new Set()).get(r[0])).add(key);
  }
  log(`   readings: ${rows}; citation-form rows ${citation}; alternative-form rows ${alt}`);
  log(`   table rows whose header holds "imperfect" (described as "imperfect or perfect"): ${impf}; "pluperfect" (described as "perfect or pluperfect"): ${plup}; other header with "perfect": ${perfHeader}`);
  log(`   rows tagged "past": ${past}; of these with no tense the adapter maps (shown with no tense): ${pastNoTense}; rows tagged "dependent" (not mapped): ${dependent}`);
  log(`   tags the adapter does not map, by count: ${Object.entries(unknownTags).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  log(`   table headers (top 25): ${Object.entries(headers).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t, n]) => `${t.slice(6)} ${n}`).join(', ')}`);
  // nouns whose table gives a nominative singular that is not the headword (another word's table filed under this lemma)
  const odd = [];
  for (const [id, set] of nomSg) {
    const head = bare(idx.lemmas[id][0]);
    const others = [...set].filter((f) => bare(f) !== head);
    if (others.length) odd.push(`${idx.lemmas[id][0]}: ${others.slice(0, 3).join(', ')}`);
  }
  log(`   NOUN lemmas whose undialected table has a nominative singular other than the headword: ${odd.length} of ${nomSg.size}; e.g. ${odd.slice(0, 40).join(' | ')}`);
  fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/elaudit/scan-odd-nomsg-${file.replace('.json', '')}.txt`, odd.join('\n'));
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/elaudit/scan.out', out.join('\n'));
