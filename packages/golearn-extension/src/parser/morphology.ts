/** A compact form line when an adapter has no prose description. Keep the formatter inside the extension parser:
 * extension entry points must not import the retired GoLearn course modules. The feature summaries on the card still
 * show the complete bundle and accept the pack's plain-language labels when they arrive. */
const POS_LABEL: Record<string, string> = {
  NOUN: 'noun', PROPN: 'proper noun', VERB: 'verb', AUX: 'auxiliary', ADJ: 'adjective', ADV: 'adverb',
  PRON: 'pronoun', DET: 'determiner', ADP: 'adposition', CONJ: 'conjunction', SCONJ: 'subordinator',
  PART: 'particle', NUM: 'numeral', INTJ: 'interjection', CLF: 'classifier', PUNCT: 'punctuation', X: 'other',
};
const NUMBER_SHORT: Record<string, string> = { Sing: 'sg', Plur: 'pl' };
const FEATURE_ORDER = ['Gender', 'Case', 'Definite', 'Tense', 'Aspect', 'Mood', 'VerbForm', 'Voice', 'Degree'];

export function fallbackMorphologyLine(pos: string | undefined, morph: Record<string, string> | undefined): string | undefined {
  const parts: string[] = [];
  if (pos) parts.push(POS_LABEL[pos] ?? pos.toLowerCase());
  const m = morph ?? {};
  const used = new Set<string>();
  if (m.Person && m.Number) {
    parts.push(`${m.Person}${NUMBER_SHORT[m.Number] ?? m.Number.toLowerCase()}`);
    used.add('Person');
    used.add('Number');
  }
  for (const key of [...FEATURE_ORDER, ...Object.keys(m).sort()]) {
    if (used.has(key) || !m[key]) continue;
    used.add(key);
    parts.push(key === 'Number' ? (NUMBER_SHORT[m[key]] ?? m[key].toLowerCase()) : m[key].toLowerCase());
  }
  return parts.length ? parts.join(' · ') : undefined;
}
