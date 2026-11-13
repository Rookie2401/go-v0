/**
 * Contextual renderings of Hebrew words: the English a passage asks for, where it differs from what the form alone says. There is no word-level English
 * of the Tanakh in this repository, so this is a short authored list, each entry a judgement a person can check against the verse and its stated reason.
 * It is never computed, and a word that is not listed simply has no contextual meaning: the card then shows the form's own English.
 *
 * An entry applies only in its verse: by the reference a host gives (Biblia), or, where a page gives none (the browser extension), by the words around it.
 * Words are compared by their consonants, so vowel points, cantillation and maqqef do not matter.
 */
import { consonantal } from './text';

export interface ContextualRendering { text: string; source: string; why: string }
interface Entry extends ContextualRendering { word: string; ref: string; neighbours: readonly string[] }

const SOURCE = 'GoLearn editorial rendering';

const ENTRIES: readonly Entry[] = [
  { ref: 'ISA.1.2', word: 'וְרוֹמַמְתִּי', neighbours: ['בָּנִים', 'גִּדַּלְתִּי'], text: 'And I brought up', source: `${SOURCE}, Isaiah 1:2`,
    why: 'God is speaking of the children he has reared ("sons I have raised and brought up"), so the verb means bringing a child up, and the past fits: these are things already done.' },
  { ref: 'GEN.1.1', word: 'בָּרָא', neighbours: ['בְּרֵאשִׁית', 'אֱלֹהִים'], text: 'He created', source: `${SOURCE}, Genesis 1:1`,
    why: 'The subject, God (אֱלֹהִים), follows the verb: "in the beginning God created".' },
  { ref: 'GEN.1.3', word: 'יְהִי', neighbours: ['אֱלֹהִים', 'אוֹר'], text: 'Let there be', source: `${SOURCE}, Genesis 1:3`,
    why: 'A jussive of הָיָה with a thing as its subject ("light") is a command that it exist: "let there be light".' },
  { ref: 'GEN.1.3', word: 'וַיְהִי', neighbours: ['אֱלֹהִים', 'אוֹר'], text: 'And there was', source: `${SOURCE}, Genesis 1:3`,
    why: 'The narrative form of הָיָה with a thing as its subject says that it came to exist: "and there was light".' },
  { ref: 'EXOD.20.2', word: 'הוֹצֵאתִיךָ', neighbours: ['אָנֹכִי', 'מִצְרַיִם'], text: 'I brought you out', source: `${SOURCE}, Exodus 20:2`,
    why: 'God recalls a completed act, the Exodus from Egypt; "you" is the suffix on the verb.' },
  { ref: 'PS.23.1', word: 'אֶחְסָר', neighbours: ['רֹעִי', 'לֹא'], text: 'I shall not lack', source: `${SOURCE}, Psalm 23:1`,
    why: 'לֹא before the verb negates it, and the imperfect here states what will hold true: "the LORD is my shepherd, I shall not lack".' },
  { ref: 'GEN.12.1', word: 'לֶךְ', neighbours: ['אַבְרָם', 'לְךָ'], text: 'Go!', source: `${SOURCE}, Genesis 12:1`,
    why: 'God\'s command to Abram, in the imperative of הָלַךְ, with לְךָ after it: "go, for your own sake".' },
];

const same = (a: string, b: string): boolean => consonantal(a) === consonantal(b);

/** The rendering of this word in this verse, or undefined: nothing here applies outside its own verse. */
export function contextualRenderingFor(surface: string, references: readonly string[] | undefined, sentence: string | undefined): ContextualRendering | undefined {
  const refs = (references ?? []).map((r) => r.toUpperCase());
  const hasRefs = refs.length > 0;
  const words = (sentence ?? '').split(/[\s־׃,.;:!?]+/u).filter(Boolean).map((w) => consonantal(w));
  for (const e of ENTRIES) {
    if (!same(e.word, surface)) continue;
    const inVerse = hasRefs ? refs.includes(e.ref) : e.neighbours.every((n) => words.includes(consonantal(n)));
    if (inVerse) return { text: e.text, source: e.source, why: e.why };
  }
  return undefined;
}
