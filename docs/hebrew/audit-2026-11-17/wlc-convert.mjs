// Reads the Open Scriptures Hebrew Bible itself (Westminster Leningrad Codex text + morphology; the local copy the Biblia build used:
// C:/Users/CJWal/dev/biblia-v0/data/oshb/*.xml, read-only) into the same JSON shape as the repository's aligned data, so that the
// Tanakh can be read back in the WLC spelling (the text of tanach.us, BibleHub, STEP, most Bible software) beside the MAM spelling the
// index was keyed on. The qere is taken where the text has ketiv / qere. Output: wlc/<Book>.json in this folder.
import fs from 'node:fs';
const SRC = 'C:/Users/CJWal/dev/biblia-v0/data/oshb';
const OUT = 'C:/Users/CJWal/dev/tmp-mem/heaudit/wlc';
fs.mkdirSync(OUT, { recursive: true });
let verses = 0, tokens = 0;
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.xml') && !/VerseMap/i.test(x))) {
  const xml = fs.readFileSync(`${SRC}/${f}`, 'utf8');
  const book = f.replace('.xml', '');
  const chapters = [];
  const re = /<verse osisID="[^"]*\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g;
  let m;
  while ((m = re.exec(xml))) {
    const ch = Number(m[1]), vn = Number(m[2]);
    let body = m[3];
    body = body.replace(/<w type="x-ketiv"[^>]*>[^<]*<\/w>/g, '');
    body = body.replace(/<note type="variant">[\s\S]*?<rdg type="x-qere">([\s\S]*?)<\/rdg>\s*<\/note>/g, '$1');
    body = body.replace(/<note[^>]*>[\s\S]*?<\/note>/g, '');
    const parts = [];
    const w = [];
    const tk = /<w ([^>]*)>([^<]*)<\/w>|<seg type="x-maqqef">[^<]*<\/seg>|<seg type="x-paseq">[^<]*<\/seg>/g;
    let t;
    while ((t = tk.exec(body))) {
      if (t[0].startsWith('<seg type="x-maqqef"')) { parts.push('\u05BE'); continue; }
      if (t[0].startsWith('<seg')) { parts.push(' \u05C0'); continue; }
      const lemma = /lemma="([^"]*)"/.exec(t[1])?.[1] ?? '';
      const morph = /morph="([^"]*)"/.exec(t[1])?.[1] ?? '';
      const text = t[2].replace(/\//g, '');
      if (parts.length && parts[parts.length - 1] !== '\u05BE') parts.push(' ');
      parts.push(text);
      w.push(lemma && morph ? [lemma, morph] : null);
      tokens++;
    }
    (chapters[ch - 1] ??= { verses: [] }).verses.push({ n: vn, t: parts.join('') + '\u05C3', w });
    verses++;
  }
  fs.writeFileSync(`${OUT}/${book}.json`, JSON.stringify({ book, chapters }));
}
console.log(`${verses} verses, ${tokens} tokens → ${OUT}`);
