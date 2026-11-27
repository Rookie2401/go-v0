/// <reference types="node" />
/**
 * npm run deck:audit -- <set> [--part dev|heldout] [--no-gate] [--strict] [--text <file>] [--json <file>] [--cards] [--held] [--no-forms]
 *
 * The deck audit of one language (test/deck-audit/support.ts): every card GoReview would admit from an ordinary text, through the real path, with what
 * each card shows. A set is a language or one period variety (AUDIT_SETS); its texts are data/deck-audit/<set>/dev.txt and heldout.txt. --no-gate measures the state before the deck gate. It prints the counts, the machine findings and the held words; --json writes
 * the whole result (the card list a reader judges).
 */
import fs from 'node:fs';
import path from 'node:path';
import { auditSet, auditText, readSentences, runDeckAudit } from '../test/deck-audit/support';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const lang = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) ?? '';
if (!lang) { console.error('usage: deck-audit <lang> [--variety id] [--text file] [--json file] [--no-forms]'); process.exit(2); }

const set = auditSet(lang);
const part = flag('--part') === 'heldout' ? 'heldout' : 'dev';
const textFile = flag('--text') ?? auditText(set.id, part);
const result = await runDeckAudit(set.lang, readSentences(textFile), { varietyId: flag('--variety') ?? set.varietyId, forms: !args.includes('--no-forms'), gate: !args.includes('--no-gate'), strictReadings: args.includes('--strict') });
const { cards, held } = result;
const count = (xs: unknown[]): number => xs.length;
const lemma = cards.filter((c) => c.kind === 'lemma'); const form = cards.filter((c) => c.kind === 'form');
console.log(`${set.id} ${part}${args.includes('--no-gate') ? ' WITHOUT the gate' : ''}${result.varietyId ? ` (${result.varietyId})` : ''}: ${result.sentences} sentences, ${result.words} words (${result.unknownWords} the analyser did not read), ${result.lemmaUnits} lemma units, ${result.formUnits} form units`);
console.log(`admitted cards: ${count(cards)} (lemma ${count(lemma)}, form ${count(form)}; base-meaning form cards ${count(form.filter((c) => c.baseMeaning))})`);
console.log(`machine findings: unlisted ${count(cards.filter((c) => !c.listed))}, cross-reference only ${count(cards.filter((c) => c.xref))}, no letter ${count(cards.filter((c) => c.fragment))}, empty meaning ${count(cards.filter((c) => !c.shown.trim()))}`);
const byStage = new Map<string, number>();
for (const h of held) { const k = `${h.unitId.startsWith('form:') ? 'form' : 'lemma'} ${h.stage}: ${h.reason.replace(/\(.*$/u, '').slice(0, 90)}`; byStage.set(k, (byStage.get(k) ?? 0) + 1); }
console.log(`held units: ${held.length}`);
for (const [k, n] of [...byStage].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
const show = (c: (typeof cards)[number]): string => `  ${c.kind === 'form' ? 'F' : 'L'} ${c.headword}${c.pos ? ` [${c.pos}]` : ''}${c.lemma && c.lemma !== c.headword ? ` <${c.lemma}>` : ''} = "${c.shown}"${c.baseMeaning ? ' (base)' : ''}  | ${c.surfaces.join(', ')} | ${c.sentence}`;
for (const [title, list] of [['UNLISTED', cards.filter((c) => !c.listed)], ['CROSS-REFERENCE ONLY', cards.filter((c) => c.xref)]] as const) {
  if (!list.length) continue;
  console.log(`${title}:`);
  for (const c of list) console.log(show(c));
}
if (args.includes('--cards')) { console.log('CARDS:'); for (const c of cards) console.log(show(c)); }
if (args.includes('--held')) { console.log('HELD:'); for (const h of held) console.log(`  ${h.unitId} | ${h.stage}: ${h.reason} | ${h.sentence}`); }
const out = flag('--json');
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 1)); console.log(`written ${out}`); }
