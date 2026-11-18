// Probes on POINTED text taken from the repository's own Masoretic text (packages/biblia/public/data/he), never typed by hand:
// each battery line names a token by its consonants and, optionally, by the source's code and lemma number; the first such token of the
// Tanakh (in canonical order) is put through the card in its own verse. Line format (fields separated by spaces):
//   bare=<letters> [code=<regex on the OSHB code>] [lemma=<regex on the lemma chain>] [n=<k-th match>] [reg=full|pointed|bare] [# note]
// reg: full = as printed (default); pointed = cantillation removed; bare = consonants only (the whole verse).
import fs from 'node:fs';
import { bare, BIBLIA, card, dictLine, loadFull, strip, words } from './lib.mts';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
import { adapter } from './lib.mts';
await loadFull();
const ORDER = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', '1Sam', '2Sam', '1Kgs', '2Kgs', 'Isa', 'Jer', 'Ezek', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Ps', 'Prov', 'Job', 'Song', 'Ruth', 'Lam', 'Eccl', 'Esth', 'Dan', 'Ezra', 'Neh', '1Chr', '2Chr'];
type Tok = { ref: string; verse: string; k: number; surface: string; bare: string; lemma: string; code: string };
const all: Tok[] = [];
for (const b of ORDER) {
  const book = JSON.parse(fs.readFileSync(`${BIBLIA}/${b}.json`, 'utf8'));
  book.chapters.forEach((ch: any, ci: number) => { for (const v of ch.verses) {
    const text = String(v.t).normalize('NFC');
    const ws = text.replace(/\u05C0/g, '').split(/[\s\u00A0]+/).filter(Boolean).flatMap((w) => w.split('\u05BE')).map((w) => w.replace(/\u05C3/g, '')).filter(Boolean);
    if (ws.length !== v.w.length) continue;
    ws.forEach((w, k) => { if (v.w[k]) all.push({ ref: `${b} ${ci + 1}:${v.n}`, verse: text, k, surface: w, bare: bare(w), lemma: v.w[k][0], code: v.w[k][1] }); });
  } });
}
const mode = process.argv[3] ?? 'short';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (const line of lines) {
  const [spec, note] = line.split('#').map((x) => x.trim());
  const f: Record<string, string> = {};
  for (const part of spec.split(/\s+/)) { const i = part.indexOf('='); if (i > 0) f[part.slice(0, i)] = part.slice(i + 1); }
  const codeRe = f.code ? new RegExp(f.code) : undefined;
  const lemmaRe = f.lemma ? new RegExp(f.lemma) : undefined;
  const refRe = f.ref ? new RegExp(f.ref.replace(/_/g, ' ')) : undefined;
  const hits = all.filter((t) => (!f.bare || t.bare === f.bare) && (!codeRe || codeRe.test(t.code)) && (!lemmaRe || lemmaRe.test(t.lemma)) && (!refRe || refRe.test(t.ref)));
  const t = hits[Number(f.n ?? 1) - 1];
  if (!t) { console.log(`!! no token for: ${spec}${note ? `  # ${note}` : ''}`); continue; }
  const conv = f.reg === 'pointed' ? strip : f.reg === 'bare' ? bare : (s: string) => s;
  const verse = conv(t.verse);
  const ws = words(verse);
  const w = ws[t.k];
  if (!w) { console.log(`!! token lost after conversion: ${spec}`); continue; }
  const c = card(verse, w.surface, w.start);
  const gd = decodeOshb(t.lemma, t.code);
  const alts = (c.alternatives ?? []).map((a: any) => `${a.lemma ?? '?'}/${a.pos ?? '?'}(${a.confidence})${a.gloss ? '=' + String(a.gloss).slice(0, 16) : ''}`).join(', ');
  const wa = c.wordAnalysis;
  const meaning = wa?.contextualMeaning?.text ? `CTX:${wa.contextualMeaning.text}` : wa?.inflectedMeaning?.text ? `INFL:${wa.inflectedMeaning.text}` : wa?.lexicalMeaning?.text ? `LEX:${String(wa.lexicalMeaning.text).slice(0, 50)}` : '—';
  const dict = await dictLine(c, w.surface);
  console.log(`[${note ?? ''}] ${t.ref} «${w.surface}»${f.reg ? ` (${f.reg})` : ''}  source: ${t.lemma} ${t.code} = ${gd.pos}, ${adapter.describeMorph(gd.morph, gd.pos)}${hits.length > 1 ? `  (${hits.length} such tokens)` : ''}`
    + `\n   verse: ${verse.slice(0, 110)}`
    + `\n   ⇒ ${c.lemma ?? '∅'} / ${c.pos ?? '—'} / ${c.morphology ?? ''} / ${meaning} / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} / ${c.provenance} / period ${c.period?.varietyId ?? '—'}${c.notes.find((n: string) => n.startsWith('Variety')) ? ' / ' + c.notes.find((n: string) => n.startsWith('Variety')) : ''}`
    + `${alts ? `\n   also: ${alts}` : ''}`
    + `${c.role ? `\n   role: ${c.role}` : ''}${c.syntaxNotes?.length ? `\n   parts: ${c.syntaxNotes.join(' ; ')}` : ''}`
    + `\n   R: ${c.transliteration ?? '—'}${c.lemmaTransliteration ? ` (lemma ${c.lemmaTransliteration})` : ''} / D: ${dict}`);
  if (mode === 'long') {
    console.log('   notes: ' + (c.notes ?? []).join(' || ').slice(0, 500));
    if (wa?.formAnalysis) console.log('   form: root ' + (wa.formAnalysis.root ?? '—') + ' = ' + (wa.formAnalysis.rootMeaning ?? '—') + ' || ' + wa.formAnalysis.lines.map((l: any) => `${l.label}: ${l.text}`).join(' | ').slice(0, 420) + (wa.formAnalysis.limitation ? ' || LIMIT: ' + wa.formAnalysis.limitation : ''));
  }
}
