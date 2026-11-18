// Compact card probe (Spanish audit copy of audit-examples/probe2.mts): one line per "lang | sentence | word".
// The word is found at its FIRST occurrence; write "word#2" for the second. Adds the card's word parts (syntaxNotes) and variety notes.
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
const rts: Record<string, ReturnType<typeof createPackRuntime>> = {};
const rt = (l: string) => (rts[l] ??= createPackRuntime(packFor(l)!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE }));
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const mode = process.argv[3] ?? 'short';
for (const line of lines) {
  const [lang, sentence, wordRaw] = line.split('|').map((x) => x.trim());
  const m = /^(.*)#(\d)$/.exec(wordRaw);
  const word = m ? m[1] : wordRaw;
  let at = sentence.indexOf(word);
  if (m) for (let k = 1; k < Number(m[2]); k++) at = sentence.indexOf(word, at + 1);
  if (at < 0) { console.log(`!! «${word}» NOT FOUND in "${sentence}"`); continue; }
  const ctx = sentence !== word ? { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } : { kind: 'none' as const, confidence: 0 };
  let c: any;
  try { c = parseSelection({ surface: word, languageId: lang, context: ctx }); } catch (e) { console.log(`${lang} ${word}: THROW ${(e as Error).message}`); continue; }
  const adapter = parserAdapter(lang)!;
  const variants = c.lemma ? [c.lemma, ...((adapter as any).lemmaVariants?.(c.lemma, c.pos) ?? [])] : [];
  const surfaceForms = [...new Set([word, word.toLowerCase()])];
  const forms = [...new Set([...(c.lemma && !c.unconfirmed ? variants : []), ...surfaceForms, ...(c.lemma && c.unconfirmed ? variants : [])])].slice(0, 8);
  let dict = '';
  try { const g: any = await rt(lang).gloss(c.lemma && !c.unconfirmed ? c.lemma : word, c.pos, forms); dict = g?.senses?.length ? g.senses.slice(0, 2).map((s: any) => s.gloss).join(' ; ').slice(0, 70) : '∅'; } catch (e) { dict = 'ERR ' + (e as Error).message; }
  const alts = c.alternatives.slice(0, 3).map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}`).join(',');
  const cons = c.constructions.map((k: any) => k.id).join(',');
  const phr = (c.phrases ?? []).map((p: any) => `${p.display ?? ''}=${(p.gloss ?? '').slice(0, 30)}`).filter(Boolean).join(';');
  console.log(`«${word}» in "${sentence.slice(0, 50)}" ⇒ ${c.lemma ?? '—'} / ${c.pos ?? '—'} / ${c.morphology ?? ''} / g:${c.gloss ?? '—'} / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''}${alts ? ` / also ${alts}` : ''}${cons ? ` / C:${cons}` : ''}${phr ? ` / P:${phr}` : ''}${c.syntax?.label ? ` / S:${c.syntax.label}` : ''} / D:${dict}${mode === 'pron' ? ` / R:${c.transliteration ?? ''} ${(c.pronunciation ?? []).join(' ').slice(0, 160)}` : ''}`);
  const sn = (c.syntaxNotes ?? []).join(' ¦ '); if (sn) console.log('    parts: ' + sn.slice(0, 300));
  const vn = c.notes.filter((n: string) => /^Variety|Spelling differs|Sources disagree/.test(n)).join(' '); if (vn) console.log('    ' + vn);
  if (mode === 'long') { console.log('    notes: ' + c.notes.join(' || ').slice(0, 600)); console.log('    basis: ' + c.basis.join(' || ').slice(0, 300)); console.log('    feats: ' + JSON.stringify(c.features).slice(0, 400)); console.log('    cons: ' + c.constructions.map((k: any) => `${k.title}: ${k.explanation}`).join(' || ').slice(0, 500)); }
}
