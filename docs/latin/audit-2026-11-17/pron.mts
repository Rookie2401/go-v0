import { latinPronunciation } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/pronunciation';
for (const w of process.argv.slice(2)) { const p = latinPronunciation(w); console.log(w, '⇒', p.transliteration, '||', (p.notes ?? []).map((n) => n.slice(0, 70)).join(' | ')); }
