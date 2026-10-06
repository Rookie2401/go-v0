import fs from 'node:fs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const apiFor = (lang) => `https://${lang === 'hi' ? 'hi' : 'sq'}.wikisource.org/w/api.php?action=query&format=json&list=search&srnamespace=0&srlimit=3&srsearch=`;
for (const lang of ['hi','sq']) {
  const items = JSON.parse(fs.readFileSync(`work-${lang}.json`)); const out=[];
  for (const item of items) {
    let hits=[]; try { const r=await fetch(apiFor(lang)+encodeURIComponent(item.title)); const j=await r.json(); hits=(j.query?.search??[]).map(x=>({title:x.title,pageid:x.pageid})); } catch {}
    out.push({...item, wikisourceSearch:hits, assessment:hits.length ? 'primary-page-lead-needs-exact-scan-and-licence-check' : 'no-Wikisource-title-hit; exact primary edition not located'});
  }
  fs.mkdirSync(`data/sources/${lang}-literature`,{recursive:true}); fs.writeFileSync(`data/sources/${lang}-literature/research.json`,JSON.stringify({retrievedAt:'2026-10-01',api:apiFor(lang),items:out},null,2));
}
