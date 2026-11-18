// Every reading the analyser holds for a word in its sentence (the card shows the first and up to three more, without their forms).
// usage: cands.mts <battery> [ext|core|biblia] [max]
import fs from 'node:fs';
import { prepare, type Mode } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
import { elAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/el';
import { resetElPeriodMemory } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/analyze';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const mode = (process.argv[3] ?? 'ext') as Mode;
const max = Number(process.argv[4] ?? 14);
for (const line of lines) {
  const [v, sentenceRaw, wordRaw] = line.split('|').map((x) => x.trim());
  const sentence = sentenceRaw.normalize('NFC');
  const word = (wordRaw ?? sentence).normalize('NFC');
  await prepare(mode, sentence);
  resetElPeriodMemory();
  const tokens = elAdapter.tokenize(sentence);
  const an = elAdapter.analyze(tokens, v && v !== '-' ? { varietyId: v } : undefined);
  const at = sentence.indexOf(word);
  const i = tokens.findIndex((t) => t.isWord && t.start < at + word.length && t.end > at);
  if (i < 0) { console.log(`?? ${word}`); continue; }
  const cs = an[i].candidates;
  console.log(`«${tokens[i].surface}» (key ${tokens[i].normalized}) in "${sentence.slice(0, 50)}": ${cs.length} readings; period ${cs[0]?.notes?.period ?? '—'} (${cs[0]?.notes?.periodEvidence ?? ''})`);
  cs.slice(0, max).forEach((c, k) => console.log(`   ${k + 1}. ${c.lemma}/${c.pos} [${elAdapter.describeMorph!(c.morph, c.pos)}] ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} {${(c.varieties ?? []).join(',')}} ${c.notes?.source ?? ''}${c.notes?.accents ? ' accents-inferred' : ''}${c.notes?.rule ? ` rule:${c.notes.rule}` : ''}${c.notes?.form ? ` form:${c.notes.form}` : ''}${Array.isArray(c.notes?.tags) ? ` tags:${(c.notes!.tags as string[]).join('|')}` : ''}${c.notes?.code ? ` code:${c.notes.code}` : ''} g:${(c.gloss ?? '').slice(0, 40)}`));
}
