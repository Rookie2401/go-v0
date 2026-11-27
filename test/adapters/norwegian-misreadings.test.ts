// @vitest-environment node
/**
 * Confident misreadings found by the deck audit (the part-2 residue), Bokmål and Nynorsk. Each block is one cause and its rule: the audit's
 * sentence shape, other sentences of the same shape that are not from the audit, and a counter-example the rule must leave alone.
 * A reading counts as "decided" only when it leads the other by more than 0.15 (the downstream rule: closer than that is undecided).
 * MACHINE-DRAFTED, pending native review.
 */
import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { best, run } from './helpers';

const top = (lang: LanguageCode, text: string, surface: string, nth = 0) => {
  const c = best(run(lang, text), surface, nth);
  return `${c.lemma}/${c.pos}`;
};
const decided = (lang: LanguageCode, text: string, surface: string, nth = 0): boolean => {
  const r = run(lang, text);
  const idx = r.tokens.findIndex((t, i) => t.surface === surface && r.tokens.slice(0, i).filter((u) => u.surface === surface).length === nth);
  const cs = r.analyses[idx].candidates;
  return cs.length < 2 || cs[0].confidence - cs[1].confidence > 0.15;
};

describe('an infinitive after a modal, across an adverb, across "og", and after an inversion', () => {
  it.each([
    ['nb', 'Du bør hvile og drikke mye vann i noen dager.', 'drikke', 'drikke/VERB'],
    ['nb', 'Vi må bade og hvile i dag.', 'hvile', 'hvile/VERB'],
    ['nb', 'Han vil gjerne lære å spille gitar, men har ikke tid nå.', 'lære', 'lære/VERB'],
    ['nb', 'Kan du lære meg norsk?', 'lære', 'lære/VERB'],
    ['nb', 'Kan jeg få regningen, takk?', 'få', 'få/VERB'],
    ['nn', 'Kan eg få rekninga, takk?', 'få', 'få/VERB'],
    ['nn', 'Eg vil lære å bada.', 'bada', 'bade/VERB'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
    expect(decided(lang, text, w)).toBe(true);
  });
  it('leaves the noun alone after a determiner, and få as "few" in front of a plural noun', () => {
    expect(top('nb', 'Hun vil ha en lang hvile.', 'hvile')).toBe('hvile/NOUN');
    expect(top('nb', 'Han har få venner.', 'få')).toBe('få/DET');
  });
});

describe('the numeral tre in front of a noun that is spelled like a verb', () => {
  it.each([
    ['nb', 'Laget vant kampen med tre mål mot ett etter en sterk andre omgang.', 'tre', 'tre/NUM'],
    ['nb', 'Laget vant kampen med tre mål mot ett etter en sterk andre omgang.', 'mål', 'mål/NOUN'],
    ['nb', 'Han scoret tre mål.', 'mål', 'mål/NOUN'],
    ['nn', 'Laget vann kampen med tre mål mot eitt etter ein sterk andre omgang.', 'tre', 'tre/NUM'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
  });
  it('still reads the tree after an article', () => {
    expect(top('nb', 'Vi så et tre i hagen.', 'tre')).toBe('tre/NOUN');
  });
});

describe('an imperative at the head of an instruction, and the second of two coordinated imperatives', () => {
  it.each([
    ['nb', 'Tilsett melet langsomt og rør forsiktig med en tresleiv.', 'rør', 'røre/VERB'],
    ['nb', 'Rør godt og tilsett saltet.', 'Rør', 'røre/VERB'],
    ['nn', 'Skrell potetene og skjer dei i tynne skiver før du kokar dei.', 'skjer', 'skjere/VERB'],
    ['nn', 'Skrell epla og skjer dei i bitar.', 'skjer', 'skjere/VERB'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
    expect(decided(lang, text, w)).toBe(true);
  });
  it('leaves the noun where a noun phrase stands', () => {
    expect(top('nb', 'Et rør lekker i kjelleren.', 'rør')).toBe('rør/NOUN');
  });
});

describe('a noun that is also a verb (stige: ladder) after an article', () => {
  it.each([
    ['nb', 'Det er bare naboen som vil låne en stige.', 'stige/NOUN'],
    ['nb', 'Hun har en stige i garasjen.', 'stige/NOUN'],
    ['nn', 'Det er berre naboen som vil låne ein stige.', 'stige/NOUN'],
    ['nb', 'Vi liker å stige tidlig opp.', 'stige/VERB'],
  ] as const)('%s: "%s" reads stige as %s', (lang, text, want) => {
    expect(top(lang, text, 'stige')).toBe(want);
  });
});

describe('a preposition in front of a number, not the noun "under" (wonder)', () => {
  it.each([
    ['nb', 'Ifølge tall har arbeidsledigheten økt blant unge under tjuefem år.'],
    ['nb', 'Barn under tolv år får rabatt.'],
    ['nb', 'Hun er under tjue år.'],
  ] as const)('%s: "%s"', (lang, text) => {
    expect(top(lang, text, 'under')).toBe('under/ADP');
  });
  it('still reads the noun after an article', () => {
    expect(top('nb', 'Det var et under.', 'under')).toBe('under/NOUN');
  });
});

describe('an adjective that is also a noun or a verb', () => {
  it.each([
    ['nb', 'Ifølge tall har arbeidsledigheten økt blant unge under tjuefem år.', 'unge', 'ung/ADJ'],
    ['nb', 'Biblioteket er stort og lyst, og det har en egen avdeling for barn.', 'lyst', 'lys/ADJ'],
    ['nb', 'Rommet er stort og lyst.', 'lyst', 'lys/ADJ'],
    ['nn', 'Ifølgje undersøkinga søv unge menneske mindre enn eldre gjer.', 'unge', 'ung/ADJ'],
    ['nn', 'Kan du hjelpe meg å bere denne tunge kassa opp trappa?', 'tunge', 'tung/ADJ'],
    ['nn', 'Ho har ei tunge sekk.', 'tunge', 'tung/ADJ'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
    expect(decided(lang, text, w)).toBe(true);
  });
  it('keeps the noun after an article, and the verb that is not a predicate adjective', () => {
    expect(top('nb', 'Hun så en unge i reiret.', 'unge')).toBe('unge/NOUN');
    expect(top('nb', 'Han lyste med lykten og ropte.', 'lyste')).toBe('lyse/VERB');
  });
});

describe('adverbs read as verbs: fortsatt (still), like (just)', () => {
  it.each([
    ['nb', 'Kjæresten min lå fortsatt og sov, så jeg listet meg ut på kjøkkenet.', 'fortsatt', 'fortsatt/ADV'],
    ['nb', 'Han sov fortsatt da jeg kom.', 'fortsatt', 'fortsatt/ADV'],
    ['nb', 'Ulykken skjedde like etter klokken åtte i morges.', 'like', 'like/ADV'],
    ['nb', 'Det skjedde like før lunsj.', 'like', 'like/ADV'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
    expect(decided(lang, text, w)).toBe(true);
  });
  it('keeps the verb after a modal and the participle after har', () => {
    expect(top('nb', 'Jeg vil like å lære mer.', 'like')).toBe('like/VERB');
    expect(top('nb', 'Hun har fortsatt arbeidet sitt.', 'fortsatt')).toBe('fortsette/VERB');
  });
});

describe('"for" before å is the preposition, not the verb fare', () => {
  it.each([
    ['nb', 'Vi bestemte oss for å dra tidligere fordi det begynte å snø.'],
    ['nb', 'Hun gir bort kaken for å glede alle.'],
    ['nn', 'Vi bestemte oss for å reise tidlegare fordi det byrja å snø.'],
  ] as const)('%s: "%s"', (lang, text) => {
    expect(top(lang, text, 'for')).toBe('for/ADP');
  });
});

describe('a verb after "og" with the subject of the first clause: reiste til Spania og badet', () => {
  it.each([
    ['nb', 'I fjor reiste vi til Spania og badet hver eneste dag.', 'badet', 'bade/VERB'],
    ['nb', 'Vi tok en rask pause og badet.', 'badet', 'bade/VERB'],
    ['nn', 'I fjor reiste vi til Spania og bada kvar einaste dag.', 'bada', 'bade/VERB'],
  ] as const)('%s: "%s" reads %s as %s', (lang, text, w, want) => {
    expect(top(lang, text, w)).toBe(want);
    expect(decided(lang, text, w)).toBe(true);
  });
  it('keeps the noun as a subject, and a noun after a copula', () => {
    expect(top('nb', 'Badet var stort og rent.', 'Badet')).toBe('bad/NOUN');
    expect(top('nn', 'Han var fiskar.', 'fiskar')).toBe('fiskar/NOUN');
    expect(top('nn', 'Faren min fortel ofte om då han var fiskar i Nord-Noreg.', 'fiskar')).toBe('fiskar/NOUN');
  });
});

describe('Nynorsk: klare is the verb after å; kvar before a noun phrase is "each"', () => {
  it('reads klare as the verb', () => {
    expect(top('nn', 'Ho trur ikkje at ho kjem til å klare eksamen utan hjelp.', 'klare')).toBe('klare/VERB');
    expect(top('nn', 'Ho vil klare det.', 'klare')).toBe('klare/VERB');
  });
  it('reads kvar as the determiner before an adjective and a noun, and as "where" in a question', () => {
    expect(top('nn', 'I fjor reiste vi til Spania og bada kvar einaste dag.', 'kvar')).toBe('kvar/DET');
    expect(top('nn', 'Kvar dag les eg ei bok.', 'Kvar')).toBe('kvar/DET');
    expect(top('nn', 'Kvar er boka?', 'Kvar')).toBe('kvar/ADV');
  });
});

describe('particle verbs: the nearest particle decides, and a preposition after a noun phrase is not a particle', () => {
  const unitOf = (lang: LanguageCode, text: string, w: string): string | undefined => best(run(lang, text), w).unit?.display;
  it('la i dag fram forslaget til statsbudsjett is legge fram, not legge til', () => {
    expect(unitOf('nb', 'Regjeringen la i dag fram forslaget til statsbudsjett for neste år.', 'la')).toBe('legge fram');
    expect(unitOf('nb', 'Regjeringen la i dag fram forslaget til statsbudsjett for neste år.', 'til')).toBeUndefined();
    expect(unitOf('nb', 'Hun la forslaget til statsbudsjettet i skuffen.', 'la')).toBeUndefined();
    expect(unitOf('nb', 'Han la ved siden av boka et brev til moren.', 'til')).toBeUndefined();
  });
  it('tar den ut av formen is ta ut, and av stays a preposition', () => {
    const text = 'La kaken avkjøles i omtrent en halv time før du tar den ut av formen.';
    expect(unitOf('nb', text, 'tar')).toBe('ta ut');
    expect(unitOf('nb', text, 'av')).toBeUndefined();
    expect(top('nb', text, 'av')).toBe('av/ADP');
  });
  it('legge til and ta av are still found where the particle follows', () => {
    expect(unitOf('nb', 'La oss legge til litt salt.', 'legge')).toBe('legge til');
    expect(unitOf('nb', 'Hun tar av jakken.', 'tar')).toBe('ta av');
    expect(unitOf('nb', 'Han tok med seg hunden.', 'tok')).toBe('ta med');
  });
});
