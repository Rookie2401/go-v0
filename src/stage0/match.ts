/**
 * Production answers: does what he typed say what the task asks? Deterministic and forgiving only where it should be:
 * case, punctuation and spacing never matter (Thai spacing never does); a missing accent or special letter on an otherwise
 * right answer is accepted with a spelling note — the spelling is pointed out, the sentence still counts as his.
 * `{x}` in an accepted answer is a personal slot (his own name, town …) that takes one or more words.
 */
import type { LanguageCode, Stage0Accept } from '../core';

const PUNCT = /[\p{P}\p{S}]/gu;

export function normalizeAnswer(lang: LanguageCode, s: string): string {
  let t = s.normalize('NFC').replace(PUNCT, ' ');
  if (lang !== 'th' && lang !== 'hi') t = t.toLowerCase();
  t = t.replace(/\s+/g, lang === 'th' ? '' : ' ').trim();
  return t;
}

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Norwegian ø and æ are letters of their own that carry no combining mark: typed without them, they are o and ae. å loses its ring above. */
const foldNorwegian = (s: string) => s.replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/æ/g, 'ae').replace(/Æ/g, 'AE');
const stripFor = (lang: LanguageCode, s: string) => (lang === 'nb' || lang === 'nn' ? foldNorwegian(stripMarks(s)) : stripMarks(s));

/** A private-use character marks the slot: it survives lower-casing and punctuation removal. */
const SLOT = '';

function patternOf(lang: LanguageCode, accepted: string): RegExp {
  const norm = normalizeAnswer(lang, accepted.replace(/\{x\}/g, ` ${SLOT} `));
  const parts = norm.split(lang === 'th' ? SLOT : new RegExp(`\\s*${SLOT}\\s*`));
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sep = lang === 'th' ? '' : ' ';
  return new RegExp(`^${parts.map(esc).join(`${sep}?(.+?)${sep}?`)}$`, 'u');
}

export interface MatchResult { accepted: boolean; matched?: string; spellingNote?: string; personal?: string[] }

export function matchAnswer(lang: LanguageCode, text: string, accept: Stage0Accept[], speakerForm?: 'm' | 'f'): MatchResult {
  const typed = normalizeAnswer(lang, text);
  if (!typed) return { accepted: false };
  const usable = accept.filter((a) => !a.speakerForm || !speakerForm || a.speakerForm === speakerForm);
  for (const a of usable) {
    const m = patternOf(lang, a.text).exec(typed);
    if (m) return { accepted: true, matched: a.text, ...(m.length > 1 ? { personal: m.slice(1) } : {}) };
  }
  // the same words without accents / special letters (Latin script only): accepted, with the spelling pointed out
  if (lang === 'es' || lang === 'de' || lang === 'sq' || lang === 'nb' || lang === 'nn') {
    for (const a of usable) {
      if (patternOf(lang, stripFor(lang, a.text)).test(stripFor(lang, typed))) {
        return { accepted: true, matched: a.text, spellingNote: `Right — and it is spelled with its marks: "${a.text.replace(/\{x\}/g, '…')}".` };
      }
    }
  }
  // the other speaker form: right words for the other gender
  if (speakerForm) {
    const other = accept.find((a) => a.speakerForm && a.speakerForm !== speakerForm && patternOf(lang, a.text).test(typed));
    if (other) return { accepted: false, matched: other.text, spellingNote: 'These are the forms for the other speaker.' };
  }
  return { accepted: false };
}
