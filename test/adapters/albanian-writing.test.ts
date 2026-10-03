/**
 * Albanian writing and varieties (package Q4): normalisation, the alphabet, text typed without ë / ç, sentence
 * boundaries, variety codes and their standing, dictionary labels → features, Gheg and older-spelling correspondences.
 */
import { describe, expect, it } from 'vitest';
import { varietyStanding } from '../../src/core';
import { restoreDiacritics, SQ_LETTERS, sqLetters, sqNormalize, sqSearchNormalize } from '../../src/adapters/albanian/orthography';
import { segmentSqSentences } from '../../src/adapters/albanian/sentences';
import { SQ_VARIETIES, sqVarietiesFromTags } from '../../src/adapters/albanian/varieties';
import { ghegToStandard } from '../../src/adapters/albanian/gheg';
import { historicalToModern } from '../../src/adapters/albanian/historical';
import { sqMorphFromTags } from '../../src/adapters/albanian/tags';

// ───────────────────────────── normalisation ─────────────────────────────

describe('sqNormalize / sqSearchNormalize', () => {
  it('lower-cases and keeps ë and ç', () => {
    expect(sqNormalize('Shtëpi')).toBe('shtëpi');
    expect(sqNormalize('ÇFARË')).toBe('çfarë');
    expect(sqNormalize('Ë')).toBe('ë');
  });
  it('composes a decomposed ë and ç (NFC)', () => {
    expect(sqNormalize('ë')).toBe('ë');
    expect(sqNormalize('ç')).toBe('ç');
    expect(sqNormalize('shtëpi')).toBe(sqNormalize('shtëpi'));
    expect(sqNormalize('çfarË')).toBe('çfarë');
  });
  it('folds typographic apostrophes to \'', () => {
    expect(sqNormalize('s’është')).toBe("s'është");
    expect(sqNormalize('sʼështë')).toBe("s'është");
    expect(sqNormalize('s‘është')).toBe("s'është");
  });
  it('search normalisation drops ë and ç and trims', () => {
    expect(sqSearchNormalize(' Shtëpi ')).toBe('shtepi');
    expect(sqSearchNormalize('çfarë')).toBe('cfare');
    expect(sqSearchNormalize('ë')).toBe('e');
    expect(sqSearchNormalize('Çaj')).toBe('caj');
  });
});

// ───────────────────────────── the alphabet ─────────────────────────────

describe('SQ_LETTERS', () => {
  const order = 'a b c ç d dh e ë f g gj h i j k l ll m n nj o p q r rr s sh t th u v x xh y z zh'.split(' ');
  it('has the 36 letters in alphabet order', () => {
    expect(SQ_LETTERS).toHaveLength(36);
    expect(SQ_LETTERS.map((l) => l.letter)).toEqual(order);
  });
  it('gives each letter an ipa value, a hint, an example that contains it, and a gloss', () => {
    for (const l of SQ_LETTERS) {
      expect(l.ipa.length, l.letter).toBeGreaterThan(0);
      expect(l.hint.length, l.letter).toBeGreaterThan(5);
      expect(l.exampleGloss.length, l.letter).toBeGreaterThan(0);
      expect(sqNormalize(l.example), `${l.letter} in ${l.example}`).toContain(l.letter);
    }
  });
  it('the examples the brief names', () => {
    const by = (c: string) => SQ_LETTERS.find((l) => l.letter === c)!;
    expect(by('dh').example).toBe('dhomë');
    expect(by('gj').example).toBe('gjuhë');
    expect(by('nj').example).toBe('njeri');
    expect(by('rr').example).toBe('rrugë');
    expect(by('sh').example).toBe('shtëpi');
    expect(by('th').example).toBe('thikë');
    expect(by('xh').example).toBe('xhaketë');
    expect(by('zh').example).toBe('zhurmë');
    expect(by('ë').example).toBe('ëndërr');
    expect(by('ç').example).toBe('çaj');
  });
  it('is honest about the sounds English does not have', () => {
    for (const c of ['q', 'gj', 'y']) expect(SQ_LETTERS.find((l) => l.letter === c)!.hint).toMatch(/no English equivalent/);
  });
  it('every example word splits into letters of the alphabet', () => {
    const set = new Set(order);
    for (const l of SQ_LETTERS) for (const u of sqLetters(l.example)) expect(set.has(u), `${l.example}: ${u}`).toBe(true);
  });
});

describe('sqLetters', () => {
  const cases: Array<[string, string[]]> = [
    ['xhaxha', ['xh', 'a', 'xh', 'a']],
    ['njeri', ['nj', 'e', 'r', 'i']],
    ['shtëpi', ['sh', 't', 'ë', 'p', 'i']],
    ['dhomë', ['dh', 'o', 'm', 'ë']],
    ['gjuhë', ['gj', 'u', 'h', 'ë']],
    ['rrugë', ['rr', 'u', 'g', 'ë']],
    ['thikë', ['th', 'i', 'k', 'ë']],
    ['zhurmë', ['zh', 'u', 'r', 'm', 'ë']],
    ['çaj', ['ç', 'a', 'j']],
    ['qiell', ['q', 'i', 'e', 'll']],
    ['ndjek', ['n', 'd', 'j', 'e', 'k']],
    ['dhjetë', ['dh', 'j', 'e', 't', 'ë']],
    ['gjithë', ['gj', 'i', 'th', 'ë']],
    ['Shqipëri', ['sh', 'q', 'i', 'p', 'ë', 'r', 'i']],
    ["s'është", ['s', "'", 'ë', 'sh', 't', 'ë']],
  ];
  it.each(cases)('%s', (word, expected) => {
    expect(sqLetters(word)).toEqual(expected);
  });
  it('reads a decomposed ë as one letter', () => {
    expect(sqLetters('shtëpi')).toEqual(['sh', 't', 'ë', 'p', 'i']);
  });
  it('joining the letters gives the word back', () => {
    for (const w of ['xhaxha', 'shtëpi', 'ballë', 'thonj', 'rrëshqit']) expect(sqLetters(w).join('')).toBe(w);
  });
});

// ───────────────────────────── restoreDiacritics ─────────────────────────────

describe('restoreDiacritics', () => {
  it('restores ë and ç in forms typed without them', () => {
    const known = new Set(['është', 'çfarë', 'shtëpi', 'një']);
    const k = (w: string) => known.has(w);
    expect(restoreDiacritics('eshte', k)).toEqual(['është']);
    expect(restoreDiacritics('cfare', k)).toEqual(['çfarë']);
    expect(restoreDiacritics('shtepi', k)).toEqual(['shtëpi']);
    expect(restoreDiacritics('nje', k)).toEqual(['një']);
    expect(restoreDiacritics('ESHTE', k)).toEqual(['është']);
  });

  it('a form that already has an ë or a ç was not typed without them: nothing is restored', () => {
    // mbështetem (I rely) is one letter away from mbështetëm (we leaned): a word the lists do not know must not become it
    const k = (w: string) => w === 'mbështetëm' || w === 'çfarë';
    expect(restoreDiacritics('mbështetem', k)).toEqual([]);
    expect(restoreDiacritics('çfare', k)).toEqual([]);
    expect(restoreDiacritics('mbeshtetem', k)).toEqual(['mbështetëm']);
  });
  it('returns several candidates, fewest changes first, then alphabetical', () => {
    const known = new Set(['ceme', 'çemë', 'çeme', 'cëme', 'cemë']);
    expect(restoreDiacritics('ceme', (w) => known.has(w))).toEqual(['cemë', 'cëme', 'çeme', 'çemë']);
  });
  it('never returns the input, even when it is itself known', () => {
    const r = restoreDiacritics('eshte', () => true);
    expect(r).not.toContain('eshte');
    expect(r).toContain('është');
  });
  it('is empty when nothing known fits or there is nothing to restore', () => {
    expect(restoreDiacritics('eshte', () => false)).toEqual([]);
    expect(restoreDiacritics('tani', () => true)).toEqual([]);
    expect(restoreDiacritics('', () => true)).toEqual([]);
  });
  it('is capped: more than 12 e / c positions returns []', () => {
    expect(restoreDiacritics('e'.repeat(13), () => true)).toEqual([]);
    expect(restoreDiacritics('ec'.repeat(7), () => true)).toEqual([]);
    expect(restoreDiacritics('e'.repeat(12), () => true)).toHaveLength(4095);
  });
  it('is deterministic', () => {
    const k = (w: string) => w.length > 0 && w !== 'cecece';
    expect(restoreDiacritics('cecece', k)).toEqual(restoreDiacritics('cecece', k));
  });
});

// ───────────────────────────── sentences ─────────────────────────────

describe('segmentSqSentences', () => {
  const split = (t: string) => segmentSqSentences(t).map((s) => s.text);

  it('splits at . ? ! …', () => {
    expect(split('Ai erdhi. Ajo iku.')).toEqual(['Ai erdhi.', 'Ajo iku.']);
    expect(split('Ku shkon? Në shkollë! Mirë.')).toEqual(['Ku shkon?', 'Në shkollë!', 'Mirë.']);
    expect(split('Ai erdhi… Ajo iku.')).toEqual(['Ai erdhi…', 'Ajo iku.']);
  });
  it('p.sh. does not end a sentence', () => {
    expect(split('Ka shumë fruta, p.sh. mollë dhe dardhë, në treg. Ne blemë disa.')).toEqual([
      'Ka shumë fruta, p.sh. mollë dhe dardhë, në treg.',
      'Ne blemë disa.',
    ]);
  });
  it('etj. continues before lower case and may end a sentence before a capital', () => {
    expect(split('Kemi mollë, dardhë etj. dhe shumë të tjera.')).toEqual(['Kemi mollë, dardhë etj. dhe shumë të tjera.']);
    expect(split('Kemi mollë, dardhë etj. Ai erdhi.')).toEqual(['Kemi mollë, dardhë etj.', 'Ai erdhi.']);
  });
  it('titles: Dr., Prof., z., znj., zj.', () => {
    expect(split('Dr. Hoxha erdhi. Ai foli.')).toEqual(['Dr. Hoxha erdhi.', 'Ai foli.']);
    expect(split('Prof. Gjoni dhe znj. Elda erdhën. Pastaj shkuan.')).toEqual(['Prof. Gjoni dhe znj. Elda erdhën.', 'Pastaj shkuan.']);
    expect(split('Ai takoi z. Gjoni. Pastaj shkoi.')).toEqual(['Ai takoi z. Gjoni.', 'Pastaj shkoi.']);
    expect(split('Ajo takoi zj. Mira. Pastaj iku.')).toEqual(['Ajo takoi zj. Mira.', 'Pastaj iku.']);
  });
  it('nr., fq., shek., vj. do not end a sentence', () => {
    expect(split('Shiko nr. 5 në fq. 12. Pastaj lexo.')).toEqual(['Shiko nr. 5 në fq. 12.', 'Pastaj lexo.']);
    expect(split('Kjo ndodhi në shek. XX dhe më vonë. Mirë.')).toEqual(['Kjo ndodhi në shek. XX dhe më vonë.', 'Mirë.']);
    expect(split('Ai ka 25 vj. Ajo erdhi.')).toEqual(['Ai ka 25 vj. Ajo erdhi.']); // known limit: vj. followed by a capital continues
  });
  it('p.e.s. and e.s. stay inside the sentence', () => {
    expect(split('Ndodhi në vitin 50 p.e.s. dhe në vitin 30 e.s. në qytet.')).toEqual(['Ndodhi në vitin 50 p.e.s. dhe në vitin 30 e.s. në qytet.']);
    expect(split('Ndodhi në vitin 50 p.e.s. Pastaj iku.')).toEqual(['Ndodhi në vitin 50 p.e.s. Pastaj iku.']); // known limit
  });
  it('initials: N. Frashëri, Gj. Fishta', () => {
    expect(split('Ai është N. Frashëri. Ai shkroi.')).toEqual(['Ai është N. Frashëri.', 'Ai shkroi.']);
    expect(split('Gj. Fishta shkroi shumë. Ai vdiq.')).toEqual(['Gj. Fishta shkroi shumë.', 'Ai vdiq.']);
  });
  it('a lower-case letter word ends a sentence before a capital', () => {
    expect(split('Shkronja e parë është a. Pastaj vjen b.')).toEqual(['Shkronja e parë është a.', 'Pastaj vjen b.']);
  });
  it('decimals and dates hold together', () => {
    expect(split('Çmimi është 3.5 euro. Shumë.')).toEqual(['Çmimi është 3.5 euro.', 'Shumë.']);
    expect(split('Më 12.10.2026 ai erdhi. Mirë.')).toEqual(['Më 12.10.2026 ai erdhi.', 'Mirë.']);
  });
  it('a newline between turns or lines always splits (dialogue dashes)', () => {
    expect(split('— Ku shkon?\n— Në shkollë.')).toEqual(['— Ku shkon?', '— Në shkollë.']);
    expect(split('– Mirë\n– Po')).toEqual(['– Mirë', '– Po']);
    expect(split('Rreshti një\nRreshti dy')).toEqual(['Rreshti një', 'Rreshti dy']);
  });
  it('a narrator remark after a dash stays with the speech; a dash after a finished sentence starts a new one', () => {
    expect(split('— Ku shkon? — pyeti ai. — Në shkollë.')).toEqual(['— Ku shkon? — pyeti ai.', '— Në shkollë.']);
    expect(split('Ai hyri. — Përshëndetje!')).toEqual(['Ai hyri.', '— Përshëndetje!']);
  });
  it('quotation marks stay with their sentence', () => {
    expect(split('«Erdha.» Pastaj iku.')).toEqual(['«Erdha.»', 'Pastaj iku.']);
    expect(split('Ai tha: „Mirë.“ Pastaj iku.')).toEqual(['Ai tha: „Mirë.“', 'Pastaj iku.']);
    expect(split('Ai tha: “Mirë.” Pastaj iku.')).toEqual(['Ai tha: “Mirë.”', 'Pastaj iku.']);
  });
  it('a quoted question that carries on in lower case is one sentence', () => {
    expect(split('«Ku shkon?» pyeti ai. Ajo iku.')).toEqual(['«Ku shkon?» pyeti ai.', 'Ajo iku.']);
  });
  it('an ellipsis carries on in lower case but breaks before a capital', () => {
    expect(split('Mirë… atëherë shkojmë. Po.')).toEqual(['Mirë… atëherë shkojmë.', 'Po.']);
    expect(split('Mirë... atëherë shkojmë.')).toEqual(['Mirë... atëherë shkojmë.']);
    expect(split('Mirë... Atëherë shkojmë.')).toEqual(['Mirë...', 'Atëherë shkojmë.']);
  });
  it('every span is an exact trimmed slice of the text', () => {
    const text = '  Dr. Hoxha tha: «Ku shkon?» Ai u përgjigj.\n— Në shkollë, p.sh. sot… dhe nesër.\r\n\r\nN. Frashëri erdhi!  Ora është 3.5 etj. Mirë.  ';
    const spans = segmentSqSentences(text);
    expect(spans.length).toBeGreaterThan(4);
    for (const s of spans) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
      expect(s.text).toBe(s.text.trim());
      expect(s.text.length).toBeGreaterThan(0);
    }
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
  });
  it('empty or blank text has no sentences', () => {
    expect(split('')).toEqual([]);
    expect(split('  \n ')).toEqual([]);
  });
});

// ───────────────────────────── varieties ─────────────────────────────

describe('SQ_VARIETIES', () => {
  it('has exactly the agreed codes', () => {
    // 'sq-ascii' (typed without ë and ç) was added by the coordinator: a habit of typing, kind 'feature', not a variety of the language
    expect(Object.keys(SQ_VARIETIES).sort()).toEqual(['aae', 'aat', 'aln', 'aln-AL', 'aln-XK', 'als', 'sq', 'sq-ascii', 'sq-hist', 'sq-pre1908', 'sq-pre1972']);
    for (const [code, v] of Object.entries(SQ_VARIETIES)) {
      expect(v.code).toBe(code);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.note && v.note.length).toBeGreaterThan(0);
    }
  });
  it('kinds and parents', () => {
    expect(SQ_VARIETIES.sq.kind).toBe('supranational');
    expect(SQ_VARIETIES.sq.parent).toBeUndefined();
    for (const c of ['aln', 'als', 'aae', 'aat', 'aln-XK', 'aln-AL']) expect(SQ_VARIETIES[c].kind).toBe('regional');
    expect(SQ_VARIETIES['aln-XK'].parent).toBe('aln');
    expect(SQ_VARIETIES['aln-AL'].parent).toBe('aln');
    for (const c of ['aln', 'als', 'aae', 'aat']) expect(SQ_VARIETIES[c].parent).toBeUndefined();
    expect(SQ_VARIETIES['sq-hist'].kind).toBe('historical');
    expect(SQ_VARIETIES['sq-pre1972'].parent).toBe('sq-hist');
    expect(SQ_VARIETIES['sq-pre1908'].parent).toBe('sq-hist');
    expect(SQ_VARIETIES['sq-pre1972'].kind).toBe('historical');
  });
  it('varietyStanding for a Standard Albanian learner', () => {
    const policy = { target: 'sq', within: [] as string[] };
    const st = (tags: string[]) => varietyStanding(tags, policy, SQ_VARIETIES);
    expect(st([])).toBe('general');
    expect(st(['sq'])).toBe('target');
    expect(st(['aln'])).toBe('receptive');
    expect(st(['aln-XK'])).toBe('receptive');
    expect(st(['aln-AL'])).toBe('receptive');
    expect(st(['als'])).toBe('receptive');
    expect(st(['aae'])).toBe('receptive');
    expect(st(['aat'])).toBe('receptive');
    expect(st(['sq-hist'])).toBe('historical');
    expect(st(['sq-pre1972'])).toBe('historical');
    expect(st(['sq-pre1908'])).toBe('historical');
  });
});

describe('sqVarietiesFromTags', () => {
  it('maps region and usage labels, case-insensitively', () => {
    expect(sqVarietiesFromTags(['Gheg'])).toEqual(['aln']);
    expect(sqVarietiesFromTags(['Tosk'])).toEqual(['als']);
    expect(sqVarietiesFromTags(['Kosovo'])).toEqual(['aln-XK']);
    expect(sqVarietiesFromTags(['Arbëresh'])).toEqual(['aae']);
    expect(sqVarietiesFromTags(['Arbëreshë'])).toEqual(['aae']);
    expect(sqVarietiesFromTags(['arbereshe'])).toEqual(['aae']);
    expect(sqVarietiesFromTags(['Arvanitika'])).toEqual(['aat']);
    expect(sqVarietiesFromTags(['ARCHAIC'])).toEqual(['sq-hist']);
    expect(sqVarietiesFromTags(['obsolete'])).toEqual(['sq-hist']);
  });
  it('"dated" is not older Albanian, a bare "dialectal" names no dialect, unknown labels are ignored', () => {
    expect(sqVarietiesFromTags(['dated'])).toEqual([]);
    expect(sqVarietiesFromTags(['dialectal'])).toEqual([]);
    expect(sqVarietiesFromTags(['colloquial', 'Elbasan', 'Tirana'])).toEqual([]);
    expect(sqVarietiesFromTags([])).toEqual([]);
  });
  it('a Kosovo label is not widened to Gheg and Gheg is not narrowed to Kosovo', () => {
    expect(sqVarietiesFromTags(['Kosovo'])).not.toContain('aln');
    expect(sqVarietiesFromTags(['Gheg'])).not.toContain('aln-XK');
  });
  it('de-duplicates and keeps the order given', () => {
    expect(sqVarietiesFromTags(['archaic', 'Gheg', 'obsolete', 'Gheg', 'Kosovo'])).toEqual(['sq-hist', 'aln', 'aln-XK']);
  });
});

// ───────────────────────────── dictionary labels → features ─────────────────────────────

describe('sqMorphFromTags', () => {
  it('case, number and definiteness; Gen + Dat is a union', () => {
    expect(sqMorphFromTags(['genitive', 'dative', 'singular', 'indefinite'])).toEqual({ Case: 'Gen,Dat', Number: 'Sing', Definite: 'Ind' });
    expect(sqMorphFromTags(['dative', 'genitive', 'ablative'])).toEqual({ Case: 'Gen,Dat,Abl' });
    expect(sqMorphFromTags(['nominative', 'definite', 'masculine', 'plural'])).toEqual({ Case: 'Nom', Definite: 'Def', Gender: 'Masc', Number: 'Plur' });
    expect(sqMorphFromTags(['accusative', 'feminine', 'neuter'])).toEqual({ Case: 'Acc', Gender: 'Fem,Neut' });
  });
  it('a finite verb form gets VerbForm Fin', () => {
    expect(sqMorphFromTags(['first-person', 'singular', 'present', 'indicative', 'active'])).toEqual({
      Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin',
    });
    expect(sqMorphFromTags(['imperative', 'second-person', 'plural'])).toEqual({ Mood: 'Imp', Person: '2', Number: 'Plur', VerbForm: 'Fin' });
    expect(sqMorphFromTags(['subjunctive', 'present', 'third-person'])).toMatchObject({ Mood: 'Sub', Tense: 'Pres', Person: '3', VerbForm: 'Fin' });
  });
  it('the aorist is Tense Past; imperfect is Imp; optative and admirative are moods', () => {
    expect(sqMorphFromTags(['aorist', 'third-person'])).toMatchObject({ Tense: 'Past', Person: '3' });
    expect(sqMorphFromTags(['imperfect'])).toMatchObject({ Tense: 'Imp', VerbForm: 'Fin' });
    expect(sqMorphFromTags(['optative'])).toMatchObject({ Mood: 'Opt' });
    expect(sqMorphFromTags(['admirative'])).toMatchObject({ Mood: 'Adm' });
  });
  it('mediopassive, passive and non-active are all Voice Mid', () => {
    for (const t of ['mediopassive', 'passive', 'non-active']) expect(sqMorphFromTags([t])).toMatchObject({ Voice: 'Mid' });
    expect(sqMorphFromTags(['mediopassive', 'passive'])).toMatchObject({ Voice: 'Mid' });
    expect(sqMorphFromTags(['active', 'mediopassive'])).toMatchObject({ Voice: 'Act,Mid' });
  });
  it('a participle is VerbForm Part, not Fin', () => {
    expect(sqMorphFromTags(['participle'])).toEqual({ VerbForm: 'Part' });
  });
  it('labels are compared case-insensitively; unknown labels are ignored', () => {
    expect(sqMorphFromTags(['Aorist', 'Third-Person', 'SINGULAR'])).toEqual({ Tense: 'Past', Person: '3', Number: 'Sing', VerbForm: 'Fin' });
    expect(sqMorphFromTags(['dialectal', 'foo', 'past'])).toEqual({});
    expect(sqMorphFromTags([])).toEqual({});
  });
});

// ───────────────────────────── Gheg ↔ Standard ─────────────────────────────

const STANDARD = new Set([
  'është', "s'është", 'një', 'shtëpi', 'shtëpia', 'duke', 'tani', 'çfarë', 'unë', 'qenë', 'punuar', 'shkruar', 'kthyer',
  'grua', 'dua', 'mua', 'duar', 'bëj', 'nënë', 'zëri', 'verë', 'shqipëria', 'kam', 'ke', 'mirë', 'bana', 'mbarë',
]);
const known = (f: string) => STANDARD.has(f);
const std = (form: string) => ghegToStandard(form, known).map((c) => c.standard);

describe('ghegToStandard', () => {
  it('listed pairs, confidence 0.8, variety aln', () => {
    for (const f of ['âsht', 'asht', 'âshtë', 'ashtë']) {
      const r = ghegToStandard(f, known);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ standard: 'është', confidence: 0.8, variety: 'aln' });
      expect(r[0].rule.length).toBeGreaterThan(5);
    }
    expect(std("s'âsht")).toEqual(["s'është"]);
    expect(std('s’asht')).toEqual(["s'është"]);
    expect(std('nji')).toEqual(['një']);
    expect(std('shpi')).toEqual(['shtëpi']);
    expect(std('shpia')).toEqual(['shtëpia']);
    expect(std('tue')).toEqual(['duke']);
    expect(std('tash')).toEqual(['tani']);
    expect(std('çka')).toEqual(['çfarë']);
    expect(std('un')).toEqual(['unë']);
    expect(std('kênë')).toEqual(['qenë']);
  });
  it('a listed pair is only offered when the Standard form is known', () => {
    expect(ghegToStandard('nji', () => false)).toEqual([]);
  });
  it('a Standard word is not bridged, and identities are not listed', () => {
    for (const w of ['është', 'një', 'kam', 'ke', 'mirë', 'bana', 'verë']) expect(std(w)).toEqual([]);
  });
  it('nasal vowels: â → ë, with rhotacism only alongside a nasal mark', () => {
    expect(ghegToStandard('bâj', known)).toEqual([expect.objectContaining({ standard: 'bëj', confidence: 0.6, variety: 'aln' })]);
    expect(std('nânë')).toEqual(['nënë']);
    const z = ghegToStandard('zâni', known);
    expect(z.map((c) => c.standard)).toEqual(['zëri']);
    expect(z[0].confidence).toBe(0.5);
    expect(z[0].rule).toMatch(/rhotacism/);
    expect(std('ZÂNI')).toEqual(['zëri']); // case is folded
  });
  it('rhotacism alone does not fire', () => {
    expect(std('venë')).toEqual([]); // verë is known, but there is no Gheg mark
    expect(std('shqipnia')).toEqual([]);
    expect(std('zani')).toEqual([]);
  });
  it('participles in -ue / -ye', () => {
    expect(ghegToStandard('punue', known)).toEqual([expect.objectContaining({ standard: 'punuar', confidence: 0.55 })]);
    expect(std('shkrue')).toEqual(['shkruar']);
    expect(std('kthye')).toEqual(['kthyer']);
  });
  it('-ue- → -ua-: grue → grua, due → dua, mue → mua, and short stems are not read as participles', () => {
    expect(std('grue')).toEqual(['grua']);
    expect(std('due')).toEqual(['dua']); // not "duar" (hands)
    expect(std('mue')).toEqual(['mua']);
    expect(ghegToStandard('grue', known)[0].confidence).toBe(0.5);
  });
  it('returns [] when no candidate is known, and never the input', () => {
    expect(std('zzzâ')).toEqual([]);
    expect(std('')).toEqual([]);
    const all = (f: string) => f !== 'nânë';
    const r = ghegToStandard('nânë', all);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.map((c) => c.standard)).not.toContain('nânë');
  });
  it('at most three, best first, deterministic', () => {
    const r1 = ghegToStandard('nânë', (f) => f !== 'nânë');
    const r2 = ghegToStandard('nânë', (f) => f !== 'nânë');
    expect(r1).toHaveLength(3);
    expect(r1).toEqual(r2);
    for (let i = 1; i < r1.length; i++) expect(r1[i - 1].confidence).toBeGreaterThanOrEqual(r1[i].confidence);
    expect(r1[0].standard).toBe('nënë');
  });
});

// ───────────────────────────── older spelling ─────────────────────────────

describe('historicalToModern', () => {
  const hist = (form: string) => historicalToModern(form, known);
  it('nji, tue, âsht: tagged sq-pre1972 and described as older Gheg-based spelling', () => {
    for (const [f, s] of [['nji', 'një'], ['tue', 'duke'], ['âsht', 'është'], ['asht', 'është']] as const) {
      const r = hist(f);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ standard: s, variety: 'sq-pre1972', confidence: 0.8 });
      expect(r[0].rule).toMatch(/Older Gheg-based spelling/);
    }
  });
  it('participles and nasal vowel marks', () => {
    expect(hist('punue')[0]).toMatchObject({ standard: 'punuar', variety: 'sq-pre1972' });
    expect(hist('bâj')[0]).toMatchObject({ standard: 'bëj', variety: 'sq-pre1972' });
    expect(hist('grue')[0]).toMatchObject({ standard: 'grua' });
  });
  it('claims nothing it is not sure of: no rhotacism, no dialect vocabulary, no Standard words', () => {
    expect(hist('zâni')).toEqual([]); // zëri needs rhotacism, a dialect feature
    expect(hist('tash')).toEqual([]);
    expect(hist('çka')).toEqual([]);
    expect(hist('një')).toEqual([]);
    expect(hist('shtëpi')).toEqual([]);
    expect(hist('')).toEqual([]);
  });
});
