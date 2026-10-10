/**
 * Names for the language codes the dictionary's etymology templates use (Wiktionary's codes), so the Origin section can say
 * "from Latin liber" and not "la: liber". The list is the codes that actually occur in the built dictionaries
 * (public/dict/<lang>/full: German, Spanish, Hindi, Albanian, Thai), most frequent first within each group. A code that is
 * not here stays a code: a name is never guessed. Names follow Wiktionary's own names for the codes.
 */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  // the learner languages of the packs and their neighbours
  de: 'German', sq: 'Albanian', es: 'Spanish', hi: 'Hindi', th: 'Thai', nb: 'Norwegian Bokmål', nn: 'Norwegian Nynorsk', no: 'Norwegian',
  en: 'English', fr: 'French', it: 'Italian', pt: 'Portuguese', ca: 'Catalan', gl: 'Galician', ro: 'Romanian', oc: 'Occitan', an: 'Aragonese', ast: 'Asturian', lad: 'Ladino', scn: 'Sicilian', vec: 'Venetian',
  nl: 'Dutch', da: 'Danish', sv: 'Swedish', is: 'Icelandic', fo: 'Faroese', af: 'Afrikaans', fy: 'West Frisian', lb: 'Luxembourgish', yi: 'Yiddish', gsw: 'Alemannic German', bar: 'Bavarian', nds: 'Low German', 'nds-de': 'German Low German', hrx: 'Hunsrik', stq: 'Saterland Frisian',
  // older stages of Latin, Germanic, Romance and Greek
  la: 'Latin', 'la-vul': 'Vulgar Latin', 'la-lat': 'Late Latin', 'la-med': 'Medieval Latin', 'la-new': 'New Latin', 'la-ecc': 'Ecclesiastical Latin', 'la-eme': 'Early Modern Latin',
  grc: 'Ancient Greek', 'grc-koi': 'Koine Greek', gkm: 'Medieval Greek', el: 'Greek',
  gmh: 'Middle High German', goh: 'Old High German', gml: 'Middle Low German', osx: 'Old Saxon', ang: 'Old English', enm: 'Middle English', dum: 'Middle Dutch', odt: 'Old Dutch', non: 'Old Norse', got: 'Gothic', ofs: 'Old Frisian', frk: 'Frankish', 'gmw-cfr': 'Central Franconian',
  fro: 'Old French', frm: 'Middle French', osp: 'Old Spanish', 'roa-opt': 'Old Portuguese', pro: 'Old Occitan', mxi: 'Mozarabic',
  // reconstructed ancestors
  'ine-pro': 'Proto-Indo-European', 'gem-pro': 'Proto-Germanic', 'gmw-pro': 'Proto-West Germanic', 'sla-pro': 'Proto-Slavic', 'itc-pro': 'Proto-Italic', 'cel-pro': 'Proto-Celtic', 'iir-pro': 'Proto-Indo-Iranian', 'ira-pro': 'Proto-Iranian', 'inc-pro': 'Proto-Indo-Aryan', 'sqj-pro': 'Proto-Albanian', 'tai-pro': 'Proto-Tai', 'tai-swe-pro': 'Proto-Southwestern Tai', 'trk-pro': 'Proto-Turkic', 'mkh-pro': 'Proto-Mon-Khmer', 'map-pro': 'Proto-Austronesian', 'poz-pro': 'Proto-Malayo-Polynesian',
  // India, Iran and the Near East
  sa: 'Sanskrit', pi: 'Pali', pra: 'Prakrit', 'pra-sau': 'Sauraseni Prakrit', 'inc-ohi': 'Old Hindi', 'inc-ash': 'Ashokan Prakrit', pa: 'Punjabi', bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', ne: 'Nepali', as: 'Assamese', or: 'Odia', sd: 'Sindhi', kok: 'Konkani', bho: 'Bhojpuri', mai: 'Maithili', mwr: 'Marwari', awa: 'Awadhi', ks: 'Kashmiri', si: 'Sinhalese', dv: 'Dhivehi', syl: 'Sylheti', rom: 'Romani', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', dra: 'Dravidian',
  fa: 'Persian', 'fa-cls': 'Classical Persian', pal: 'Middle Persian', peo: 'Old Persian', ae: 'Avestan', ota: 'Ottoman Turkish', tr: 'Turkish', trk: 'Turkic', ar: 'Arabic', xaa: 'Andalusian Arabic', he: 'Hebrew', hbo: 'Biblical Hebrew', arc: 'Aramaic', syc: 'Classical Syriac', akk: 'Akkadian', sem: 'Semitic', egy: 'Egyptian', hit: 'Hittite',
  // South-East and East Asia
  lo: 'Lao', km: 'Khmer', okz: 'Old Khmer', xhm: 'Middle Khmer', mnw: 'Mon', my: 'Burmese', vi: 'Vietnamese', ms: 'Malay', jv: 'Javanese', tl: 'Tagalog',
  shn: 'Shan', khb: 'Lü', nod: 'Northern Thai', tts: 'Isan', sou: 'Southern Thai', aho: 'Ahom', za: 'Zhuang', zhn: 'Nong Zhuang', zzj: 'Zuojiang Zhuang', blt: 'Tai Dam', tdd: 'Tai Nüa', kkh: 'Khün', phk: 'Phake', twh: 'Tai Dón', tyz: 'Tày', skb: 'Saek', pcc: 'Bouyei', aio: 'Aiton', kht: 'Khamti',
  zh: 'Chinese', cmn: 'Mandarin', yue: 'Cantonese', ltc: 'Late Middle Chinese', och: 'Old Chinese', 'nan-hbl': 'Hokkien', ja: 'Japanese', ko: 'Korean',
  // the rest of Europe
  ru: 'Russian', pl: 'Polish', cs: 'Czech', sk: 'Slovak', uk: 'Ukrainian', bg: 'Bulgarian', mk: 'Macedonian', sh: 'Serbo-Croatian', sl: 'Slovene', hsb: 'Upper Sorbian', cu: 'Old Church Slavonic', sla: 'Slavic', zls: 'South Slavic', lt: 'Lithuanian', lv: 'Latvian', prg: 'Old Prussian', hu: 'Hungarian', eu: 'Basque', hy: 'Armenian', xcl: 'Old Armenian', xil: 'Illyrian', rup: 'Aromanian', cy: 'Welsh', ga: 'Irish', sga: 'Old Irish', cel: 'Celtic', gem: 'Germanic', mul: 'Translingual',
  // the Americas
  nci: 'Classical Nahuatl', nah: 'Nahuatl', qu: 'Quechua', arn: 'Mapuche',
};

/** The name of one code ("la" → "Latin"), or undefined for a code that is not known. A pair like "gl,pt" gives "Galician and Portuguese" when both are known. */
export function languageNameOf(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const direct = LANGUAGE_NAMES[code];
  if (direct) return direct;
  if (code.includes(',')) {
    const names = code.split(',').map((c) => LANGUAGE_NAMES[c.trim()]);
    if (names.length > 1 && names.every(Boolean)) return names.join(' and ');
  }
  return undefined;
}
