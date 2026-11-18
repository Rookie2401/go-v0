// Card probe for Hebrew: one line per "sentence | word" (or "sentence | word#2" for the second occurrence; "sentence | *" for every word).
// A battery line may start with "@he-bib " / "@he-mod " / "@he-mish " to declare a variety (the extension declares none).
// Modes: short (default), long (notes, parts, analysis lines), pron (transliteration), core (compiled core only, no full index).
import fs from 'node:fs';
import { adapter, card, dictLine, loadFull, words } from './lib.mts';

const mode = process.argv[3] ?? 'short';
if (mode !== 'core') await loadFull();
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (let line of lines) {
  let extra: Record<string, unknown> = {};
  const v = /^@(\S+)\s+/.exec(line);
  if (v) { extra = { varietyId: v[1] }; line = line.slice(v[0].length); }
  const bar = line.lastIndexOf('|');
  const sentence = (bar >= 0 ? line.slice(0, bar) : line).trim().normalize('NFC');
  const wordRaw = (bar >= 0 ? line.slice(bar + 1) : '*').trim().normalize('NFC');
  const targets: Array<{ word: string; at: number }> = [];
  if (wordRaw === '*') for (const w of words(sentence)) targets.push({ word: w.surface, at: w.start });
  else {
    const m = /^(.*)#(\d)$/.exec(wordRaw);
    const word = m ? m[1] : wordRaw;
    let at = sentence.indexOf(word);
    if (m) for (let k = 1; k < Number(m[2]); k++) at = sentence.indexOf(word, at + 1);
    if (at < 0 && sentence !== word) { console.log(`!! «${word}» not found in "${sentence}"`); continue; }
    targets.push({ word, at });
  }
  for (const { word, at } of targets) {
    let c: any;
    try { c = card(sentence, word, at, extra); } catch (e) { console.log(`«${word}»: THROW ${(e as Error).message}`); continue; }
    const dict = mode === 'core' ? '' : await dictLine(c, word);
    const alts = (c.alternatives ?? []).map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}(${a.confidence})${a.gloss ? '=' + String(a.gloss).slice(0, 18) : ''}`).join(', ');
    const wa = c.wordAnalysis;
    const meaning = wa?.contextualMeaning?.text ? `CTX:${wa.contextualMeaning.text}` : wa?.inflectedMeaning?.text ? `INFL:${wa.inflectedMeaning.text}` : wa?.lexicalMeaning?.text ? `LEX:${wa.lexicalMeaning.text}` : '—';
    console.log(`«${word}» in "${sentence.slice(0, 60)}"${extra.varietyId ? ` [declared ${extra.varietyId}]` : ''}\n   ⇒ ${c.lemma ?? '∅'} / ${c.pos ?? '—'} / ${c.morphology ?? ''} / g:${String(c.gloss ?? '—').slice(0, 60)} / ${meaning.slice(0, 70)} / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} / ${c.provenance}`
      + `${alts ? `\n   also: ${alts}` : ''}`
      + `\n   period: ${c.period ? `${c.period.varietyId} (${c.period.evidence}) ${String(c.period.basis).slice(0, 110)}` : '—'}${c.role ? ` / role: ${c.role}` : ''}${c.syntaxNotes?.length ? ` / parts: ${c.syntaxNotes.join(' ; ')}` : ''}`
      + `${c.constructions?.length ? `\n   C: ${c.constructions.map((k: any) => `${k.id}[${k.title}]`).join(' ; ')}` : ''}${(c.phrases ?? []).length ? ` / P: ${c.phrases.map((p: any) => p.display).join(';')}` : ''}`
      + `\n   R: ${c.transliteration ?? '—'}${c.lemmaTransliteration ? ` (lemma ${c.lemmaTransliteration})` : ''}${mode === 'core' ? '' : ` / D: ${dict}`}`);
    if (mode === 'long') {
      console.log('   notes: ' + (c.notes ?? []).join(' || ').slice(0, 600));
      console.log('   basis: ' + (c.basis ?? []).join(' || ').slice(0, 300));
      console.log('   pron: ' + (c.pronunciation ?? []).join(' || ').slice(0, 300));
      if (wa?.formAnalysis) console.log('   form: root ' + (wa.formAnalysis.root ?? '—') + ' = ' + (wa.formAnalysis.rootMeaning ?? '—') + ' || ' + wa.formAnalysis.components.map((x: any) => `${x.text}: ${x.role}`).join(' ; ') + ' || ' + wa.formAnalysis.lines.map((l: any) => `${l.label}: ${l.text}`).join(' | ').slice(0, 500) + (wa.formAnalysis.limitation ? ' || LIMIT: ' + wa.formAnalysis.limitation : ''));
      if (c.variants) console.log('   variants: ' + c.variants.rows.map((r: any) => `${r.varietyId}:${r.status}${r.current ? '*' : ''}[${(r.forms ?? []).join(',')}]${r.note ? ' ' + r.note : ''}`).join(' | ').slice(0, 500));
      console.log('   feats: ' + JSON.stringify(c.features).slice(0, 300));
    }
  }
}
void adapter;
