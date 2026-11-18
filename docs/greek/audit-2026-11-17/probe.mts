// Greek card probe: one line per "variety-or-dash | sentence | word" (word found at its FIRST occurrence; "word#2" for the second).
// usage: probe.mts <battery> [ext|core|biblia] [short|long|pron]
import fs from 'node:fs';
import { card, short, type Mode } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const mode = (process.argv[3] ?? 'ext') as Mode;
const detail = process.argv[4] ?? 'short';
for (const line of lines) {
  const [v, sentenceRaw, wordRaw] = line.split('|').map((x) => x.trim());
  const sentence = sentenceRaw.normalize('NFC');
  const m = /^(.*)#(\d)$/.exec(wordRaw ?? '');
  const word = (m ? m[1] : (wordRaw ?? sentence)).normalize('NFC');
  let at = sentence.indexOf(word);
  if (m) for (let k = 1; k < Number(m[2]); k++) at = sentence.indexOf(word, at + 1);
  if (at < 0) { console.log(`?? «${word}» not found in "${sentence}"`); continue; }
  let c: any;
  try { c = await card(mode, sentence, word, at, v && v !== '-' ? v : undefined); } catch (e) { console.log(`«${word}»: THROW ${(e as Error).message}`); continue; }
  const alts = c.alternatives.map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}${a.gloss ? `“${short(a.gloss, 18)}”` : ''}@${a.confidence}`).join(', ');
  const per = c.period ? `${c.period.varietyId.replace('el-', '')}${c.period.evidence ? `:${c.period.evidence}` : ''}` : '—';
  const cons = c.constructions.filter((k: any) => k.source === 'pattern').map((k: any) => k.id).join(',');
  const phr = (c.phrases ?? []).map((p: any) => p.display).join(';');
  console.log(`«${word}» in "${short(sentence, 44)}" ⇒ ${c.lemma ?? '∅'} / ${c.pos ?? '—'} / ${c.morphology ?? ''} / g:${short(c.gloss, 46)} / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} / P:${per}${alts ? ` / also ${alts}` : ''}${cons ? ` / C:${cons}` : ''}${phr ? ` / PH:${phr}` : ''}${c.role ? ` / S:${c.role}` : ''}${c.syntaxNotes?.length ? ` / parts:${c.syntaxNotes.join(' + ')}` : ''}${detail === 'pron' ? ` / R:${c.transliteration ?? ''} L:${c.lemmaTransliteration ?? ''}` : ''}`);
  if (detail === 'long') {
    console.log('    notes: ' + c.notes.join(' || ').slice(0, 700));
    console.log('    basis: ' + c.basis.join(' || ').slice(0, 300) + ' | period basis: ' + (c.period?.basis ?? ''));
    console.log('    src: ' + (c.glossSource ?? '') + ' | feats: ' + JSON.stringify(c.features).slice(0, 300));
    console.log('    WA: ' + JSON.stringify({ lex: c.wordAnalysis?.lexicalMeaning?.text, inf: c.wordAnalysis?.inflectedMeaning?.text, ctx: c.wordAnalysis?.contextualMeaning?.text }).slice(0, 300));
    console.log('    pron: ' + (c.transliteration ?? '') + ' || ' + (c.pronunciation ?? []).join(' || ').slice(0, 500));
    if (c.variants) console.log('    variants: ' + c.variants.rows.map((r: any) => `${r.varietyId}${r.current ? '*' : ''}=${r.status === 'attested' ? r.forms.slice(0, 4).join(',') : '∅'}${r.note ? `(${short(r.note, 50)})` : ''}`).join(' | '));
  }
}
