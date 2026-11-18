// The card's pronunciation line for single words: the transliteration shown, and the three named conventions in its notes.
// usage: pron.mts <file with "variety-or-dash | sentence | word">
import fs from 'node:fs';
import { card } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (const line of lines) {
  const [v, sentenceRaw, wordRaw] = line.split('|').map((x) => x.trim());
  const sentence = sentenceRaw.normalize('NFC');
  const word = (wordRaw ?? sentence).normalize('NFC');
  const c = await card('ext', sentence, word, sentence.indexOf(word), v && v !== '-' ? v : undefined);
  const notes: string[] = c.pronunciation ?? [];
  const get = (name: string) => (notes.find((n) => n.startsWith(name)) ?? '').replace(/^[^:]*:\s*/, '').split('. ')[0];
  const anc = notes.some((n) => n.startsWith('Koine'));
  console.log(`${word}  [${c.period?.varietyId ?? '—'}]  shown: ${c.transliteration ?? '∅'}${c.lemmaTransliteration ? ` (lemma ${c.lemma}: ${c.lemmaTransliteration})` : ''}${anc ? `  | Koine: ${get('Koine')} | Erasmian: ${get('Erasmian')} | Modern: ${get('Modern')}` : ''}`);
}
