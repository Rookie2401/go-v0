/**
 * From tokens to analysed tokens, for every period of Greek at once (the Hebrew analyser's design, src/adapters/hebrew/analyze.ts).
 *
 * A written form is looked up in the installed form indexes (index-store.ts): MorphGNT gives the reading(s) of that very form in the
 * New Testament (period el-koi); the Wiktionary Ancient Greek tables give readings whose period the table header names (Attic by
 * default; Epic → Homeric, Koine, Byzantine …); the Modern tables give el-mod readings. A form whose exact spelling no index holds
 * is tried without its diacritics (a monotonic or unaccented spelling of a polytonic form, and the other way round) at lower
 * confidence, the match marked `notes.accents = 'inferred'`. A form no index knows gets NO reading.
 *
 * Then the sentence decides its PERIOD (`sentencePeriod`): polytonic marks anywhere → an ancient period, the one most words' readings
 * belong to; a tie → the caller's declared or targeted variety, else Koine when most words are New Testament words, else Attic.
 * Monotonic text → Modern, unless no word has a Modern reading and most have an ancient one. Readings of that period go first on
 * every word (none removed); every reading says which period the sentence was read in (`notes.period`, `notes.periodBasis`).
 */
import type { AnalysisCandidate, AnalyzeOptions, AnalyzedToken, PartOfSpeech, RawToken } from '../../core';
import { type ElIndexHit, lookupGreekForm } from './index-store';
import { decodeMorphGnt } from './morphgnt';
import { elMorphFromTags } from './tags';
import { milesianValue } from './numbers';
import { elKey as elKeyOf, isPolytonic } from './text';
import { EL_VARIETIES, elVarietiesFromTags } from './varieties';

export const EL_VERSION = '1';
export const EL_ANALYZER = `adapter-el@${EL_VERSION}`;
export const EL_SOURCE_IDS = { morphgnt: 'morphgnt-sblgnt', kaikkiGrc: 'kaikki-grc-tables', kaikkiEl: 'kaikki-el-tables', rules: `el-rules@${EL_VERSION}` } as const;

const PERIODS = ['el-hom', 'el-att', 'el-koi', 'el-med', 'el-mod'] as const;
export type ElPeriod = (typeof PERIODS)[number];
const ANCIENT = new Set<string>(['el-hom', 'el-att', 'el-koi', 'el-med']);
const label = (code: string): string => EL_VARIETIES[code]?.label ?? code;

/** The period(s) a kaikki row belongs to: its own dialect tags, else the lemma's labels, else the index default. */
function rowVarieties(hit: ElIndexHit, tags: string[], lemmaLabels: string[]): string[] {
  const own = elVarietiesFromTags(tags);
  if (own.length) return own;
  if (lemmaLabels.length) return lemmaLabels;
  return [hit.index.period];
}

function fromHit(hit: ElIndexHit, share: number): AnalysisCandidate | undefined {
  const [lemmaId, code, count] = hit.row;
  const idx = hit.index;
  const row = idx.lemmas[lemmaId];
  if (idx.codes === 'morphgnt') {
    const r = decodeMorphGnt(code, lemmaId);
    const notes: Record<string, string | string[]> = { source: 'morphgnt', code, lemmaId, attested: `${count}× in the New Testament as this reading` };
    if (row?.[6]) notes.septuagint = `the lemma occurs ${row[6]}× in the Septuagint`;
    if (hit.viaBare) notes.accents = 'inferred';
    const c: AnalysisCandidate = {
      lemma: row?.[0] ?? lemmaId, pos: r.pos, morph: r.morph, notes, varieties: ['el-koi'], origin: 'dictionary', sourceId: EL_SOURCE_IDS.morphgnt,
      confidence: hit.viaBare ? 0.6 : 0.92, ...(row?.[1] ? { gloss: row[1] } : {}),
    };
    c.confidence = Math.round(c.confidence * (0.55 + 0.45 * share) * 100) / 100;
    return c;
  }
  const tags = code ? code.split('|') : [];
  const citation = tags.includes('citation-form');
  const alternative = tags.includes('alternative');
  const morph = citation || alternative ? {} : elMorphFromTags(tags);
  delete morph.Declension;
  const headword = row?.[0] ?? lemmaId.split('|')[0];
  const pos = (row?.[2] ?? lemmaId.split('|')[1] ?? 'X') as PartOfSpeech;
  const lemmaLabels = row?.[5] ? row[5].split(',').filter(Boolean) : [];
  const varieties = rowVarieties(hit, tags, lemmaLabels);
  const notes: Record<string, string | string[]> = { source: idx.id === 'kaikki-el-tables' ? 'kaikki-el' : 'kaikki-grc', lemmaId, ...(citation ? { form: 'citation form' } : alternative ? { form: `alternative form (${tags.filter((t) => t !== 'alternative').join(', ') || 'unlabelled'})` } : { tags: [...tags] }) };
  if (hit.viaBare) notes.accents = 'inferred';
  const c: AnalysisCandidate = {
    lemma: headword, pos, morph, notes, varieties, origin: 'dictionary', sourceId: idx.id === 'kaikki-el-tables' ? EL_SOURCE_IDS.kaikkiEl : EL_SOURCE_IDS.kaikkiGrc,
    confidence: hit.viaBare ? 0.6 : 0.76, ...(row?.[1] ? { gloss: row[1] } : {}),
  };
  c.confidence = Math.round(c.confidence * (0.55 + 0.45 * share) * 100) / 100;
  return c;
}

/** An elided word (τ᾽, δ᾽, ἀλλ᾽, οὐδ᾽): the editions write the elision as an apostrophe, a koronis, or — in the Perseus treebank — a combining smooth breathing after the consonant. */
const ELIDED = /^(.*[^αεηιουωάέήίόύώᾶῆῖῦῶ̀-ͯ])[̓ʼ’᾽᾿']$/u;
/** The vowels an elision may have dropped, as the written forms carry them (unaccented and accented: τ(ε), δ(έ), ἀλλ(ά), ἔπειτ(α), τοῦτ(ο), ὅτ(ι)). */
const ELISION_VOWELS = ['ε', 'έ', 'α', 'ά', 'ο', 'ό', 'ι', 'ί'];
/** The words that are usually elided, by their written stem (an aspirated stem — ἐφ᾽, καθ᾽, μεθ᾽ — is looked up by its plain consonant). */
const ELISIONS: Readonly<Record<string, string>> = {
  'δ': 'δέ', 'τ': 'τε', 'γ': 'γε', 'κ': 'κε', 'ῥ': 'ῥα', 'ἄρ': 'ἄρα', 'ἀλλ': 'ἀλλά', 'ἠδ': 'ἠδέ', 'οὐδ': 'οὐδέ', 'μηδ': 'μηδέ', 'οὔτ': 'οὔτε', 'μήτ': 'μήτε',
  'εἴτ': 'εἴτε', 'ὥστ': 'ὥστε', 'ὅτ': 'ὅτε', 'ποτ': 'ποτε', 'τότ': 'τότε', 'ἔνθ': 'ἔνθα', 'ἔπειτ': 'ἔπειτα', 'τοῦτ': 'τοῦτο', 'ταῦτ': 'ταῦτα', 'ἐπ': 'ἐπί', 'ἀπ': 'ἀπό',
  'ὑπ': 'ὑπό', 'κατ': 'κατά', 'μετ': 'μετά', 'παρ': 'παρά', 'δι': 'διά', 'ἀν': 'ἀνά', 'ἀντ': 'ἀντί', 'ἀμφ': 'ἀμφί', 'ἐν': 'ἐνί', 'αὐτ': 'αὐτά', 'πάντ': 'πάντα',
  'οὐκέτ': 'οὐκέτι', 'ἔτ': 'ἔτι', 'ἀλλ᾽': 'ἀλλά', 'ὑπ᾽': 'ὑπό', 'μ': 'με', 'σ': 'σε', 'ἔμ': 'ἔμε', 'τίν': 'τίνα', 'ἵν': 'ἵνα', 'ὅσ': 'ὅσα', 'πολλ': 'πολλά',
};

/** Context-free readings of one token, best first. */
export function elCandidates(token: RawToken): AnalysisCandidate[] {
  const key = token.normalized;
  if (!key) return [];
  const nfd = key.normalize('NFD');
  const stemBeforeMark = /[̓ʼ’᾽᾿']$/u.test(nfd) ? nfd.replace(/[̓ʼ’᾽᾿']$/u, '').normalize('NFC') : undefined;
  // a stem ending in a vowel is elided only when it is a usual elision (δι᾽ for διά); otherwise the mark after a vowel is not an elision
  const elided = ELIDED.exec(nfd)?.[1].normalize('NFC') ?? (stemBeforeMark && ELISIONS[stemBeforeMark] ? stemBeforeMark : undefined);
  if (elided) {
    // restore the dropped vowel: the usual elided words first (δ᾽ is δέ, not Διί), then every vowel; a single letter is never a numeral here,
    // and for a short stem a particle, conjunction, preposition or adverb reading comes before a noun or a name
    const usual = ELISIONS[elided] ?? ELISIONS[elided.replace(/[θφχ]$/u, (c) => ({ 'θ': 'τ', 'φ': 'π', 'χ': 'κ' })[c] ?? c)];
    const restored = [...(usual ? [usual] : []), ...ELISION_VOWELS.map((v) => elided + v).filter((f) => f !== usual)];
    const out: AnalysisCandidate[] = [];
    restored.forEach((form, k) => {
      for (const c of elCandidates({ ...token, normalized: elKeyOf(form) })) {
        if (c.pos === 'NUM' && elided.length === 1) continue;
        const closed = c.pos === 'PART' || c.pos === 'CONJ' || c.pos === 'SCONJ' || c.pos === 'ADP' || c.pos === 'ADV';
        const factor = (usual && k === 0 ? 0.95 : 0.8) * (elided.length <= 3 && !closed ? 0.7 : 1);
        out.push({ ...c, confidence: Math.round(c.confidence * factor * 100) / 100, notes: { ...c.notes, rule: `elided: read as ${form}`, source: 'rule' }, origin: 'rule', sourceId: EL_SOURCE_IDS.rules });
      }
    });
    return out.sort((a, b) => b.confidence - a.confidence);
  }
  const all = lookupGreekForm(key);
  if (!all.length) return ruleCandidates(token);
  // a table's citation-form row adds nothing when the same lemma has a real row for this form
  const withRows = new Set(all.filter((h) => h.index.codes === 'kaikki-tags' && h.row[1] !== 'citation-form').map((h) => h.row[0]));
  const hits = all.filter((h) => !(h.index.codes === 'kaikki-tags' && h.row[1] === 'citation-form' && withRows.has(h.row[0])));
  const total = hits.reduce((s, h) => s + h.row[2], 0) || 1;
  const out: AnalysisCandidate[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const c = fromHit(h, h.row[2] / total);
    if (!c) continue;
    const k = `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}|${c.varieties?.join()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

const round = (n: number): number => Math.round(n * 100) / 100;
const numeralCandidate = (letters: string, value: number, why: string): AnalysisCandidate => ({
  lemma: letters, pos: 'NUM', morph: { NumType: 'Card' }, gloss: String(value), confidence: 0.8, varieties: [...PERIODS],
  notes: { rule: `${why} (Milesian numeral: ${value})`, source: 'rule' }, origin: 'rule', sourceId: EL_SOURCE_IDS.rules,
});

/**
 * Readings by RULE for a form no index holds, each marked unconfirmed and saying which rule read it: letters with a keraia (ιϛʹ) as a
 * numeral; a usual elided stem whose apostrophe the edition set as a separate character (οὔτ ʼ); crasis of the article or καί with the
 * next word (τἀγαθόν = τὸ ἀγαθόν, κἀγώ = καὶ ἐγώ: the coronis on the first vowel is the mark); capital letters without accents as a
 * diagram label (the ΑΒΓ of a geometrical text) or a letter-numeral. Nothing else is guessed.
 */
function ruleCandidates(token: RawToken): AnalysisCandidate[] {
  const key = token.normalized;
  const surface = token.surface.normalize('NFC');
  const num = /^([α-ωϛϝϙϟϡ]{1,4})[ʹ΄´′']$/u.exec(key);
  if (num) { const v = milesianValue(num[1]); if (v !== null) return [numeralCandidate(num[1], v, 'the keraia marks the letters as a number')]; }
  const usual = ELISIONS[key];
  if (usual) {
    const out = elCandidates({ ...token, normalized: elKeyOf(usual) }).map((c) => ({ ...c, confidence: round(c.confidence * 0.7), unconfirmed: true, origin: 'rule' as const, sourceId: EL_SOURCE_IDS.rules, notes: { ...c.notes, rule: `read as elided ${usual} (the apostrophe is a separate character in this text)`, source: 'rule' } }));
    if (out.length) return out;
  }
  const nfd = key.normalize('NFD');
  const crasis = /^([τκ])([αεηιουω][αεηιουω]?)\u0313/u.exec(nfd);
  if (crasis) {
    const rest = nfd.slice(1);
    const variants = [rest, rest.replace('\u0342', '\u0301'), rest.replace(/^ου/u, 'ο')].map((v) => v.normalize('NFC'));
    const first = crasis[1] === 'τ' ? 'τό / τά' : 'καί';
    for (const v of [...new Set(variants)]) {
      // a reading whose accents match the written form (the circumflex of τἆλλα is the contraction's, so the acute variant ἄλλα is tried next)
      const out = elCandidates({ ...token, normalized: elKeyOf(v) }).filter((c) => !c.unconfirmed && c.notes?.accents !== 'inferred').map((c) => ({ ...c, confidence: round(c.confidence * 0.75), unconfirmed: true, origin: 'rule' as const, sourceId: EL_SOURCE_IDS.rules, notes: { ...c.notes, rule: `crasis: ${first} + ${v} (the coronis marks the fusion)`, source: 'rule' } }));
      if (out.length) return out;
    }
  }
  if (/^[Α-Ω]{1,4}$/u.test(surface)) {
    return [{ lemma: surface, pos: 'X', morph: {}, gloss: 'letters naming a point, line, angle or figure (a diagram label), or a letter-numeral', confidence: 0.5, varieties: [...PERIODS], unconfirmed: true, notes: { rule: 'capital letters without accents: a diagram label or a letter-numeral, not a word', source: 'rule' }, origin: 'rule', sourceId: EL_SOURCE_IDS.rules }];
  }
  return [];
}

/** The period of the sentence decided last by evidence (polytonic or monotonic spelling): the tie-breaker for a sentence whose spelling shows neither system and that declares nothing. */
let lastPeriod: ElPeriod | undefined;
/** Test hook: forget the period of the sentence read before. */
export function resetElPeriodMemory(): void { lastPeriod = undefined; }

export function sentencePeriod(tokens: RawToken[], base: AnalysisCandidate[][], opts?: AnalyzeOptions): { period: ElPeriod; basis: string } {
  const r = decidePeriod(tokens, base, opts);
  if (tokens.some((t) => t.isWord && isPolytonic(t.surface)) || r.basis.startsWith('monotonic')) lastPeriod = r.period;
  return r;
}

function decidePeriod(tokens: RawToken[], base: AnalysisCandidate[][], opts?: AnalyzeOptions): { period: ElPeriod; basis: string } {
  const declared = opts?.varietyId && (PERIODS as readonly string[]).includes(opts.varietyId) ? (opts.varietyId as ElPeriod) : undefined;
  const words = tokens.filter((t) => t.isWord);
  const polytonic = words.some((t) => isPolytonic(t.surface));
  // monotonic EVIDENCE: a word beginning with a vowel and carrying no breathing (polytonic spelling would write one). A word with
  // nothing but an acute (λόγος) is spelled the same in both systems and is evidence of neither.
  // (a word set in capitals carries no breathing in either system, and a single letter is a numeral or a label: neither is evidence)
  const monotonic = !polytonic && words.some((t) => { const w = t.surface.normalize('NFC'); return w.length > 1 && w !== w.toUpperCase() && /^[αεηιουωάέήίόύώϊϋΐΰ]/iu.test(w) && !/[̓̔]/.test(t.surface.normalize('NFD')); });
  const votes: Record<string, number> = {};
  let voters = 0;
  let ntWords = 0; // words the New Testament attests
  let attOnly = 0; // words with an Attic reading and no New Testament one
  let homOnly = 0; // words whose every reading is Epic (an Epic table row or Epic form, nothing Attic or Koine)
  let markers = 0; // Homeric shapes of the written word itself (see HOMERIC_MARK)
  let weak = 0; // ἄρα / ἄρ᾽ / τοι: everywhere in Homer, but Attic prose uses them too, so they count only beside other evidence or in a Homeric run
  base.forEach((cands, i) => {
    if (!tokens[i].isWord) return;
    if (HOMERIC_MARK.test(tokens[i].normalized)) markers++;
    else if (WEAK_HOMERIC_MARK.test(tokens[i].normalized)) weak++;
    if (!cands.length) return;
    voters++;
    const periods = new Set(cands.flatMap((c) => c.varieties ?? []));
    if (cands.some((c) => c.sourceId === EL_SOURCE_IDS.morphgnt)) ntWords++;
    else if (periods.has('el-att')) attOnly++;
    if (periods.has('el-hom') && !periods.has('el-att') && !periods.has('el-koi') && !periods.has('el-mod')) homOnly++;
    for (const v of periods) votes[v] = (votes[v] ?? 0) + 1;
  });
  const ranked = Object.entries(votes).filter(([v]) => polytonic ? ANCIENT.has(v) : true).sort((a, b) => b[1] - a[1]);
  if (!voters || !ranked.length) {
    if (declared) return { period: declared, basis: 'no word was recognised; read in the declared variety' };
    return polytonic ? { period: 'el-att', basis: 'no word was recognised; polytonic text is read as Attic by default' } : { period: 'el-mod', basis: 'no word was recognised; read as Modern Greek by default' };
  }
  if (!polytonic) {
    if (!monotonic && declared && (votes[declared] ?? 0) > 0) return { period: declared, basis: `the spelling shows neither system (no breathing would be written); the declared variety (${label(declared)}) decides` };
    if (!monotonic && !declared && lastPeriod && (votes[lastPeriod] ?? 0) > 0) return { period: lastPeriod, basis: `the spelling shows neither system (no breathing would be written); read on as ${label(lastPeriod)}, the period of the sentence before` };
    // monotonic: Modern unless nothing is Modern and the words are ancient (an unaccented or simplified ancient text)
    if ((votes['el-mod'] ?? 0) > 0 || !ranked.some(([v]) => ANCIENT.has(v))) return { period: 'el-mod', basis: monotonic ? 'monotonic spelling; read as Modern Greek' : 'no polytonic mark; read as Modern Greek' };
    if (declared && ANCIENT.has(declared)) return { period: declared, basis: 'no polytonic mark but no Modern reading either; the declared variety decides' };
    return { period: ranked[0][0] as ElPeriod, basis: `no polytonic mark but no Modern reading either; ${ranked[0][1]} of ${voters} recognised words have a ${label(ranked[0][0])} reading` };
  }
  // Ancient. An Attic reading is the DEFAULT of the Ancient tables, so it is evidence of "ancient", not of Attic; the stages are told apart
  // by what is distinctive: Epic-only readings and Homeric shapes for Homer; otherwise the declared variety; otherwise the New Testament's
  // vocabulary (a text almost wholly of New Testament words, with few words the New Testament lacks, reads as Koine), else Attic.
  const strong = homOnly + markers;
  const homScore = strong + (strong >= 1 || lastPeriod === 'el-hom' ? weak : 0);
  const wordCount = words.length;
  // two pieces of evidence, or one in a short sentence or in a Homeric run (the sentence before was Homeric), or one per eight words
  if (homScore >= 2 || (homScore >= 1 && (wordCount <= 6 || lastPeriod === 'el-hom')) || homScore >= 0.12 * wordCount) {
    return { period: 'el-hom', basis: `${homOnly} word${homOnly === 1 ? '' : 's'} with an Epic-only reading and ${markers + (homScore > strong ? weak : 0)} Homeric shape${markers + (homScore > strong ? weak : 0) === 1 ? '' : 's'} (-οιο, -εσσι, -φι, κε(ν), ῥα, ἠδέ, μιν …) among ${wordCount} words` };
  }
  if (declared && ANCIENT.has(declared)) return { period: declared, basis: `ancient spelling without Homeric marks; the declared variety (${label(declared)}) decides between Attic and Koine, which the words alone do not` };
  if (ntWords >= 0.9 * voters && attOnly <= 0.1 * voters) return { period: 'el-koi', basis: `${ntWords} of ${voters} recognised words are New Testament words and only ${attOnly} are not: read as Koine` };
  return { period: 'el-att', basis: `ancient spelling without Homeric marks; ${attOnly} of ${voters} recognised words are outside the New Testament's vocabulary, so Attic (the stage the Ancient tables describe) rather than Koine` };
}

/**
 * Shapes of the written word that belong to the epic language: the Epic/Ionic genitive -οιο and dative plurals -εσσι / -ῃσι / -οισι, the
 * instrumental -φι(ν), the enclitic κε(ν), the particles ῥα / ῥ᾽, ἠδέ / ἠμέν, ἀτάρ / αὐτάρ, the pronouns μιν / σφι(ν) (not ἄρα and τοι, which Attic prose uses too),
 * the Epic forms of εἰμί (ἔην, ἦεν, ἔσσι, εἰμέν). A list of shapes, not a parser; counted per written word.
 */
/** Marks Homer uses in nearly every line but Attic prose uses too: counted only beside a strong mark or an Epic-only reading, or when the sentence before was Homeric. */
const WEAK_HOMERIC_MARK = /^(?:ἄρα|ἄρ|ἄρ᾽|τοι)$/u;
const HOMERIC_MARK = /(?:οιο|εσσι(?:ν)?|ῃσι(?:ν)?|οισι(?:ν)?|φι(?:ν)?)$|^(?:κε|κεν|κ᾽|ῥα|ῥ᾽|ἠδέ|ἠδ᾽|ἠμέν|ἀτάρ|αὐτάρ|μιν|σφι|σφιν|ἔην|ἦεν|ἔσσι|εἰμέν|ἔνθα|ἔπειτα|αὖτε|ἦμος)$/u;

export function orderElSentence(tokens: RawToken[], base: AnalysisCandidate[][], opts?: AnalyzeOptions): AnalysisCandidate[][] {
  const { period, basis } = sentencePeriod(tokens, base, opts);
  const fits = (c: AnalysisCandidate): boolean => (c.varieties ?? []).includes(period);
  return base.map((cands, i) => {
    if (!tokens[i].isWord) return cands;
    const first = cands.filter(fits);
    const rest = cands.filter((c) => !fits(c));
    const changed = first.length > 0 && rest.length > 0 && cands[0] && !fits(cands[0]);
    return [...first, ...rest].map((c, k) => ({ ...c, notes: { ...c.notes, period, periodBasis: basis, ...(changed && k === 0 ? { context: `put first because the sentence is read as ${label(period)}` } : {}) } }));
  });
}

export function elAnalyze(tokens: RawToken[], opts?: AnalyzeOptions): AnalyzedToken[] {
  const base = tokens.map((t, i) => {
    if (!t.isWord) return [];
    // letters followed by a keraia the tokenizer split off (α ΄): the numeral reading first, the word's own readings after it
    const next = tokens[i + 1];
    if (next && !next.isWord && next.start === t.end && /^[ʹ΄´′']$/u.test(next.surface) && /^[α-ωϛϝϙϟϡ]{1,4}$/u.test(t.normalized)) {
      const v = milesianValue(t.normalized);
      if (v !== null) return [numeralCandidate(t.normalized, v, 'the keraia after the letters marks them as a number'), ...elCandidates(t)];
    }
    return elCandidates(t);
  });
  const ordered = orderElSentence(tokens, base, opts);
  return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? ordered[i] : [], analyzer: EL_ANALYZER }));
}
