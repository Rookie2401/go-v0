// Thai card probe. One line per "sentence | selection" (selection found at its FIRST occurrence; "sel#2" = second).
// A line without "|" is tokenised only (mode-independent): prints the adapter's cut.
// Prints the adapter's cut of the sentence (selected tokens in [ ]), then what the card's parseSelection returns for the
// selection with its real offsets, the dictionary gloss, and (mode pron) the romanisation, the pronunciation notes, the
// dictionary full record's romanisation + IPA, and (mode seg) the segmentation alternatives the card would show.
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
const lang = 'th';
const rt = createPackRuntime(packFor(lang)!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter: any = parserAdapter(lang)!;
const lines = fs.readFileSync(process.argv[2]!, 'utf8').replace(/^\uFEFF/, '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#'));
const mode = process.argv[3] ?? 'short';
const out: string[] = [];
const say = (s: string) => out.push(s);
for (const line of lines) {
  const bar = line.indexOf('|');
  const sentence = (bar < 0 ? line : line.slice(0, bar)).trim().normalize('NFC');
  const toks = adapter.tokenize(sentence);
  const cutOf = (a = -1, b = -1) => toks.filter((t: any) => t.isWord || t.surface.trim()).map((t: any) => (t.start < b && t.end > a ? `[${t.surface}]` : t.surface)).join(' ');
  if (bar < 0) {
    const an = adapter.analyze(toks);
    say(`CUT "${sentence}" ⇒ ${toks.filter((t: any) => t.isWord).map((t: any, k: number) => { const i = toks.indexOf(t); const c = an[i]?.candidates?.[0]; return `${t.surface}${c ? `/${c.pos}${c.notes?.source === 'dictionary' ? '°' : ''}` : '/∅'}`; }).join(' · ')}`);
    continue;
  }
  const wordRaw = line.slice(bar + 1).trim().normalize('NFC');
  const m = /^(.*)#(\d)$/.exec(wordRaw);
  const word = m ? m[1] : wordRaw;
  let at = sentence.indexOf(word);
  if (m) for (let k = 1; k < Number(m[2]); k++) at = sentence.indexOf(word, at + 1);
  if (at < 0) { say(`!! "${word}" not found in "${sentence}"`); continue; }
  const ctx = sentence !== word ? { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } : { kind: 'none' as const, confidence: 0 };
  let c: any;
  try { c = parseSelection({ surface: word, languageId: lang, context: ctx }); } catch (e) { say(`«${word}»: THROW ${(e as Error).message}`); continue; }
  const forms = [...new Set([...(c.lemma && !c.unconfirmed ? [c.lemma] : []), word])].slice(0, 8);
  let dict = '';
  let rec = '';
  if (c.tokenCount === 1) {
    try { const g: any = await rt.gloss(c.lemma && !c.unconfirmed ? c.lemma : word, c.pos, forms); dict = g?.senses?.length ? g.senses.slice(0, 3).map((s: any) => s.gloss).join(' ; ').slice(0, 110) : '∅'; } catch (e) { dict = 'ERR ' + (e as Error).message; }
    if (mode === 'pron' || mode === 'long') {
      try { const r: any = await rt.entry(c.lemma && !c.unconfirmed ? c.lemma : word, c.pos, forms); const recs = r?.records ?? []; const pick = recs.find((x: any) => x.p === c.pos) ?? recs[0]; rec = pick ? `${pick.rom ?? '—'} ${(pick.ipa ?? []).map((p: any) => p.i).join(' ')}${pick.f?.length ? ` forms:${JSON.stringify(pick.f).slice(0, 80)}` : ''}` : '∅'; } catch (e) { rec = 'ERR ' + (e as Error).message; }
    }
  }
  const alts = (c.alternatives ?? []).slice(0, 3).map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}${a.gloss ? `“${String(a.gloss).slice(0, 30)}”` : ''}@${a.confidence}`).join(', ');
  const cons = (c.constructions ?? []).map((k: any) => k.id).join(',');
  const phr = (c.phrases ?? []).map((p: any) => `${p.display}“${p.gloss}”`).join('; ');
  say(`«${word}» in ${cutOf(at, at + word.length)}`);
  if (c.tokenCount !== 1) {
    say(`    ${c.tokenCount} tokens: ${(c.words ?? []).map((w: any) => `${w.surface}=${w.lemma ?? '∅'}/${w.pos ?? '∅'}“${w.gloss ?? ''}”`).join(' + ')}${c.lemma ? ` | PHRASE ${c.lemma} “${c.gloss}”` : ''} | conf ${c.confidence}${phr ? ` | P: ${phr}` : ''}`);
    say(`    notes: ${c.notes.join(' || ').slice(0, 400)}`);
  } else {
    say(`    ⇒ ${c.lemma ?? '∅'} / ${c.pos ?? '∅'} / “${c.gloss ?? '—'}” / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} / ${c.provenance}${c.role ? ` / role: ${c.role}` : ''}${c.morphology ? ` / form: ${c.morphology}` : ''}`);
    if (alts) say(`    also: ${alts}`);
    if (cons) say(`    C: ${cons}`);
    if (phr) say(`    P: ${phr}`);
    if (c.syntax?.label) say(`    S: ${c.syntax.label}${c.syntax.head ? ` → ${c.syntax.head}` : ''}${c.syntax.status ? ` (${c.syntax.status})` : ''}`);
    say(`    D: ${dict}`);
    if (mode === 'pron' || mode === 'long') {
      say(`    R: ${c.transliteration ?? '—'}${c.lemmaTransliteration ? ` (lemma ${c.lemmaTransliteration})` : ''}  | dict: ${rec}`);
      say(`    pron: ${(c.pronunciation ?? []).join(' ').slice(0, 330)}`);
      try { const syl = adapter.decode(adapter.normalize(word)); say(`    syl: ${syl.map((s: any) => `${s.text}=${s.romanization ?? '?'}/${s.tone ?? '?'}@${s.confidence}${s.irregular ? '!' : ''}`).join(' ')}`); } catch { /* */ }
    }
    if (mode === 'long') { say('    notes: ' + c.notes.join(' || ').slice(0, 600)); say('    basis: ' + c.basis.join(' || ').slice(0, 300)); if (c.syntaxNotes?.length) say('    syn: ' + c.syntaxNotes.join(' || ').slice(0, 300)); }
    else if (c.notes.some((n: string) => /part of the word|Not an entry|not in/i.test(n))) say('    notes: ' + c.notes.filter((n: string) => /part of the word|Not an entry|not in/i.test(n)).join(' || ').slice(0, 300));
  }
  if (mode === 'seg' || c.tokenCount !== 1) {
    try {
      const s = adapter.segmentations(word, { before: sentence.slice(0, at), after: sentence.slice(at + word.length) });
      const show = (x: any) => `${x.words.map((w: any) => `${w.text}${w.known ? '' : '?'}${w.gloss ? `(${String(w.gloss).slice(0, 18)})` : ''}`).join('+')}@${x.confidence}`;
      say(`    SEG chosen ${show(s.chosen)}${s.alternatives.length ? ' | alt ' + s.alternatives.map(show).join(' | ') : ''}${s.reason ? ` | reason: ${s.reason}` : ''}`);
    } catch (e) { say('    SEG THROW ' + (e as Error).message); }
  }
}
const dest = process.argv[4];
if (dest) fs.writeFileSync(dest, out.join('\n') + '\n', 'utf8'); else console.log(out.join('\n'));
