import fs from 'node:fs';
for (const lang of ['hi','sq']) {
  const dir = `data/sources/${lang}-literature`; const r=JSON.parse(fs.readFileSync(`${dir}/research.json`));
  const lines=[`# ${lang.toUpperCase()} literature acquisition audit`,``,`Date: 2026-10-01. Primary search: ${r.api}`,``,`No text is imported by this audit. A Wikisource search hit is a lead only: the exact scan/edition, source-country term, transcription layer, and attribution must be established before bundling.`,``,`| Catalogue work | Primary-source result | Decision |`,`|---|---|---|`];
  for(const x of r.items){const hits=(x.wikisourceSearch??[]).map(h=>`[${h.title}](https://${lang}.wikisource.org/wiki/${encodeURIComponent(h.title).replace(/%2F/g,'/')})`).join('; '); lines.push(`| ${x.slug} — ${x.title.replaceAll('|','\\|')} | ${hits||'No exact Wikisource title returned'} | ${hits?'Lead only; exact edition/licence/rights evidence incomplete':'Blocked: no primary title hit in bounded search'} |`);}
  fs.writeFileSync(`docs/${lang==='hi'?'hindi':'albanian'}/LITERATURE_ACQUISITION.md`,lines.join('\n')+'\n');
  fs.writeFileSync(`${dir}/library-manifest.json`,JSON.stringify({schema:1,lang,entries:[],note:'No exact reusable edition passed the bounded primary-source and licence review.'},null,2)+'\n');
}
