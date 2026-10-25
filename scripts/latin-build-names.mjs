#!/usr/bin/env node
/**
 * Builds src/adapters/latin/lexicon-names-data.ts: the proper names of the Clementine Vulgate that Whitaker's Words and the Lewis & Short
 * backstop do not decline, as noun rows in the lexicon's own line format (`N \t lemma \t genitive \t gender[flags] \t count \t gloss`),
 * taken from the Wiktionary (kaikki.org extract) entries whose part of speech is `name`.
 *
 * Why: 60 % of the Vulgate's unconfirmed words were names (Edom, Jordanis, Lachis, Joppen, Noëmi, Adonias, Sodomorum: docs/latin/EVAL.md,
 * "What the unconfirmed and missing words look like"). Whitaker lists some of them undeclined (Iordanes, Ioppe) and lacks most; Wiktionary
 * has the declension table and a gloss. Only names attested in the Vulgate are kept (a Wiktionary form of the entry, folded, occurs
 * capitalised in the text), so the file stays small; the whole 16,700-entry name list would be 1.5 MB for no reader of this app.
 *
 * Inputs (read only, nothing downloaded):
 *   C:/Users/CJWal/dev/romance-v0/data/dict/kaikki-la.jsonl   Wiktionary via kaikki.org, CC BY-SA 4.0 (KAIKKI_LA overrides)
 *   C:/Users/CJWal/dev/vetus-v0/data/vulgate/lat-clementine.usfx.xml   Clementine Vulgate, public domain (VULGATE_USFX overrides)
 *   src/adapters/latin/lexicon-full-data.ts, lexicon-ls-data.ts, lexicon-data.ts   what the lexicon already declines (skipped)
 * Run by hand:  node scripts/latin-build-names.mjs   (about 15 s). Output is committed; the app never reads the inputs.
 *
 * Rules:
 *   - the lemma is Wiktionary's headword with its length marks removed (Iordanis, Ioppe, Edom); the Clementine's j and æ fold to it
 *   - genitive: the table's genitive singular (the first of several); a name tagged indeclinable, or with no genitive in the table, is
 *     written with an empty genitive, which the lexicon reads as undeclined (one form for every case)
 *   - gender: the canonical form's masculine / feminine / neuter tag, else m; a third-declension table whose accusative ends in -a or -en
 *     (Greek) gets the G flag the cell generator knows
 *   - count: the capitalised occurrences of the entry's forms in the Vulgate (sentence-initial ones included), used as the lemma weight
 *   - gloss: the first sense that is not a form-of / alt-of, its last gloss line, cut at 80 characters; "a male given name ..." kept as is
 *   - skipped: an entry the lexicon already declines under the same lemma (any genitive), form-of entries, entries whose only attested form
 *     is a common word written capitalised at a sentence start (the attestation must come from inside a sentence at least once)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const KAIKKI = process.env.KAIKKI_LA ?? 'C:/Users/CJWal/dev/romance-v0/data/dict/kaikki-la.jsonl';
const USFX = process.env.VULGATE_USFX ?? 'C:/Users/CJWal/dev/vetus-v0/data/vulgate/lat-clementine.usfx.xml';
const OUT = path.join(ROOT, 'src', 'adapters', 'latin', 'lexicon-names-data.ts');

const SKIP = new Set(['Sale', 'Save', 'Harma', 'Uria', 'Noemus', 'Tyro', 'Rhegium', 'Tripolis', 'Sina']);
const fold = (s) => s.normalize('NFC').toLowerCase().replace(/æ|ǽ|ǣ|ę/g, 'ae').replace(/œ/g, 'oe').normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC').replace(/j/g, 'i').replace(/v/g, 'u');
const strip = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');

// ── 1. the Vulgate: capitalised forms and where they stand
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const vulgate = new Map(); // folded form -> { cap, capMid, all }
{
  const raw = fs.readFileSync(USFX, 'utf8');
  for (const m of raw.matchAll(/<book id="([^"]+)">([\s\S]*?)<\/book>/g)) {
    for (const t of m[2].matchAll(/<v id="(\d+)"\/>([\s\S]*?)<ve\/>/g)) {
      const text = decode(t[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      let sentStart = true;
      let prevEnd = 0;
      for (const w of text.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ\u0300-\u036f]+/g)) {
        if (prevEnd > 0 && /[.!?:]/.test(text.slice(prevEnd, w.index))) sentStart = true; // a colon too: the Clementine capitalises the first word of speech after it
        const key = fold(w[0]);
        const cap = /^\p{Lu}/u.test(w[0]);
        const e = vulgate.get(key) ?? { cap: 0, capMid: 0, all: 0 };
        e.all++;
        if (cap) { e.cap++; if (!sentStart) e.capMid++; }
        vulgate.set(key, e);
        sentStart = false;
        prevEnd = w.index + w[0].length;
      }
    }
  }
}

// ── 2. what the lexicon already declines (lemma -> has a genitive)
const declined = new Set();
const undeclinedOnly = new Set();
{
  const full = await import(pathToFileURL(path.join(ROOT, 'src/adapters/latin/lexicon-full-data.ts')).href);
  const ls = await import(pathToFileURL(path.join(ROOT, 'src/adapters/latin/lexicon-ls-data.ts')).href);
  const seed = await import(pathToFileURL(path.join(ROOT, 'src/adapters/latin/lexicon-data.ts')).href);
  for (const text of [full.FULL_LEXICON, ls.LS_LEXICON]) {
    for (const line of text.split('\n')) {
      const f = line.split('\t');
      if (f[0] !== 'N') continue;
      if (f[2]) declined.add(fold(f[1])); else undeclinedOnly.add(fold(f[1]));
    }
  }
  for (const r of seed.NOUN_ROWS) if (r[1]) declined.add(fold(r[0])); else undeclinedOnly.add(fold(r[0]));
}

// ── 3. Wiktionary name entries: first the gloss of every name page (for "alternative form of X" entries), then the rows
const CASEOF = /^(nominative|genitive|dative|accusative|ablative|vocative|locative)[\w\/, ]* of /i;
const ALT = /^alternative (?:form|spelling) of (\S+)/i;
/** The reader's gloss of a sense: a short first line ("Edom, Esau:") when the sense explains it on a second line, else the last line. */
const senseGloss = (sense) => {
  const g = sense.glosses;
  const first = g[0].replace(/\s+/g, ' ').trim();
  const pick = g.length > 1 && first.length <= 40 && !ALT.test(first) ? first : g[g.length - 1];
  const text = pick.replace(/\s+/g, ' ').trim().replace(/[.;:]+$/, '');
  // "a male given name from Hebrew, equivalent to English Joshua" reads as "Joshua"; one with no English equivalent given is left as the name itself
  const eq = /equivalent to (?:the )?English ([A-Z][A-Za-z]+)(?: or ([A-Z][A-Za-z]+))?/.exec(text);
  if (eq) return eq[2] ? eq[1] + ' or ' + eq[2] : eq[1];
  if (/^an? (?:male |female )?given name/i.test(text)) {
    const borne = /(?:notably |famously )?borne by ([^;—]+?)(?:;|—|$)/.exec(text);
    return borne && borne[1].trim().length <= 60 ? '(name) ' + borne[1].trim() : '(name)';
  }
  return text;
};
const glossOf = new Map();
{
  const pass = readline.createInterface({ input: fs.createReadStream(KAIKKI, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of pass) {
    if (!line.includes('"pos": "name"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.pos !== 'name' || o.lang_code !== 'la') continue;
    const real = (o.senses ?? []).filter((x) => x.glosses?.length && !(x.tags ?? []).some((t) => /form-of/.test(t)) && !CASEOF.test(x.glosses[x.glosses.length - 1]) && !ALT.test(x.glosses[0]));
    if (real.length && !glossOf.has(strip(o.word))) glossOf.set(strip(o.word), senseGloss(real[0]));
  }
}
const rows = [];
const seen = new Set();
let entries = 0, attested = 0, skippedDeclined = 0, skippedUnattested = 0;
const rl = readline.createInterface({ input: fs.createReadStream(KAIKKI, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.includes('"pos": "name"')) continue;
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  if (o.pos !== 'name' || o.lang_code !== 'la') continue;
  entries++;
  const senses = o.senses ?? [];
  const real = senses.filter((s) => s.glosses?.length && !(s.tags ?? []).some((t) => /form-of/.test(t)) && !CASEOF.test(s.glosses[s.glosses.length - 1]));
  if (!real.length) continue; // an inflected form's own page
  const lemma = strip(o.word);
  // Wiktionary's page is another bearer of the name (a Thracian town for Sale, an Arabian city for Save, a Boeotian town for Harma, Calabrian Uria),
  // or the lemma is not the Vulgate's (Noemus for Noemi, Tyro the nymph for Tyrus): a wrong gloss is worse than a guess marked as one
  if (SKIP.has(strip(o.word))) continue;
  // letters only, capitalised, written with i not j (the lexicon's spelling; Wiktionary's j-pages duplicate the i-pages)
  if (!/^\p{Lu}[A-Za-z]+$/u.test(lemma) || /j/i.test(lemma)) continue;
  // not a name of this text: abbreviations, Roman family names, modern surnames, rivers of Africa, gods of Egypt (Wiktionary has them all)
  const firstGloss = real[0].glosses[real[0].glosses.length - 1];
  if (/abbreviation of|synonym of|nomen gentile|cognomen|praenomen|surname|Roman family|a river (of|in) (Numidia|Mauritania|Gaul|Hispania|Gallia|Syria)|Egyptian god|character in the play|Plautus|mentioned by Pliny|tribe of (India|Hiberia|Gallaecia|Libya)|Libyan tribe|Celtic tribe|Greek feminine name|hetaera|the book of|^book of|^Psalms$|Iglesias|Dioscuri|translators of/i.test(firstGloss)) continue;
  // an alternative spelling of a name the lexicon already declines adds nothing (Moeses for Moyses); of one it leaves undeclined it adds the declension
  const alt = ALT.exec(firstGloss);
  const altKey = alt ? fold(strip(alt[1]).replace(/[^A-Za-z]/g, '')) : '';
  if (altKey && (declined.has(altKey) || altKey === 'moyses' || altKey === 'iesus')) continue;
  const key = fold(lemma);
  const forms = (o.forms ?? []).filter((f) => f.form && f.tags && !f.tags.includes('table-tags') && !f.tags.includes('inflection-template') && /^[A-Za-zĀ-ſ\u0300-\u036f]+$/.test(f.form.normalize('NFD')));
  const canonical = forms.find((f) => f.tags.includes('canonical'));
  const tags = new Set([...(canonical?.tags ?? []), ...real.flatMap((s) => s.tags ?? [])]);
  const indeclinable = tags.has('indeclinable') || real.every((s) => (s.tags ?? []).includes('indeclinable'));
  const gen = indeclinable ? '' : strip(forms.find((f) => f.tags.includes('genitive') && (f.tags.includes('singular') || f.tags.length === 1))?.form ?? '');
  // attestation: any form of the entry, folded, capitalised inside a sentence in the Vulgate
  const formKeys = new Set([key, ...forms.map((f) => fold(f.form))]);
  let count = 0, mid = 0, formsMid = 0;
  for (const k of formKeys) { const e = vulgate.get(k); if (e) { count += e.cap; mid += e.capMid; if (e.capMid) formsMid++; } }
  // the attestation must be the name itself inside a sentence, or two of its forms (one oblique form alone is too often a common word: Ubi, Viri, Patris)
  const lemmaMid = vulgate.get(key)?.capMid ?? 0;
  if (!mid || (!lemmaMid && formsMid < 2)) { skippedUnattested++; continue; }
  // an undeclined name can only ever match its own form; a first-declension name shares -ae / -am with its -as twin (Uria / Urias): both need the name itself attested
  if ((!gen || /ae$/.test(gen)) && !lemmaMid) { skippedUnattested++; continue; }
  // a plural-only name (Romani, Athenae): the cell generator takes a singular genitive; Whitaker holds the singular where one exists
  if (/(orum|arum|ium|um)$/.test(gen) && !/ium$/.test(lemma)) { skippedUnattested++; continue; }
  attested++;
  if (declined.has(key)) { skippedDeclined++; continue; }
  const id = `${key}|${fold(gen)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const gender = tags.has('feminine') ? 'f' : tags.has('neuter') ? 'n' : 'm';
  const acc = forms.find((f) => f.tags.includes('accusative') && f.tags.includes('singular'))?.form ?? '';
  // the genitive in the spelling the cell generator reads (morph-noun.ts declensionOf): a Greek first-declension -es (Ninive, Ninives) as -ae,
  // a Greek third-declension -os (Persis, Persidos) as -is with the G flag (accusative in -a / -en kept as an alternative)
  let gen2 = gen;
  let greek = '';
  if (/es$/.test(gen2) && /e$/.test(lemma)) gen2 = gen2.slice(0, -2) + 'ae';
  else if (/os$/.test(gen2)) { gen2 = gen2.slice(0, -2) + 'is'; greek = 'G'; }
  else if (gen2 && /is$/.test(gen2) && /(a|en)$/.test(strip(acc))) greek = 'G';
  // an alternative form carries the gloss of the page it points to (Ierusalem: Jerusalem; Iordanis: the river Jordan), else its own
  const target = alt ? strip(alt[1]).replace(/[^A-Za-z]/g, '') : '';
  const g = (target && glossOf.get(target)) || senseGloss(real[0]);
  const gloss = (g.length > 80 ? g.slice(0, 77).replace(/\s+\S*$/, '') + '…' : g).replace(/\t/g, ' ');
  rows.push({ lemma, gen: gen2, gender: gender + greek, count, gloss, undeclinedBefore: undeclinedOnly.has(key) });
}

// ── 4. hand-written rows (2026-10-25): the commonest names of the unconfirmed-word list (docs/latin/EVAL.md) that Wiktionary has no page for,
// declined as the Clementine declines them; an empty genitive = undeclined; p = plural only; G = Greek third declension
const CURATED = [
  ['Ioppe', 'Ioppae', 'f', 'Joppa (the port, now Jaffa)'],
  ['Sina', 'Sinae', 'f', 'Sinai (the mountain of the Law)'],
  ['Sodoma', 'Sodomi', 'np', 'Sodom'],
  ['Lachis', '', 'f', 'Lachish'],
  ['Noemi', '', 'f', 'Naomi'],
  ['Micha', '', 'm', 'Micah'],
  ['Moholi', '', 'm', 'Mahli'],
  ['Chusi', '', 'm', 'Cushi; Hushai'],
  ['Adonias', 'Adoniae', 'm', 'Adonijah'],
  ['Nerias', 'Neriae', 'm', 'Neriah'],
  ['Caiphas', 'Caiphae', 'm', 'Caiaphas (the high priest)'],
  ['Iscariotes', 'Iscariotis', 'm', 'Iscariot (Judas)'],
  ['Laodicia', 'Laodiciae', 'f', 'Laodicea'],
  ['Gerasenus', 'Geraseni', 'm', 'a Gerasene; (pl.) the Gerasenes'],
  ['Sadducaeus', 'Sadducaei', 'm', 'a Sadducee'],
  ['Thessalonicensis', 'Thessalonicensis', 'm', 'a Thessalonian'],
  ['Amalecita', 'Amalecitae', 'm', 'an Amalekite'],
  ['Gabaonita', 'Gabaonitae', 'm', 'a Gibeonite'],
  ['Sidonius', 'Sidonii', 'm', 'a Sidonian'],
  ['Ioanna', 'Ioannae', 'f', 'Joanna'],
  ['Barsabas', 'Barsabae', 'm', 'Barsabbas'],
  ['Derbe', 'Derbae', 'f', 'Derbe (a city of Lycaonia)'],
  ['Troas', 'Troadis', 'fG', 'Troas (the city and region of Troy)'],
  ['Nobe', '', 'f', 'Nob (the city of the priests)'],
  ['Sechem', '', 'f', 'Shechem'],
  ['Rapha', '', 'm', 'Rapha'],
  ['Phelethi', '', 'm', 'the Pelethites (David\'s guard, with the Cherethites)'],
  ['Cerethi', '', 'm', 'the Cherethites'],
  ['Ahio', '', 'm', 'Ahio'],
  ['Lobni', '', 'm', 'Libni'],
  ['Ezri', '', 'm', 'Ezri'],
  ['Zanoe', '', 'f', 'Zanoah'],
  ['Husam', '', 'm', 'Husham'],
  ['Arad', '', 'f', 'Arad'],
  ['Adad', '', 'm', 'Hadad'],
  ['Isai', '', 'm', 'Jesse (the father of David)'],
  ['Arimathaea', 'Arimathaeae', 'f', 'Arimathea'],
  // the next tail of the unconfirmed list after the first build (2026-10-25)
  ['Bethphage', '', 'f', 'Bethphage (a village on the Mount of Olives)'],
  ['Corozain', '', 'f', 'Chorazin'],
  ['Decapolis', 'Decapolis', 'f', 'the Decapolis (the ten cities)'],
  ['Ephrem', '', 'f', 'Ephraim (the town near the wilderness)'],
  ['Genesareth', '', 'f', 'Gennesaret'],
  ['Gomorrhaeus', 'Gomorrhaei', 'm', 'a man of Gomorrah; (pl.) the people of Gomorrah'],
  ['Herodias', 'Herodiadis', 'fG', 'Herodias'],
  ['Herodianus', 'Herodiani', 'm', 'a Herodian'],
  ['Galaadites', 'Galaaditae', 'm', 'a Gileadite'],
  ['Bethlehemites', 'Bethlehemitae', 'm', 'a Bethlehemite'],
  ['Arbee', '', 'f', 'Arba (Kiriath-arba, Hebron)'],
  ['Beeri', '', 'm', 'Beeri'],
  ['Jesi', '', 'm', 'Jesse (the father of David; also written Isai)'],
  ['Judi', '', 'm', 'Jehudi'],
];
for (const [lemma, gen, gender, gloss] of CURATED) {
  const key = fold(lemma);
  // a hand row stands even where Whitaker declines the name: his Sodoma, -ae and Troas, -ae do not give the Vulgate's Sodomorum and Troadem
  const id = `${key}|${fold(gen)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const e = vulgate.get(key);
  rows.push({ lemma, gen, gender, count: Math.max(1, e?.cap ?? 0), gloss, undeclinedBefore: undeclinedOnly.has(key), hand: true });
}
rows.sort((a, b) => b.count - a.count || (a.lemma < b.lemma ? -1 : 1));
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-names.mjs — do not edit by hand (docs/latin/ADAPTER.md says how it is made).');
L.push(' * Proper names of the Clementine Vulgate that Whitaker\'s Words and the Lewis & Short backstop do not decline: lemma, genitive (empty =');
L.push(' * undeclined), gender (G = Greek third declension), the name\'s capitalised occurrences in the Vulgate as its weight, and a short gloss.');
L.push(' * Source: Wiktionary via kaikki.org (CC BY-SA 4.0), the `name` entries, plus the hand-written rows of the script (CURATED); attestation and');
L.push(' * counts from the Clementine Vulgate (public domain).');
L.push(' * Same line format as lexicon-full-data.ts. Loaded lazily with it (lexicon-load.ts).');
L.push(' */');
L.push('export const NAMES_LEXICON = ' + JSON.stringify(rows.map((r) => ['N', r.lemma, r.gen, r.gender, String(r.count), r.gloss].join('\t')).join('\n')) + ';');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));
const bytes = fs.statSync(OUT).size;
const withGen = rows.filter((r) => r.gen).length;
const hand = rows.filter((r) => r.hand).length;
console.log(`name entries ${entries}; attested in the Vulgate ${attested}; already declined by the lexicon ${skippedDeclined}; written ${rows.length} (${hand} hand-written; ${withGen} declined, ${rows.length - withGen} undeclined; ${rows.filter((r) => r.undeclinedBefore).length} were undeclined rows of Whitaker before); unattested ${skippedUnattested}; ${(bytes / 1024).toFixed(0)} KB`);
if (process.env.NAMES_REPORT) for (const r of rows.slice(0, Number(process.env.NAMES_REPORT) || 60)) console.log(`${r.count}\t${r.lemma}\t${r.gen}\t${r.gender}\t${r.gloss}`);
