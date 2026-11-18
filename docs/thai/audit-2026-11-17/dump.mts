// Dump of the whole Thai hand word list as the card would show each word alone:
// form | POS | gloss | role | register | counts/unit | segmentation of the form written alone | card romanisation | tones the card names |
// the dictionary record's romanisation + IPA | mechanical flags (TONE≠dict, ROM≠dict, NOROM, SPLIT, NODICT) | classifier note of the paradigm
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { thLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/th';
import { tonesFromIpa } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/thai/orthography';
registerAllAnalysers();
const rt = createPackRuntime(packFor('th')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter: any = parserAdapter('th')!;

/** RTGS from a Wiktionary IPA string (mechanical; used only to flag differences for a human to read). */
export function rtgsFromIpa(ipa: string): string {
  const syls = ipa.replace(/[/[\]]/g, '').split(/[.\s]+/).filter(Boolean);
  const V = 'aiɯueɛoɔɤ';
  return syls.map((s0) => {
    const s = s0.replace(/[˥-˩]/g, '').replace(/[\u031a\u032f\u0361]/g, '');
    let i = 0; let ini = '';
    while (i < s.length && !V.includes(s[i])) { ini += s[i]; i++; }
    let v = '';
    while (i < s.length && (V.includes(s[i]) || s[i] === 'ː')) { v += s[i]; i++; }
    const fin = s.slice(i);
    const I = ini.replace(/tɕʰ/g, 'ch').replace(/tɕ/g, 'ch').replace(/kʰ/g, 'kh').replace(/tʰ/g, 'th').replace(/pʰ/g, 'ph').replace(/ŋ/g, 'ng').replace(/j/g, 'y').replace(/ʔ/g, '');
    const vv = v.replace(/ː/g, '');
    const VV = vv === 'ia' ? 'ia' : vv === 'ɯa' ? 'uea' : vv === 'ua' ? 'ua' : vv.replace(/ɯ/g, 'ue').replace(/ɛ/g, 'ae').replace(/ɔ/g, 'o').replace(/ɤ/g, 'oe');
    const F = fin.replace(/ŋ/g, 'ng').replace(/j/g, 'i').replace(/w/g, 'o');
    return I + VV + F;
  }).join('');
}

const seen = new Set<string>();
const rows: string[] = [];
const stats = { entries: 0, words: 0, split: 0, norom: 0, toneShown: 0, toneDiff: 0, romDiff: 0, nodict: 0, handTranslit: 0 };
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
for (const e of thLexicon.entries as any[]) {
  stats.entries++;
  const key = `${e.lemma}|${e.pos}`;
  if (seen.has(key)) continue; seen.add(key);
  const form = e.lemma as string;
  const toks = adapter.tokenize(form).filter((t: any) => t.isWord);
  const cut = toks.map((t: any) => t.surface).join('+');
  let roman = ''; let tones = ''; let notes = ''; let gloss = e.gloss ?? ''; let role = ''; let reg = ''; let counts = '';
  const flags: string[] = [];
  if (toks.length === 1) {
    const c: any = parseSelection({ surface: form, languageId: 'th', context: { kind: 'none', confidence: 0 } });
    roman = c.transliteration ?? '';
    const toneNote = (c.pronunciation ?? []).find((n: string) => n.startsWith('Tone by syllable'));
    tones = toneNote ? toneNote.replace('Tone by syllable: ', '').replace(/\.$/, '') : ((c.pronunciation ?? []).some((n: string) => n.includes('not certain')) ? '(tone not given)' : '');
  } else { flags.push('SPLIT'); stats.split++; }
  const an = adapter.analyze(adapter.tokenize(form));
  const cand = an.flatMap((a: any) => a.candidates).find((x: any) => x.lemma === form && x.pos === e.pos);
  role = cand?.role ?? ''; reg = (cand?.register ?? []).join(','); counts = cand?.notes?.counts ?? (cand?.notes?.unit ? 'UNIT' : '');
  if (e.notes?.translit) stats.handTranslit++;
  let drom = ''; let dipa = '';
  try {
    const r: any = await rt.entry(form, e.pos, [form]);
    const recs = r?.records ?? [];
    const pick = recs.find((x: any) => x.p === e.pos) ?? recs[0];
    if (pick) { drom = pick.rom ?? ''; dipa = (pick.ipa ?? [])[0]?.i ?? ''; }
  } catch { /* */ }
  if (!dipa) { flags.push('NODICT'); stats.nodict++; }
  if (toks.length === 1) {
    stats.words++;
    if (!roman) { flags.push('NOROM'); stats.norom++; }
    if (tones && !tones.startsWith('(')) {
      stats.toneShown++;
      if (dipa) {
        const dt = tonesFromIpa(dipa).join(',');
        const ct = tones.split(', ').map((x) => x.trim().split(' ').pop()).join(',');
        if (dt !== ct) { flags.push(`TONE≠dict(${dt})`); stats.toneDiff++; }
      }
    }
    if (roman && dipa) {
      const dr = rtgsFromIpa(dipa);
      if (squash(dr) !== squash(roman)) { flags.push(`ROM≠dict(${dr})`); stats.romDiff++; }
    }
  }
  let clf = '';
  if (e.pos === 'NOUN') { try { const p: any = adapter.paradigm(form, 'NOUN'); clf = (p.notes ?? []).filter((n: string) => /Classifier|counts itself|records no classifier/.test(n)).map((n: string) => n.replace(' The word list names it by what the classifier counts, not by a rule for this noun.', '').replace('The word list records no classifier for this noun; a dictionary entry may name one.', '—')).join(' '); } catch { /* */ } }
  rows.push([form, e.pos, gloss, role ? `role=${role}` : '', reg ? `reg=${reg}` : '', counts ? `counts=${counts}` : '', cut !== form ? `cut=${cut}` : '', `R=${roman || '—'}${e.notes?.translit ? '(hand)' : ''}`, `T=${tones || '—'}`, `dict=${drom || '—'} ${dipa}`, flags.join(' '), clf ? `CLF: ${clf}` : ''].filter((x) => x !== '').join('\t'));
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/thaudit/dump-wordlist.tsv', rows.join('\n') + '\n', 'utf8');
console.log(JSON.stringify(stats));
