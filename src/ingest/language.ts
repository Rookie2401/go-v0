/**
 * Which language is this text in? — asked before a text joins a team's reading (GoRead): the Honduras team reads
 * Spanish, so a text in Mandarin, Albanian or English is turned away, kindly, with a reason.
 *
 * Two clues, nothing learned from data: the script of the letters (Han, Thai, Devanagari, Cyrillic, Arabic …), and —
 * for the Latin script — which language's commonest words fill the text. A short text (under 40 words) is not judged.
 * The guess names a language only when it is sure; when it is not, the text passes, and the quality check (which
 * looks at the same clues from the other side) still reports what it sees.
 */
import type { LanguageCode } from '../core';

/** A language the guesser can name: those of the courses, and the neighbours a learner might hand in by mistake (Danish for Norwegian). */
export type GuessableLanguage = LanguageCode | 'da' | 'en' | 'pt' | 'fr' | 'it' | 'zh' | 'ru' | 'ar' | 'he' | 'el' | 'ko' | 'ja';

export const LANGUAGE_NAMES: Record<GuessableLanguage, string> = {
  es: 'Spanish', de: 'German', sq: 'Albanian', th: 'Thai', hi: 'Hindi', nb: 'Norwegian (Bokmål)', nn: 'Norwegian (Nynorsk)', da: 'Danish',
  en: 'English', pt: 'Portuguese', fr: 'French', it: 'Italian', zh: 'Chinese', ru: 'Russian', ar: 'Arabic', he: 'Hebrew', el: 'Greek', ko: 'Korean', ja: 'Japanese',
};

/** The commonest words of each Latin-script language the guesser knows; the share of a text they make up is the clue. */
const PROFILES: Record<'es' | 'de' | 'sq' | 'en' | 'pt' | 'fr' | 'it', ReadonlySet<string>> = {
  es: new Set('de la que el en y a los se del las un por con no una su para es al lo como más mas o pero sus le ya si porque esta entre cuando muy sin sobre me hasta hay donde quien desde todo nos durante también tambien ser son dos fue era yo él ella ellos había'.split(' ')),
  de: new Set('der die und in den von zu das mit sich des auf für fur ist im dem nicht ein eine als auch es an werden aus er hat dass daß sie nach wird bei einer um am sind noch wie einem über uber so zum ich war'.split(' ')),
  sq: new Set('dhe të te e që qe në ne për per me një nje nga është eshte i u si por do ka kjo ky ishte nuk më ajo ai kur edhe pas se sa duke janë'.split(' ')),
  en: new Set('the of and to in is that it was for on are with as his they be at one have this from or had by not but what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part'.split(' ')),
  pt: new Set('de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este fosse dele'.split(' ')),
  fr: new Set('de la le et à les des en un du une que est pour qui dans ce il par sur ne se pas au plus avec son ou sont ses mais comme nous il était cette elle aux leur tout vous été'.split(' ')),
  it: new Set('di e il la che è un a per in una sono non le del si con gli come ma della più anche lo da nel questo ha alla hanno nella sua suo era quando ci dei delle'.split(' ')),
};

/**
 * Norwegian and Danish share most of their commonest words (og, i, er, det, som, på, en, til, for, med, at, har, ikke, jeg
 * …), so a share of common words cannot tell them apart. The three profiles below are the shares reported, and the verdict
 * between Bokmål, Nynorsk and Danish comes from MARKERS: words that belong to one of them and not to the others. A text is
 * named Scandinavian only when the three profiles together clearly lead the legacy profiles (same 0.15 and 1.6 thresholds),
 * and a member only when its markers are at least two and at least twice the other side's. Machine-draft word lists, native
 * review pending.
 */
const SCAND_COMMON = 'og i er det som på en et til av af for med at har den ikke jeg var om han hun seg sig men vi kan fra frå så også å du eller når skal vil blir bliver bare hadde havde etter efter mer mere meg mig deg dig sin sit sine ut ud opp op inn ind her der hvor hvis alle andre'.split(' ');
const NB_PROFILE = new Set([...SCAND_COMMON, ...'hva noen noe ble mye nå gjøre de'.split(' ')]);
const NN_PROFILE = new Set([...SCAND_COMMON, ...'eg ikkje ein ei eit ho dei kva kven korleis nokon noko berre mykje frå vart blei me meir kor viss'.split(' ')]);
const DA_PROFILE = new Set([...SCAND_COMMON, ...'hvad nogen noget nogle blev meget nu hende de'.split(' ')]);
/** Danish and not Norwegian (either standard). */
const DA_MARKERS = new Set('af hvad nogen noget nogle sig mig dig blev bliver meget nu efter mere havde hende været fik gik ud ind op mod mellem uden altid børn lidt gøre gør sådan'.split(' '));
/** Norwegian (Bokmål or Nynorsk) and not Danish. */
const NO_MARKERS = new Set('av meg deg seg ble mye nå etter ut inn opp mot mellom uten alltid litt gikk fikk vært barn hva noen noe hun gjøre gjør eg ikkje ein ei eit ho dei kva kven korleis nokon noko berre mykje frå vart blei meir kor'.split(' '));
/** Bokmål and not Nynorsk. */
const NB_MARKERS = new Set('jeg ikke hva noen noe hun hvordan hvor hvem bare mye ble fra gjøre gjør'.split(' '));
/** Nynorsk and not Bokmål. */
const NN_MARKERS = new Set('eg ikkje ein ei eit ho dei kva kven korleis kor nokon noko berre mykje frå vart blei meir gjera gjere kjem'.split(' '));

const wordsOf = (text: string): string[] => (text.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? []).map((w) => w.toLowerCase());
const countIn = (words: string[], set: ReadonlySet<string>): number => words.filter((w) => set.has(w)).length;

/**
 * Bokmål, Nynorsk or Danish, by the words that belong to one of them only; undefined when the words do not decide
 * (nothing decisive, or a mix). Works on a short text too (the 40-word floor of `guessLanguage` does not apply): two
 * decisive words, and at least twice as many as point the other way.
 */
export function guessScandinavian(text: string): 'nb' | 'nn' | 'da' | undefined {
  const ws = wordsOf(text);
  const da = countIn(ws, DA_MARKERS);
  const no = countIn(ws, NO_MARKERS);
  if (da >= 2 && da >= 2 * no) return 'da';
  if (no < 2 || no < 2 * da) return undefined;
  const nb = countIn(ws, NB_MARKERS);
  const nn = countIn(ws, NN_MARKERS);
  if (nn >= 2 && nn >= 2 * nb) return 'nn';
  if (nb >= 2 && nb >= 2 * nn) return 'nb';
  return undefined;
}

const SCRIPTS: Array<[GuessableLanguage | 'latin', RegExp]> = [
  ['latin', /\p{Script=Latin}/u], ['zh', /\p{Script=Han}/u], ['th', /\p{Script=Thai}/u], ['hi', /\p{Script=Devanagari}/u], ['ru', /\p{Script=Cyrillic}/u],
  ['ar', /\p{Script=Arabic}/u], ['he', /\p{Script=Hebrew}/u], ['el', /\p{Script=Greek}/u], ['ko', /\p{Script=Hangul}/u], ['ja', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
];

export interface LanguageGuess {
  /** The language the text looks to be in, when the guesser is sure; undefined when it is not. */
  lang?: GuessableLanguage;
  /** What the letters are written in: 'latin', or the script's language ('zh', 'th', 'hi' …); 'none' for a text without letters. */
  script: string;
  /** Words looked at (letters only). */
  words: number;
  /** For a Latin-script text: the share of each known language's commonest words, highest first. */
  shares: Array<[GuessableLanguage, number]>;
}

const MIN_WORDS = 40;

/** The language a text looks to be in. Sure only on a clear script or a clear lead in common words. */
export function guessLanguage(text: string): LanguageGuess {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return { script: 'none', words: 0, shares: [] };
  const counts = new Map<string, number>();
  for (const ch of letters) { const s = SCRIPTS.find(([, re]) => re.test(ch)); const k = s ? s[0] : 'other'; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const [script, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const words = (text.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? []).map((w) => w.toLowerCase());
  // a script that belongs to one language settles it, once it is most of the letters (a Thai book may quote Latin)
  if (script !== 'latin' && script !== 'other') return n / letters.length >= 0.5 ? { lang: script as GuessableLanguage, script, words: words.length, shares: [] } : { script, words: words.length, shares: [] };
  if (script === 'other') return { script, words: words.length, shares: [] };
  const shareOf = (set: ReadonlySet<string>) => (words.length ? words.filter((w) => set.has(w)).length / words.length : 0);
  const legacy = (Object.keys(PROFILES) as Array<keyof typeof PROFILES>)
    .map((k): [GuessableLanguage, number] => [k, shareOf(PROFILES[k])])
    .sort((a, b) => b[1] - a[1]);
  const scand: Array<[GuessableLanguage, number]> = [['nb', shareOf(NB_PROFILE)], ['nn', shareOf(NN_PROFILE)], ['da', shareOf(DA_PROFILE)]];
  const shares = [...legacy, ...scand].sort((a, b) => b[1] - a[1]);
  if (words.length < MIN_WORDS) return { script, words: words.length, shares };
  const [best, second] = legacy;
  // sure: the leading language's common words make up a good part of the text, and clearly more than the runner-up's
  const sure = best[1] >= 0.15 && best[1] >= second[1] * 1.6;
  // Scandinavian text: the three profiles share most words, so they count as one (their union) against the legacy
  // profiles, and the markers choose between them. The thresholds are the legacy ones.
  const union = shareOf(new Set([...NB_PROFILE, ...NN_PROFILE, ...DA_PROFILE]));
  if (union >= 0.15 && union >= best[1] * 1.6) {
    const which = guessScandinavian(text);
    return { ...(which ? { lang: which } : {}), script, words: words.length, shares };
  }
  return { ...(sure ? { lang: best[0] } : {}), script, words: words.length, shares };
}

export interface LanguageVerdict {
  ok: boolean;
  guess: LanguageGuess;
  /** A kind sentence for the learner, present when the text was turned away. */
  message?: string;
}

/**
 * May this text join a team that reads `lang`? Turned away when it clearly is in another language — by its script
 * (Chinese letters are never Spanish) or by its common words — and when `declared` (a document's own language field)
 * names another language. A text too short or too mixed to judge passes.
 */
export function fitsTeamLanguage(text: string, team: { lang: LanguageCode; country: string; readsLangs?: readonly LanguageCode[] }, declared?: string): LanguageVerdict {
  const guess = guessLanguage(text);
  // the team's own language, or a companion language it also reads (a Norway team reads Nynorsk)
  const reads = (l: string | undefined) => l === team.lang || (l !== undefined && (team.readsLangs ?? []).includes(l as LanguageCode));
  const teamName = [LANGUAGE_NAMES[team.lang], ...(team.readsLangs ?? []).map((l) => LANGUAGE_NAMES[l])].join(' and ');
  const turnAway = (looks: string): LanguageVerdict => ({
    ok: false, guess,
    message: `Thank you — but this text ${looks}, and the ${team.country} team reads ${teamName}. It was not added. If it really is ${teamName}, check that the file holds the book itself and not a preface or notes in another language.`,
  });
  if (declared !== undefined && !reads(declared)) {
    const name = (LANGUAGE_NAMES as Record<string, string>)[declared];
    return turnAway(name ? `is marked as ${name} ("${declared}")` : `is marked with the language code "${declared}"`);
  }
  if (guess.lang !== undefined && !reads(guess.lang)) return turnAway(`looks like ${LANGUAGE_NAMES[guess.lang]}`);
  // a Norwegian team is also handed Danish by mistake, even a sentence or two of it: the decisive words need no 40-word floor
  if (guess.lang === undefined && (team.lang === 'nb' || team.lang === 'nn') && guessScandinavian(text) === 'da') return turnAway(`looks like ${LANGUAGE_NAMES.da}`);
  // a Latin-script team (Spanish, German, Albanian) given a text in another script, even a short one
  if (guess.script !== 'latin' && guess.script !== 'none' && (team.lang === 'es' || team.lang === 'de' || team.lang === 'sq' || team.lang === 'nb' || team.lang === 'nn')) {
    const name = (LANGUAGE_NAMES as Record<string, string>)[guess.script];
    return turnAway(name ? `is written in the ${name} script` : 'is written in another script');
  }
  // a Thai or Hindi team given a Latin-script text of some length: not their language
  if ((team.lang === 'th' || team.lang === 'hi') && guess.script === 'latin' && guess.words >= MIN_WORDS) return turnAway('is written in the Latin alphabet');
  return { ok: true, guess };
}

/** The running text of an import document (format version 2), for the language check; '' when it has none. */
export function documentText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const sections = (doc as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return '';
  const out: string[] = [];
  for (const s of sections) {
    const paragraphs = (s as { paragraphs?: unknown })?.paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const p of paragraphs) {
      if (typeof p === 'string') out.push(p);
      else if (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string') out.push((p as { text: string }).text);
    }
  }
  return out.join('\n');
}
