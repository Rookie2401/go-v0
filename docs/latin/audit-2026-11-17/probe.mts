// Compact card probe: one line per "lang | sentence | word" (the word is found at its FIRST occurrence; write "word#2" for the second).
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
if (!process.argv.includes('seed')) await loadLatinLexicon();
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
  const ctx = at >= 0 && sentence !== word ? { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } : { kind: 'none' as const, confidence: 0 };
  let c: any;
  try { c = parseSelection({ surface: word, languageId: lang, context: ctx }); } catch (e) { console.log(`${lang} ${word}: THROW ${(e as Error).message}`); continue; }
  const adapter = parserAdapter(lang)!;
  const variants = c.lemma ? [c.lemma, ...((adapter as any).lemmaVariants?.(c.lemma, c.pos) ?? [])] : [];
  const surfaceForms = [...new Set([word, word.toLowerCase()])];
  const forms = [...new Set([...(c.lemma && !c.unconfirmed ? variants : []), ...surfaceForms, ...(c.lemma && c.unconfirmed ? variants : [])])].slice(0, 8);
  let dict = '';
  try { const g: any = await rt(lang).gloss(c.lemma && !c.unconfirmed ? c.lemma : word, c.pos, forms); dict = g?.senses?.length ? g.senses.slice(0, 2).map((s: any) => s.gloss).join(' ; ').slice(0, 60) : '∅'; } catch (e) { dict = 'ERR ' + (e as Error).message; }
  const alts = c.alternatives.slice(0, 3).map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}`).join(',');
  const cons = c.constructions.map((k: any) => k.id).filter((x: string) => !x.startsWith('form:')).join(',');
  const phr = (c.phrases ?? []).map((p: any) => p.display ?? p.text ?? '').filter(Boolean).join(';');
  const unit = (c.features ?? []).filter((f: any) => /unit|particle/i.test(`${f.label ?? ''}${f.value ?? ''}`)).map((f: any) => `${f.label}=${f.value}`).join(';');
  console.log(`${lang} «${word}» in "${sentence.slice(0, 46)}" ⇒ ${c.lemma ?? '—'} / ${c.pos ?? '—'} / ${c.morphology ?? ''} / g:${c.gloss ?? '—'} / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''}${alts ? ` / also ${alts}` : ''}${cons ? ` / C:${cons}` : ''}${phr ? ` / P:${phr}` : ''}${unit ? ` / U:${unit}` : ''}${c.syntax?.label ? ` / S:${c.syntax.label}` : ''}${(c.syntaxNotes ?? []).length ? ` / N:${c.syntaxNotes.join(';')}` : ''}${c.notes.filter((x: string) => /Spelling|Not in the word list|unknown to this pack/.test(x)).map((x: string) => ' / !' + x.slice(0, 60)).join('')} / D:${dict}${mode === 'pron' ? ` / R:${c.transliteration ?? ''} ${(c.pronunciation ?? []).join(' ').slice(0, 120)}` : ''}`);
  if (mode === 'long') { console.log('    notes: ' + c.notes.join(' || ').slice(0, 500)); console.log('    basis: ' + c.basis.join(' || ').slice(0, 300)); console.log('    feats: ' + JSON.stringify(c.features).slice(0, 400)); }
}
