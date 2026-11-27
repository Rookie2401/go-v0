/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/ar-deck-cards.mts
 *
 * Writes docs/arabic/DECK-CARDS.md: the 300 commonest cards the Arabic deck ADMITS, one line each (headword, part of speech, the first meaning
 * the card shows, the class of its gloss), for a person to read. The cards come from the REAL path (test/goreview/arabic-deck-audit.support.ts)
 * run over three sources: the deck-audit text, the Alphabet Sprint's Arabic starter words (as the extension would meet them, one by one), and the
 * main lexemes of the reviewed identities list (src/adapters/arabic/identities.json). Ranked by the index's own count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AR_CLOSED } from '../src/adapters/arabic/closed';
import { arHeadForm } from '../src/adapters/arabic/text';
import { AR_IDENTITIES } from '../src/adapters/arabic/identities';
import { arLemmaRow, arSenseClass } from '../src/adapters/arabic/deck';
import { WORDS } from '../packages/language-packs/src/alphabet-sprint/words/ar';
import { runDeckAudit, type AuditText, type Card, type GoldSentence } from '../test/goreview/arabic-deck-audit.support';

const fixture = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/arabic/deck-audit.json'), 'utf8')) as { sentences: GoldSentence[] };
const heads = new Set<string>();
for (const v of Object.values(AR_IDENTITIES)) for (const part of (v ?? '').split('+')) { const [h] = part.split('|'); if (part.includes('|') && h) heads.add(h); }
const texts: AuditText[] = [
  ...fixture.sentences.map((s) => ({ id: s.id, text: s.text, gold: s.tokens })),
  ...WORDS.map((w, i) => ({ id: `sprint-${i}`, text: w.form })),
  ...[...heads].map((h, i) => ({ id: `identity-${i}`, text: h })),
];

const closedClass = (head: string, pos: string): boolean => Object.values(AR_CLOSED).some((l) => l.some((e) => arHeadForm(e.lemma, e.pos) === arHeadForm(head, pos)));
const lineOf = (c: Card): string => {
  const row = c.pos ? arLemmaRow(c.head, c.pos) : undefined;
  const klass = closedClass(c.head, c.pos ?? '') ? 'closed' : arSenseClass(row);
  const checks = c.problems.length ? `CHECK FAILED: ${c.problems.join('; ').replace(/\|/g, '/')}` : '';
  return `| ${c.head} | ${c.pos ?? ''} | ${(c.glosses[0] ?? '').replace(/\|/g, '/')} | ${klass} | ${row?.[4] ?? ''} | ${checks} |`;
};
const table = (cards: Card[]): string => ['| headword | POS | first meaning shown | gloss class | index count | automatic checks |', '|---|---|---|---|---|---|', ...cards.map(lineOf)].join('\n');
const top300 = (cards: Card[]): Card[] => [...cards].sort((a, b) => (arLemmaRow(b.head, b.pos ?? '')?.[4] ?? 0) - (arLemmaRow(a.head, a.pos ?? '')?.[4] ?? 0)).slice(0, 300);

const today = await runDeckAudit(texts);
const merged = await runDeckAudit(texts, { senseWhenAbsent: 'One' });
const todayIds = new Set(today.cards.map((c) => c.unitId));
const out = [
  '# Arabic deck: the cards it admits, to be read',
  '',
  '**No machine check proves that a meaning fits; this list is here to be read.**',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/ar-deck-cards.mts\` through the real path (see DECK.md). Source set: the deck-audit text (${fixture.sentences.length} sentences), the ${WORDS.length} Alphabet Sprint Arabic starter words, and the ${heads.size} lexemes the reviewed identities list names as main readings, each met as the extension would meet it (its own lemma id recorded, then recovered by GoReview). Ranked by the index's own count; the first 300.`,
  '',
  `Form cards admitted (a card for a bare written form, \`form:ar:...\`): **${today.formCards}** (must be 0).`,
  `Distinct lemma cards admitted from this source set: **${today.cards.length}**; shown below: ${Math.min(300, today.cards.length)}.`,
  '',
  'Gloss class: Rev = the leading meaning is a reviewed choice; One = the entry has exactly one real sense; closed = a hand-written closed-class entry.',
  '',
  `Automatic checks that failed on admitted cards (a verb's first meaning must begin "to ", a noun's must not; the gold of the audit text where a token stands behind the card): **${today.cards.filter((c) => c.problems.length).length}** (listed in the column; these are findings, not passes).`,
  '',
  '## Admitted today',
  '',
  table(top300(today.cards)),
  '',
  '## EVERY admitted particle, pronoun, preposition, conjunction, adverb, determiner, interjection and numeral (not capped)',
  '',
  table([...today.cards].filter((c) => ['PART', 'PRON', 'ADP', 'CONJ', 'CCONJ', 'SCONJ', 'ADV', 'DET', 'INTJ', 'NUM'].includes(c.pos ?? '')).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''))),
  '',
  '## Would be admitted if the unreviewed leading meanings were treated as reviewed (SIMULATION, not admitted today)',
  '',
  `${merged.cards.filter((c) => !todayIds.has(c.unitId)).length} further cards; the 300 commonest of them, so that the first meanings the review has still to look at can be read:`,
  '',
  table(top300(merged.cards.filter((c) => !todayIds.has(c.unitId)))),
  '',
].join('\n');
fs.writeFileSync(path.resolve('docs/arabic/DECK-CARDS.md'), out, 'utf8');
console.log(`docs/arabic/DECK-CARDS.md: ${today.cards.length} admitted, ${merged.cards.length} in the simulation, form cards ${today.formCards}`);
