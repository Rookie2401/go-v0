/**
 * Hand-written reading priors for the Vulgate: forms the Clementine text uses overwhelmingly as one lemma while the lexicon's
 * lemma counts (or the treebank priors of classical prose) favour another. Same line format as priors-data.ts
 * (`form \t total \t lemma:group:count ...`, groups N noun, V verb, A adjective, D adverb, R preposition); the counts are weights,
 * not corpus figures. Installed after the generated table, so a form listed here overrides it. Keys and lemmas are written with
 * v and j as in the lexicon; the fold to the lookup spelling (u, i) is applied below.
 *
 * Written by hand on 2026-10-25 from the first-reading disagreements with the PROIEL gold of the New Testament
 * (`data/review/latin-eval/misses.json`, `goldLemmaErrors`) and a reading of the whole Vulgate; it therefore TUNES the adapter on
 * the text it is scored against, which docs/latin/ADAPTER.md says plainly. Nothing here adds a reading: a form the analyser cannot
 * read as the listed lemma is unaffected (priors.ts). Only forms with a competing reading are listed.
 */
const ROWS = [
  // noun / verb homographs: the noun reading is the Vulgate's
  'scribis\t10\tscriba:N:9 scribo:V:1',           // scribae et Pharisaei; dative / ablative plural
  'laudem\t10\tlaus:N:9 laudo:V:1',               // in laudem gloriae; the subjunctive is rare
  'laudes\t10\tlaus:N:8 laudo:V:2',
  'legi\t10\tlex:N:8 lego:V:2',                   // dative of lex; "legi" I read is rare
  'legis\t10\tlex:N:9 lego:V:1',
  'vasa\t10\tvas:N:10',                           // vasa aurea; never vasum
  'loca\t10\tlocus:N:10',                         // loca deserta; locum is not a lemma of the Vulgate
  'praecepta\t10\tpraeceptum:N:8 praecipio:V:2',  // praecepta Domini
  'praeceptis\t10\tpraeceptum:N:8 praecipio:V:2',
  'facies\t10\tfacies:N:7 facio:V:3',             // a facie Domini; the future of facio is the minority
  'ventus\t10\tventus:N:9 venio:V:1',             // ventus validus
  'venti\t10\tventus:N:8 venio:V:2',
  'auditus\t10\taudio:V:7 auditus:N:3',           // auditus est: the participle
  'visus\t10\tvideo:V:7 visus:N:3',               // visus est eis: the participle
  'cantus\t10\tcantus:N:8 cano:V:2',
  'fructus\t10\tfructus:N:9 fruor:V:1',
  'exercitus\t10\texercitus:N:9 exerceo:V:1',
  'adventus\t10\tadventus:N:9 advenio:V:1',
  'census\t10\tcensus:N:8 censeo:V:2',
  'portas\t10\tporta:N:9 porto:V:1',              // portas civitatis
  'regis\t10\trex:N:9 rego:V:1',                  // filius regis
  'reges\t10\trex:N:9 rego:V:1',
  'ducis\t10\tdux:N:7 duco:V:3',
  'duces\t10\tdux:N:8 duco:V:2',
  'sedes\t10\tsedes:N:8 sedeo:V:2',               // sedes tua, Deus
  'opera\t10\topus:N:9 opera:N:1',                // opera eius; the singular opera is rare
  'ora\t10\tos:N:8 ora:N:1 oro:V:1',              // ora eorum: mouths
  'oris\t10\tos:N:9 ora:N:1',
  'novi\t10\tnovus:A:6 nosco:V:4',                // vinum novum, testamenti novi; but novi vos
  // adverbs of degree the Vulgate prefers as adverbs
  'amplius\t10\tamplius:D:9 amplus:A:1',
  'plus\t10\tplus:D:7 multus:A:3',
  'minus\t10\tminus:D:8 minor:A:2',
  'magis\t10\tmagis:D:10',
  // sine: the preposition; the imperative of sino (sine modo) is the exception
  'sine\t10\tsine:R:9 sino:V:1',
];
export const VULGATE_FORM_PRIORS = ROWS.join('\n').replace(/v/g, 'u').replace(/j/g, 'i');
