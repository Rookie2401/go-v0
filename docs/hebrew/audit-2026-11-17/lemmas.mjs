// Mechanical checks over the lemma table of the Tanakh index (9,200 rows: headword, gloss, part of speech, count).
import fs from 'node:fs';
const B = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0/public/lexicon/he/biblical-index.json', 'utf8'));
const rows = Object.entries(B.lemmas);
const out = [];
const tok = (id) => B.lemmas[id][3];
const list = (name, f) => { const hit = rows.filter(([id, r]) => f(r, id)).sort((a, b) => b[1][3] - a[1][3]); out.push(`\n== ${name}: ${hit.length} lemmas, ${hit.reduce((s, x) => s + x[1][3], 0)} tokens`); out.push(hit.slice(0, 60).map(([id, r]) => `${r[0]} (${id}; ${r[2]}; ${r[3]}×; "${String(r[1]).slice(0, 28)}")`).join(' | ')); };
out.push(`lemma rows: ${rows.length}`);
list('headword carries an accent or meteg mark', (r) => /[\u0591-\u05AF\u05BD]/.test(r[0]));
list('headword of two or more words', (r) => /\s/.test(r[0].trim()));
list('headword begins with b g d k p t without the dagesh', (r) => /^[בגדכפת](?![\u05B0-\u05BB\u05C1\u05C2]*\u05BC)/.test(r[0].normalize('NFC')));
list('no gloss', (r) => !String(r[1]).trim());
list('gloss is a single English word of 1-2 letters or contains "?"', (r) => /\?/.test(r[1]) || /^[a-z]{1,2}$/i.test(String(r[1]).trim()));
list('verb whose headword is not a 3ms perfect shape (ends in a vowel letter pattern other than the usual)', (r) => r[2] === 'VERB' && /[\u05B4]\u05D9[\u05D0-\u05EA]$/.test(r[0].normalize('NFC')) === false && /\u05D5\u05BC[\u05D0-\u05EA]$|\u05D5\u05B9[\u05D0-\u05EA]$/.test(r[0].normalize('NFC')) && false);
list('part of speech X or empty', (r) => !r[2] || r[2] === 'X');
// same pointed headword, same part of speech, more than one lemma id (homonym numbers a card cannot tell apart)
const byHead = new Map();
for (const [id, r] of rows) { const k = `${r[0]}|${r[2]}`; byHead.set(k, [...(byHead.get(k) ?? []), id]); }
const dup = [...byHead.entries()].filter(([, ids]) => ids.length > 1);
out.push(`\n== same pointed headword and part of speech under several lemma numbers: ${dup.length} headwords, ${dup.reduce((s, [, ids]) => s + ids.length, 0)} lemma rows`);
out.push(dup.sort((a, b) => b[1].reduce((s, i) => s + tok(i), 0) - a[1].reduce((s, i) => s + tok(i), 0)).slice(0, 40).map(([k, ids]) => `${k.split('|')[0]} ${k.split('|')[1]}: ${ids.map((i) => `${i}="${String(B.lemmas[i][1]).slice(0, 18)}"`).join(' / ')}`).join(' | '));
// the 60 commonest lemmas, for a read of headword and gloss
out.push('\n== the 150 commonest lemmas (headword, part of speech, gloss)');
out.push(rows.sort((a, b) => b[1][3] - a[1][3]).slice(0, 150).map(([id, r]) => `${r[0]} ${r[2]} "${r[1]}"`).join(' | '));
fs.writeFileSync('lemmas-out.txt', out.join('\n'));
console.log(out.join('\n').slice(0, 9000));
