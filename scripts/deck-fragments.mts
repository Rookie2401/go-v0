/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/deck-fragments.mts [-- <out.tsv>]
 *
 * The Arabic auditor's fragment check (test/deck-audit/fragments.ts) over the admitted cards of the DEVELOPMENT text of EVERY deck-audit set whose data is on this
 * machine. It fixes nothing and fails nothing: it writes (set, unit id, shown meaning, why) to the tsv and prints the count per set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_SETS, auditText, dataPresent, readSentences, runDeckAudit } from '../test/deck-audit/support';
import { fragmentWhy } from '../test/deck-audit/fragments';

const out = process.argv.slice(2).find((a) => a.endsWith('.tsv')) ?? 'C:/Users/CJWal/dev/tmp-mem/ar-af/other-languages-fragments.tsv';
const rows = ['set\tunit id\tshown meaning\twhy'];
for (const set of AUDIT_SETS) {
  if (!dataPresent(set.lang) || !fs.existsSync(auditText(set.id, 'dev'))) { console.log(`${set.id}: data not on this machine`); continue; }
  const result = await runDeckAudit(set.lang, readSentences(auditText(set.id, 'dev')), { varietyId: set.varietyId });
  let n = 0;
  for (const c of result.cards) {
    const why = fragmentWhy(c.shown);
    if (why) { n++; rows.push([set.id, c.unitId, c.shown, why].map((x) => String(x).replace(/[\t\r\n]+/gu, ' ')).join('\t')); }
  }
  console.log(`${set.id}: ${result.cards.length} cards, ${n} fragment findings`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, rows.join('\n') + '\n');
console.log(`written ${out}`);
