import fs from 'node:fs';
for (const lang of ['de','es']) {
  const root = `data/sources/${lang}`;
  const prose = JSON.parse(fs.readFileSync(`${root}-prose/library-manifest.json`, 'utf8'));
  const bible = JSON.parse(fs.readFileSync(`data/sources/${lang}-bible/library-manifest.json`, 'utf8'));
  const entries = [...bible.entries.map((e: any) => ({ ...e, slug: e.slug.toLowerCase(), source: { ...e.source, file: `${lang}-bible/${e.source.file}` } })), ...prose.entries.map((e: any) => ({ ...e, source: { ...e.source, file: e.source.file.startsWith(`${lang}-children/`) ? e.source.file : `${lang}-prose/${e.source.file}` } }))];
  if (lang === 'de') {
    const bechstein = JSON.parse(fs.readFileSync('data/sources/de-children/bechstein-maerchenbuch.json', 'utf8'));
    const existingBechstein = entries.findIndex((e: any) => e.slug === bechstein.slug);
    const bechsteinEntry = { ...bechstein, source: { ...bechstein.source, file: bechstein.source.file.startsWith('de-children/') ? bechstein.source.file : `de-children/${bechstein.source.file}` } };
    if (existingBechstein >= 0) entries[existingBechstein] = bechsteinEntry;
    else entries.push(bechsteinEntry);
    const external = JSON.parse(fs.readFileSync('data/sources/de-children-wikisource/library-manifest.json', 'utf8'));
    const externalSlugs = new Set(external.entries.map((e: any) => e.slug));
    for (let i = entries.length - 1; i >= 0; i--) if (externalSlugs.has(entries[i].slug)) entries.splice(i, 1);
    for (const e of external.entries) {
      const source = { ...e.source, file: `de-children-wikisource/${e.source.file}` };
      if (e.slug === 'grimm-khm' && !source.url) source.url = source.urls?.[0];
      e.rights = { ...e.rights, copyrightStatus: 'licensed', licensing: 'CC BY-SA 4.0', licence: 'CC BY-SA 4.0 (Wikisource transcription; underlying historical edition public domain)', jurisdictions: ['a worldwide CC BY-SA transcription licence; no country-by-country public-domain claim'], statusByJurisdiction: { '*': 'licensed' }, attributionRequired: true, shareAlike: true, commercialUse: true, compliance: 'Retain attribution, indicate changes, and share adaptations under CC BY-SA 4.0.' };
      entries.push({ ...e, source });
    }
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(`${root}/library-manifest.json`, JSON.stringify({ schema: 1, lang, entries }, null, 2) + '\n');
}
