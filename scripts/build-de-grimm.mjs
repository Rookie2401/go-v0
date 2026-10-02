/**
 * Build the bundled Grimm tales from German Wikisource. Nothing is retyped.
 *
 *   node scripts/build-de-grimm.mjs           # fetch, write data/corpus/de/<slug>.json and data/sources/de/<slug>.source.json
 *   node scripts/build-de-grimm.mjs --dry     # fetch and report only
 *
 * Source: de.wikisource.org, the transcription of "Kinder- und Haus-Märchen", 7th edition (Göttingen: Dieterich, 1857),
 * each tale's own page. The script refuses a page that Wikisource does not mark "fertig" (proofread twice against the
 * scan) or whose scan pages are not all of quality 4. The German text is taken as it stands, in the spelling of 1857
 * (daß, gieng, that, Thaler): it is never modernised. Page-number marks are removed; nothing else is.
 *
 * Sentences: the tale is cut at the END ANCHORS listed below (the last words of each sentence). The script checks that
 * the sentences, joined by single spaces, give back the fetched paragraph exactly — so a wrong anchor stops the build
 * and no German is ever typed in by hand. The English lines are plain translations drafted by an AI model for this
 * course: they are NOT reviewed, and the document is therefore not published until a person has read them.
 *
 * The evidence the rights record needs (revision id and time, proofreading state, the site's licence statement, the
 * sha256 of the fetched text) is written beside the document.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://de.wikisource.org/w/api.php';
const UA = { 'User-Agent': 'GoCourseBuilder/0.1 (educational corpus tool; fetches two public-domain tales once)' };
const dry = process.argv.includes('--dry');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const TALES = [
  {
    slug: 'grimm-sternthaler-1857', page: 'Die Sternthaler (1857)', title: 'Die Sternthaler', khm: 153, scanPage: 285, volume: 2,
    sentences: [
      ['geschenkt hatte.', 'Once upon a time there was a little girl whose father and mother had died, and she was so poor that she no longer had a little room to live in or a little bed to sleep in, and at last had nothing left but the clothes on her body and a little piece of bread in her hand, which a kind heart had given her.'],
      ['gut und fromm.', 'But she was good and devout.'],
      ['hinaus ins Feld.', 'And because she was so forsaken by all the world, she went out into the fields, trusting in the good Lord.'],
      ['so hungerig.“', 'There a poor man met her, who said, “Oh, give me something to eat, I am so hungry.”'],
      ['gieng weiter.', 'She handed him the whole piece of bread and said, “God bless it to you,” and went on.'],
      ['bedecken kann.“', 'Then came a child who wailed and said, “My head is so cold, give me something to cover it with.”'],
      ['gab sie ihm.', 'So she took off her cap and gave it to him.'],
      ['von sich hin.', 'And when she had walked a while longer, another child came who had no bodice on and was freezing: so she gave it hers; and a little farther on one asked for a little skirt, and she gave that away too.'],
      ['auch noch hin.', 'At last she came into a forest, and it had already grown dark, and yet another came and asked for a little shirt, and the devout girl thought, “It is a dark night, no one will see you, you can well give your shirt away,” and she took off the shirt and gave that away as well.'],
      ['allerfeinsten Linnen.', 'And as she stood there with nothing left at all, suddenly the stars fell from the sky, and they were nothing but hard, shining thalers; and although she had given away her little shirt, she had a new one on, and it was of the very finest linen.'],
      ['sein Lebtag.', 'Then she gathered the thalers into it and was rich for the rest of her life.'],
    ],
  },
  {
    slug: 'grimm-der-suesse-brei-1857', page: 'Der süße Brei (1857)', title: 'Der süße Brei', khm: 103, scanPage: 90, volume: 2,
    sentences: [
      ['mehr zu essen.', 'Once upon a time there was a poor, devout girl who lived alone with her mother, and they had nothing left to eat.'],
      ['auf zu kochen.', 'So the child went out into the forest, and there an old woman met her who already knew of her misery and gave her a little pot, to which she was to say, “Little pot, cook,” and it would cook good sweet millet porridge; and when she said, “Little pot, stop,” it would stop cooking again.'],
      ['oft sie wollten.', 'The girl brought the pot home to her mother, and now they were rid of their poverty and their hunger and ate sweet porridge as often as they liked.'],
      ['das Wort nicht.', 'One time the girl had gone out, and the mother said, “Little pot, cook,” and it cooks, and she eats her fill; now she wants the pot to stop again, but she does not know the word.'],
      ['da zu helfen.', 'So it goes on cooking, and the porridge rises over the rim and keeps on cooking, the kitchen and the whole house full, and the second house and then the street, as if it wanted to feed the whole world, and there is the greatest distress, and no one knows what to do.'],
      ['sich durchessen.', 'At last, when only one single house is left, the child comes home and just says, “Little pot, stop,” and it stops and leaves off cooking; and whoever wanted to go back into the town had to eat his way through.'],
    ],
  },
];

async function api(params) {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: UA });
  if (!res.ok) throw new Error(`Wikisource API: HTTP ${res.status}`);
  return res.json();
}

const site = await api({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' });
const licence = site.query.rightsinfo;
console.log(`site licence statement: ${licence.text} (${licence.url})`);
const today = new Date().toISOString().slice(0, 10);

for (const tale of TALES) {
  const j = await api({ action: 'parse', page: tale.page, prop: 'wikitext|text|revid' });
  const info = await api({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp', titles: tale.page });
  const rev = info.query.pages[0].revisions[0];
  const wikitext = j.parse.wikitext;
  const html = j.parse.text;
  const state = /BEARBEITUNGSSTAND=(\S+)/.exec(wikitext)?.[1];
  const edition = (/AUFLAGE=([^\n]*)/.exec(wikitext)?.[1] ?? '').replace(/<br \/>/g, ' ').replace(/\s+/g, ' ').trim();
  const year = /ERSCHEINUNGSJAHR=(\d+)/.exec(wikitext)?.[1];
  const place = /ERSCHEINUNGSORT=([^\n]*)/.exec(wikitext)?.[1]?.trim();
  const publisher = /VERLAG=([^\n]*)/.exec(wikitext)?.[1]?.trim();
  const qualities = [...html.matchAll(/prp-pagequality-(\d)/g)].map((m) => m[1]);
  const pages = [...html.matchAll(/id="Seite&#95;(\d+)"/g)].map((m) => Number(m[1]));
  if (state !== 'fertig' || qualities.length === 0 || qualities.some((q) => q !== '4')) {
    console.error(`${tale.slug}: the source page is not marked proofread twice (state ${state}, page qualities ${qualities.join(',') || 'none'}): nothing is built`);
    process.exitCode = 1;
    continue;
  }
  if (year !== '1857') { console.error(`${tale.slug}: the page does not state the edition of 1857 (found ${year})`); process.exitCode = 1; continue; }

  // the text: the paragraphs after the first page-number mark, without the page-number marks
  const from = html.indexOf('class="PageNumber"');
  const body = html.slice(html.lastIndexOf('<div', from));
  const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => m[1].replace(/<span class="PageNumber"[\s\S]*?<\/span>/g, '').replace(/<span class="AndereVersion"[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().normalize('NFC'))
    .filter(Boolean);
  if (paragraphs.length !== 1) { console.error(`${tale.slug}: expected one paragraph of text, found ${paragraphs.length}`); process.exitCode = 1; continue; }
  const text = paragraphs[0];

  // cut at the end anchors, and prove that nothing was lost or changed
  const sentences = [];
  let at = 0;
  for (const [anchor, english] of tale.sentences) {
    const i = text.indexOf(anchor, at);
    if (i < 0) { console.error(`${tale.slug}: end anchor not found after position ${at}: "${anchor}"`); process.exitCode = 1; break; }
    const end = i + anchor.length;
    sentences.push({ text: text.slice(at, end).trim(), english });
    at = end;
  }
  const rebuilt = sentences.map((s) => s.text).join(' ');
  if (rebuilt !== text) { console.error(`${tale.slug}: the sentences do not give back the source text exactly (${rebuilt.length} vs ${text.length} characters)`); process.exitCode = 1; continue; }

  const words = text.split(/\s+/).length;
  const url = `https://de.wikisource.org/wiki/${encodeURIComponent(tale.page.replace(/ /g, '_'))}`;
  const permalink = `https://de.wikisource.org/w/index.php?oldid=${rev.revid}`;
  console.log(`${tale.slug}: ${sentences.length} sentences, ${words} words; revision ${rev.revid} of ${rev.timestamp}; state ${state}; scan pages ${pages.join(',')} quality ${qualities.join(',')}; ${edition}, ${publisher}, ${place} ${year}; text sha256 ${sha256(text).slice(0, 16)}…`);

  const source = {
    slug: tale.slug, title: tale.title, authors: 'Jacob Grimm (1785–1863), Wilhelm Grimm (1786–1859)', khm: tale.khm,
    edition: `Kinder- und Haus-Märchen, Große Ausgabe, Band ${tale.volume}, ${edition}; ${place}: ${publisher}, ${year}; page ${tale.scanPage}`,
    repository: 'de.wikisource.org', page: tale.page, url, permalink, revisionId: rev.revid, revisionTimestamp: rev.timestamp,
    proofreading: `Wikisource state "${state}" (proofread twice against the scan); scan page quality ${qualities.join(',')} of 4`,
    siteLicence: `${licence.text} (${licence.url})`, retrievedAt: today, textSha256: sha256(text), words, sentences: sentences.length,
    modifications: 'page-number marks removed; whitespace normalised to single spaces; otherwise identical to the transcription, in the spelling of 1857',
  };
  const doc = {
    schemaVersion: 2,
    id: tale.slug,
    lang: 'de',
    title: tale.title,
    contentType: 'story',
    corpus: { id: 'lit-de', kind: 'comprehensible-input', title: 'German literature' },
    source: {
      id: `src:de:${tale.slug}`,
      title: `${tale.title} (Kinder- und Haus-Märchen, 7. Auflage 1857, KHM ${tale.khm})`,
      author: 'Jacob und Wilhelm Grimm',
      publisher: `${publisher}, ${place}`,
      url: permalink,
      edition: `7. Auflage 1857 (Ausgabe letzter Hand), Band ${tale.volume}, S. ${tale.scanPage}`,
      attribution: `Brüder Grimm, Kinder- und Haus-Märchen (1857). Transcription: German Wikisource (${url}), available under ${licence.text}.`,
      provenance: `Taken by scripts/build-de-grimm.mjs on ${today} from the German Wikisource transcription of the 1857 edition (revision ${rev.revid}, marked there as proofread twice against the scan). Nothing was retyped; page-number marks were removed and the original spelling of 1857 is kept. The English lines are plain translations drafted by an AI model for this course and have not been reviewed.`,
      rights: 'public-domain',
      licenseNote: `The tale is in the public domain (Wilhelm Grimm died in 1859, Jacob Grimm in 1863; this edition appeared in 1857). The transcription comes from German Wikisource, whose text is offered under ${licence.text}: the source is named here and on the text.`,
      authorship: 'public-domain',
    },
    review: { status: 'unreviewed', notes: 'The German wording is identical to the source transcription (checked by the build script). The English lines are machine-drafted: a person must read them before this text is published.' },
    difficulty: 'B1',
    topics: ['fairy-tale', 'grimm'],
    editorialTags: ['english-machine-drafted'],
    prepTargets: [],
    generated: false,
    work: { slug: tale.slug, chapter: { index: 1, title: tale.title } },
    streams: ['library'],
    variety: 'de-pre1901',
    english: { source: 'Plain English drafted by an AI model for this course; not reviewed' },
    sections: [{ title: tale.title, paragraphs: [{ sentences }] }],
  };
  if (!dry) {
    fs.mkdirSync('data/sources/de', { recursive: true });
    fs.writeFileSync(`data/sources/de/${tale.slug}.source.json`, `${JSON.stringify(source, null, 2)}\n`);
    fs.writeFileSync(`data/corpus/de/${tale.slug}.json`, `${JSON.stringify(doc, null, 2)}\n`);
  }
}
console.log(dry ? 'dry run: nothing written' : 'written');
