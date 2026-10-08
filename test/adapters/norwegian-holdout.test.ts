/**
 * Norwegian blind holdout evaluation set.
 *
 * Machine-drafted holdout, written without seeing the lexicon; needs native review.
 *
 * The sentences and annotations below were written independently of src/adapters/norwegian/ (never read by the
 * author). Each word is "surface/lemma/POS". Conventions used for the annotation (UD-flavoured):
 *   - lemmas are lowercase; verbs in the infinitive; nouns singular indefinite; adjectives positive base form
 *     (eldre -> gammel, minste -> liten, billigere -> billig, nærmeste -> nær);
 *   - the article en/ei/et is DET with lemma "en" (Bokmål) and "ein" (Nynorsk); den/det as definite/demonstrative
 *     determiner is DET "den", the pronoun "det" is PRON "det";
 *   - possessives (min, vår, mi ...) are DET with the masculine singular lemma (min, vår); mine/mi/mitt -> "min";
 *   - ikke/ikkje are ADV; "å" is PART; the particle of a particle verb (stå OPP, slå PÅ, finne UT) is ADV;
 *   - modals (kan, vil, må, skal), the copula "være" and the perfect/passive auxiliaries (ha, bli) are AUX; "ha" as a
 *     main verb ("har to barn") is VERB; modals use the infinitive as lemma: kan -> kunne, vil -> ville, må -> måtte,
 *     skal -> skulle;
 *   - og/men/eller are CONJ (the PartOfSpeech union has CONJ, not CCONJ); at/hvis/når/fordi/mens/siden/før(+clause)/
 *     som/enn/dersom are SCONJ;
 *   - compounds are one lemma (kjøkkenbord, fotballkamp, barnehage); proper nouns are PROPN with a lowercase lemma;
 *   - numbers are spelled out and are NUM.
 *
 * Scoring: the FIRST candidate of each word is compared to the annotation (lemma lowercased; pos exact). The test
 * never fails on accuracy; it prints the numbers and every mismatch with console.info.
 */
import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { adapter } from './helpers';

type Sentence = readonly [text: string, annotation: string];

const NB: readonly Sentence[] = [
  ['Hei, hvordan går det med deg?', 'Hei/hei/INTJ hvordan/hvordan/ADV går/gå/VERB det/det/PRON med/med/ADP deg/du/PRON'],
  ['God morgen, jeg heter Kari.', 'God/god/ADJ morgen/morgen/NOUN jeg/jeg/PRON heter/hete/VERB Kari/kari/PROPN'],
  ['Takk for maten, den var veldig god.', 'Takk/takk/INTJ for/for/ADP maten/mat/NOUN den/den/PRON var/være/AUX veldig/veldig/ADV god/god/ADJ'],
  ['Min mor og min far bor i Bergen.', 'Min/min/DET mor/mor/NOUN og/og/CONJ min/min/DET far/far/NOUN bor/bo/VERB i/i/ADP Bergen/bergen/PROPN'],
  ['Søsteren min er tre år eldre enn meg.', 'Søsteren/søster/NOUN min/min/DET er/være/AUX tre/tre/NUM år/år/NOUN eldre/gammel/ADJ enn/enn/SCONJ meg/jeg/PRON'],
  ['Broren min har to barn, og de bor i Trondheim.', 'Broren/bror/NOUN min/min/DET har/ha/VERB to/to/NUM barn/barn/NOUN og/og/CONJ de/de/PRON bor/bo/VERB i/i/ADP Trondheim/trondheim/PROPN'],
  ['Bestemor kommer på besøk i morgen.', 'Bestemor/bestemor/NOUN kommer/komme/VERB på/på/ADP besøk/besøk/NOUN i/i/ADP morgen/morgen/NOUN'],
  ['Huset vårt har et stort kjøkken og tre soverom.', 'Huset/hus/NOUN vårt/vår/DET har/ha/VERB et/en/DET stort/stor/ADJ kjøkken/kjøkken/NOUN og/og/CONJ tre/tre/NUM soverom/soverom/NOUN'],
  ['Vi spiser middag ved kjøkkenbordet hver kveld.', 'Vi/vi/PRON spiser/spise/VERB middag/middag/NOUN ved/ved/ADP kjøkkenbordet/kjøkkenbord/NOUN hver/hver/DET kveld/kveld/NOUN'],
  ['Jeg står opp klokka sju hver dag.', 'Jeg/jeg/PRON står/stå/VERB opp/opp/ADV klokka/klokke/NOUN sju/sju/NUM hver/hver/DET dag/dag/NOUN'],
  ['Hun slår på lyset og setter seg ved bordet.', 'Hun/hun/PRON slår/slå/VERB på/på/ADV lyset/lys/NOUN og/og/CONJ setter/sette/VERB seg/seg/PRON ved/ved/ADP bordet/bord/NOUN'],
  ['Vi har endelig funnet ut hva som har skjedd.', 'Vi/vi/PRON har/ha/AUX endelig/endelig/ADV funnet/finne/VERB ut/ut/ADV hva/hva/PRON som/som/SCONJ har/ha/AUX skjedd/skje/VERB'],
  ['Jeg vet at han ikke kommer i dag.', 'Jeg/jeg/PRON vet/vite/VERB at/at/SCONJ han/han/PRON ikke/ikke/ADV kommer/komme/VERB i/i/ADP dag/dag/NOUN'],
  ['Hvis det regner, går vi ikke ut.', 'Hvis/hvis/SCONJ det/det/PRON regner/regne/VERB går/gå/VERB vi/vi/PRON ikke/ikke/ADV ut/ut/ADV'],
  ['Det er kaldt ute, men jeg liker snø.', 'Det/det/PRON er/være/AUX kaldt/kald/ADJ ute/ute/ADV men/men/CONJ jeg/jeg/PRON liker/like/VERB snø/snø/NOUN'],
  ['Om vinteren faller det snø på fjellet.', 'Om/om/ADP vinteren/vinter/NOUN faller/falle/VERB det/det/PRON snø/snø/NOUN på/på/ADP fjellet/fjell/NOUN'],
  ['Sola skinner, og himmelen er blå.', 'Sola/sol/NOUN skinner/skinne/VERB og/og/CONJ himmelen/himmel/NOUN er/være/AUX blå/blå/ADJ'],
  ['Vi tok toget fra Oslo til Bergen.', 'Vi/vi/PRON tok/ta/VERB toget/tog/NOUN fra/fra/ADP Oslo/oslo/PROPN til/til/ADP Bergen/bergen/PROPN'],
  ['Hva koster billetten?', 'Hva/hva/PRON koster/koste/VERB billetten/billett/NOUN'],
  ['Kan du hjelpe meg å finne bussholdeplassen?', 'Kan/kunne/AUX du/du/PRON hjelpe/hjelpe/VERB meg/jeg/PRON å/å/PART finne/finne/VERB bussholdeplassen/bussholdeplass/NOUN'],
  ['Jeg vil gjerne ha en kopp kaffe og to brødskiver.', 'Jeg/jeg/PRON vil/ville/AUX gjerne/gjerne/ADV ha/ha/VERB en/en/DET kopp/kopp/NOUN kaffe/kaffe/NOUN og/og/CONJ to/to/NUM brødskiver/brødskive/NOUN'],
  ['Eplene er billigere i butikken enn på torget.', 'Eplene/eple/NOUN er/være/AUX billigere/billig/ADJ i/i/ADP butikken/butikk/NOUN enn/enn/SCONJ på/på/ADP torget/torg/NOUN'],
  ['Vi må handle melk, brød og ost før middag.', 'Vi/vi/PRON må/måtte/AUX handle/handle/VERB melk/melk/NOUN brød/brød/NOUN og/og/CONJ ost/ost/NOUN før/før/ADP middag/middag/NOUN'],
  ['Datteren min begynte på skolen i august.', 'Datteren/datter/NOUN min/min/DET begynte/begynne/VERB på/på/ADP skolen/skole/NOUN i/i/ADP august/august/NOUN'],
  ['Læreren ga barna en ny bok.', 'Læreren/lærer/NOUN ga/gi/VERB barna/barn/NOUN en/en/DET ny/ny/ADJ bok/bok/NOUN'],
  ['Den minste gutten går i barnehagen.', 'Den/den/DET minste/liten/ADJ gutten/gutt/NOUN går/gå/VERB i/i/ADP barnehagen/barnehage/NOUN'],
  ['Fotballkampen begynner klokka seks.', 'Fotballkampen/fotballkamp/NOUN begynner/begynne/VERB klokka/klokke/NOUN seks/seks/NUM'],
  ['Jeg har spilt fotball siden jeg var liten.', 'Jeg/jeg/PRON har/ha/AUX spilt/spille/VERB fotball/fotball/NOUN siden/siden/SCONJ jeg/jeg/PRON var/være/AUX liten/liten/ADJ'],
  ['Hun jobber på sykehuset hver dag.', 'Hun/hun/PRON jobber/jobbe/VERB på/på/ADP sykehuset/sykehus/NOUN hver/hver/DET dag/dag/NOUN'],
  ['Sjefen min sa at møtet var flyttet til fredag.', 'Sjefen/sjef/NOUN min/min/DET sa/si/VERB at/at/SCONJ møtet/møte/NOUN var/være/AUX flyttet/flytte/VERB til/til/ADP fredag/fredag/NOUN'],
  ['Hvorfor kom du ikke på jobb i dag?', 'Hvorfor/hvorfor/ADV kom/komme/VERB du/du/PRON ikke/ikke/ADV på/på/ADP jobb/jobb/NOUN i/i/ADP dag/dag/NOUN'],
  ['Jeg har ikke tid til å lese avisen.', 'Jeg/jeg/PRON har/ha/VERB ikke/ikke/ADV tid/tid/NOUN til/til/ADP å/å/PART lese/lese/VERB avisen/avis/NOUN'],
  ['Skal vi gå en tur når det slutter å regne?', 'Skal/skulle/AUX vi/vi/PRON gå/gå/VERB en/en/DET tur/tur/NOUN når/når/SCONJ det/det/PRON slutter/slutte/VERB å/å/PART regne/regne/VERB'],
  ['Vi reiste til Lofoten i sommer og bodde i en rorbu.', 'Vi/vi/PRON reiste/reise/VERB til/til/ADP Lofoten/lofoten/PROPN i/i/ADP sommer/sommer/NOUN og/og/CONJ bodde/bo/VERB i/i/ADP en/en/DET rorbu/rorbu/NOUN'],
  ['Flyet fra Tromsø var forsinket i to timer.', 'Flyet/fly/NOUN fra/fra/ADP Tromsø/tromsø/PROPN var/være/AUX forsinket/forsinket/ADJ i/i/ADP to/to/NUM timer/time/NOUN'],
  ['Bilen vår ble reparert på verkstedet.', 'Bilen/bil/NOUN vår/vår/DET ble/bli/AUX reparert/reparere/VERB på/på/ADP verkstedet/verksted/NOUN'],
  ['Jeg vokste opp i en kristen familie, men jeg ble ikke frelst før jeg var tjue år.', 'Jeg/jeg/PRON vokste/vokse/VERB opp/opp/ADV i/i/ADP en/en/DET kristen/kristen/ADJ familie/familie/NOUN men/men/CONJ jeg/jeg/PRON ble/bli/AUX ikke/ikke/ADV frelst/frelse/VERB før/før/SCONJ jeg/jeg/PRON var/være/AUX tjue/tjue/NUM år/år/NOUN'],
  ['Da forstod jeg at Jesus døde for meg på korset.', 'Da/da/ADV forstod/forstå/VERB jeg/jeg/PRON at/at/SCONJ Jesus/jesus/PROPN døde/dø/VERB for/for/ADP meg/jeg/PRON på/på/ADP korset/kors/NOUN'],
  ['Gud tilgav syndene mine, og jeg fikk et nytt liv.', 'Gud/gud/PROPN tilgav/tilgi/VERB syndene/synd/NOUN mine/min/DET og/og/CONJ jeg/jeg/PRON fikk/få/VERB et/en/DET nytt/ny/ADJ liv/liv/NOUN'],
  ['Nå ber jeg til Gud hver morgen, og jeg takker ham for nåden.', 'Nå/nå/ADV ber/be/VERB jeg/jeg/PRON til/til/ADP Gud/gud/PROPN hver/hver/DET morgen/morgen/NOUN og/og/CONJ jeg/jeg/PRON takker/takke/VERB ham/han/PRON for/for/ADP nåden/nåde/NOUN'],
  ['Vi går i kirka hver søndag og synger sammen.', 'Vi/vi/PRON går/gå/VERB i/i/ADP kirka/kirke/NOUN hver/hver/DET søndag/søndag/NOUN og/og/CONJ synger/synge/VERB sammen/sammen/ADV'],
  ['Jeg er takknemlig fordi Gud har hjulpet meg hver dag.', 'Jeg/jeg/PRON er/være/AUX takknemlig/takknemlig/ADJ fordi/fordi/SCONJ Gud/gud/PROPN har/ha/AUX hjulpet/hjelpe/VERB meg/jeg/PRON hver/hver/DET dag/dag/NOUN'],
  ['Hvem er den mannen som står ved døra?', 'Hvem/hvem/PRON er/være/AUX den/den/DET mannen/mann/NOUN som/som/SCONJ står/stå/VERB ved/ved/ADP døra/dør/NOUN'],
  ['Hvor ligger den nærmeste butikken?', 'Hvor/hvor/ADV ligger/ligge/VERB den/den/DET nærmeste/nær/ADJ butikken/butikk/NOUN'],
  ['Når kommer du hjem fra jobben?', 'Når/når/ADV kommer/komme/VERB du/du/PRON hjem/hjem/ADV fra/fra/ADP jobben/jobb/NOUN'],
  ['Jeg synes at boka er veldig spennende.', 'Jeg/jeg/PRON synes/synes/VERB at/at/SCONJ boka/bok/NOUN er/være/AUX veldig/veldig/ADV spennende/spennende/ADJ'],
  ['Naboen vår har kjøpt en ny sofa, og den er rød.', 'Naboen/nabo/NOUN vår/vår/DET har/ha/AUX kjøpt/kjøpe/VERB en/en/DET ny/ny/ADJ sofa/sofa/NOUN og/og/CONJ den/den/PRON er/være/AUX rød/rød/ADJ'],
  ['Hun sa at hun ikke hadde sett ham før.', 'Hun/hun/PRON sa/si/VERB at/at/SCONJ hun/hun/PRON ikke/ikke/ADV hadde/ha/AUX sett/se/VERB ham/han/PRON før/før/ADV'],
  ['Jenta leser ei bok på kjøkkenet, mens mora lager mat.', 'Jenta/jente/NOUN leser/lese/VERB ei/en/DET bok/bok/NOUN på/på/ADP kjøkkenet/kjøkken/NOUN mens/mens/SCONJ mora/mor/NOUN lager/lage/VERB mat/mat/NOUN'],
  ['Ungene har tegnet en stor hund, og læreren har hengt tegninga på veggen.', 'Ungene/unge/NOUN har/ha/AUX tegnet/tegne/VERB en/en/DET stor/stor/ADJ hund/hund/NOUN og/og/CONJ læreren/lærer/NOUN har/ha/AUX hengt/henge/VERB tegninga/tegning/NOUN på/på/ADP veggen/vegg/NOUN'],
];

const NN: readonly Sentence[] = [
  ['Eg heiter Ola og bur i Bergen.', 'Eg/eg/PRON heiter/heite/VERB Ola/ola/PROPN og/og/CONJ bur/bu/VERB i/i/ADP Bergen/bergen/PROPN'],
  ['Mora mi og faren min er heime no.', 'Mora/mor/NOUN mi/min/DET og/og/CONJ faren/far/NOUN min/min/DET er/vere/AUX heime/heime/ADV no/no/ADV'],
  ['Vi et middag ved kjøkkenbordet kvar kveld.', 'Vi/vi/PRON et/ete/VERB middag/middag/NOUN ved/ved/ADP kjøkkenbordet/kjøkkenbord/NOUN kvar/kvar/DET kveld/kveld/NOUN'],
  ['Eg stod opp klokka sju og slo på lyset.', 'Eg/eg/PRON stod/stå/VERB opp/opp/ADV klokka/klokke/NOUN sju/sju/NUM og/og/CONJ slo/slå/VERB på/på/ADV lyset/lys/NOUN'],
  ['Eg veit at ho ikkje kjem i dag.', 'Eg/eg/PRON veit/vite/VERB at/at/SCONJ ho/ho/PRON ikkje/ikkje/ADV kjem/kome/VERB i/i/ADP dag/dag/NOUN'],
  ['Dersom det regnar, går vi ikkje ut.', 'Dersom/dersom/SCONJ det/det/PRON regnar/regne/VERB går/gå/VERB vi/vi/PRON ikkje/ikkje/ADV ut/ut/ADV'],
  ['Det er kaldt ute, men eg likar snø.', 'Det/det/PRON er/vere/AUX kaldt/kald/ADJ ute/ute/ADV men/men/CONJ eg/eg/PRON likar/like/VERB snø/snø/NOUN'],
  ['Dotter mi byrja på skulen i august.', 'Dotter/dotter/NOUN mi/min/DET byrja/byrje/VERB på/på/ADP skulen/skule/NOUN i/i/ADP august/august/NOUN'],
  ['Vi har ein stor hage og ei lita hytte.', 'Vi/vi/PRON har/ha/VERB ein/ein/DET stor/stor/ADJ hage/hage/NOUN og/og/CONJ ei/ein/DET lita/liten/ADJ hytte/hytte/NOUN'],
  ['Gutane har spela fotball på banen.', 'Gutane/gut/NOUN har/ha/AUX spela/spele/VERB fotball/fotball/NOUN på/på/ADP banen/bane/NOUN'],
  ['Læraren sa at møtet ikkje var flytta.', 'Læraren/lærar/NOUN sa/seie/VERB at/at/SCONJ møtet/møte/NOUN ikkje/ikkje/ADV var/vere/AUX flytta/flytte/VERB'],
  ['Kva gjer du etter skulen?', 'Kva/kva/PRON gjer/gjere/VERB du/du/PRON etter/etter/ADP skulen/skule/NOUN'],
  ['Eg trur at Jesus døydde for oss.', 'Eg/eg/PRON trur/tru/VERB at/at/SCONJ Jesus/jesus/PROPN døydde/døy/VERB for/for/ADP oss/vi/PRON'],
  ['Gud tilgav syndene mine, og no bed eg kvar morgon.', 'Gud/gud/PROPN tilgav/tilgi/VERB syndene/synd/NOUN mine/min/DET og/og/CONJ no/no/ADV bed/be/VERB eg/eg/PRON kvar/kvar/DET morgon/morgon/NOUN'],
  ['Vi tok toget frå Oslo til Trondheim og budde der i tre veker.', 'Vi/vi/PRON tok/ta/VERB toget/tog/NOUN frå/frå/ADP Oslo/oslo/PROPN til/til/ADP Trondheim/trondheim/PROPN og/og/CONJ budde/bu/VERB der/der/ADV i/i/ADP tre/tre/NUM veker/veke/NOUN'],
];

interface Gold { surface: string; lemma: string; pos: string }
const parse = (ann: string): Gold[] =>
  ann.split(' ').map((w) => {
    const [surface, lemma, pos] = w.split('/');
    return { surface, lemma, pos };
  });

interface Mismatch { sentence: number; text: string; word: string; goldLemma: string; goldPos: string; gotLemma: string; gotPos: string; kind: string }

function score(lang: LanguageCode, set: readonly Sentence[]) {
  const ad = adapter(lang);
  let words = 0, lemmaOk = 0, posOk = 0, bothOk = 0, unaligned = 0, sentencesAllOk = 0;
  const mismatches: Mismatch[] = [];
  set.forEach(([text, ann], si) => {
    const gold = parse(ann);
    const tokens = ad.tokenize(text);
    const analyses = ad.analyze(tokens);
    let cursor = 0;
    let allOk = true;
    for (const g of gold) {
      words++;
      let ti = -1;
      for (let i = cursor; i < tokens.length; i++) {
        if (tokens[i].isWord && tokens[i].surface.toLowerCase() === g.surface.toLowerCase()) { ti = i; break; }
      }
      if (ti < 0) {
        unaligned++;
        allOk = false;
        mismatches.push({ sentence: si + 1, text, word: g.surface, goldLemma: g.lemma, goldPos: g.pos, gotLemma: '-', gotPos: '-', kind: 'UNALIGNED (no matching word token)' });
        continue;
      }
      cursor = ti + 1;
      const c = analyses[ti]?.candidates?.[0];
      const gotLemma = (c?.lemma ?? '').toLowerCase();
      const gotPos = c?.pos ?? '';
      const l = gotLemma === g.lemma;
      const p = gotPos === g.pos;
      if (l) lemmaOk++;
      if (p) posOk++;
      if (l && p) bothOk++;
      else {
        allOk = false;
        mismatches.push({ sentence: si + 1, text, word: g.surface, goldLemma: g.lemma, goldPos: g.pos, gotLemma: c ? gotLemma : '(no candidate)', gotPos: gotPos || '(none)', kind: !l && !p ? 'lemma+pos' : !l ? 'lemma' : 'pos' });
      }
    }
    if (allOk) sentencesAllOk++;
  });
  return { words, lemmaOk, posOk, bothOk, unaligned, sentencesAllOk, sentences: set.length, mismatches };
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) : 'n/a') + '%';

describe('Norwegian holdout (machine-drafted holdout, written without seeing the lexicon; needs native review)', () => {
  for (const [lang, set] of [['nb', NB], ['nn', NN]] as const) {
    it(`${lang}: scores ${set.length} holdout sentences and reports every mismatch`, () => {
      const r = score(lang, set);
      const lines = [
        `=== NORWEGIAN HOLDOUT [${lang}] ===`,
        `sentences: ${r.sentences}   words scored: ${r.words}   unaligned: ${r.unaligned}`,
        `lemma accuracy: ${r.lemmaOk}/${r.words} = ${pct(r.lemmaOk, r.words)}`,
        `POS accuracy:   ${r.posOk}/${r.words} = ${pct(r.posOk, r.words)}`,
        `lemma+POS both: ${r.bothOk}/${r.words} = ${pct(r.bothOk, r.words)}`,
        `sentences all-correct: ${r.sentencesAllOk}/${r.sentences} = ${pct(r.sentencesAllOk, r.sentences)}`,
        `--- mismatches (${r.mismatches.length}) ---`,
        ...r.mismatches.map((m) => `[${lang} #${m.sentence}] "${m.word}" (${m.kind}): gold ${m.goldLemma}/${m.goldPos}  got ${m.gotLemma}/${m.gotPos}   | ${m.text}`),
      ];
      console.info(lines.join('\n'));
      const scored = r.words - r.unaligned;
      expect(scored).toBeGreaterThan(0);
    });
  }
});
