/**
 * A rule-based respelling and IPA for the REFERENCE realisation of Norwegian, East (Oslo-area) speech. MACHINE-DRAFTED, pending
 * native review. There is no official spoken standard (Språkrådet): East is a reference, never a norm, and speech is never
 * labelled "Bokmål". Output is tagged 'east' and 'machine-draft'.
 *
 * Rules: kj, tj, k before i / y / j → [ç]; sj, skj, sk before i / y / ø → [ʃ]; rs → [ʂ] (rt, rn, rl → retroflex); silent h in
 * hj- and hv-; silent d after n, l, r (land, kald, ord); -ig → -i; o → [u] long, [ɔ] short; u → [ʉ]; y → [y]; å → [o]/[ɔ];
 * a long vowel before a single consonant, a short one before a double consonant or a cluster; the stress is on the first syllable
 * (on the second after the unstressed prefixes be-, for-, er-). Tone (1 or 2) is NOT claimed: it is shown only for a few listed
 * minimal pairs (bønder / bønner), marked unverified.
 */

export type Tone = 1 | 2;

/** A short list of minimal pairs whose tone the author remembers; unverified, never extended by guess. */
export const TONE_PAIRS: Readonly<Record<string, { tone: Tone; unverified: true; pair: string }>> = {
  bønder: { tone: 1, unverified: true, pair: 'bønner' },
  bønner: { tone: 2, unverified: true, pair: 'bønder' },
  stenger: { tone: 1, unverified: true, pair: 'stenger (verb)' },
};

const VOW = 'aeiouyæøå';
const ASCII_VOWELS = new Set([...VOW, 'E', 'Ø', 'A']); // E = ei, Ø = øy, A = au
const SILENT = '·';

interface Ph { ipa: string; resp: string; vowel?: boolean }

const LONG: Record<string, Ph> = {
  a: { ipa: 'ɑː', resp: 'aa', vowel: true }, e: { ipa: 'eː', resp: 'ay', vowel: true }, i: { ipa: 'iː', resp: 'ee', vowel: true },
  o: { ipa: 'uː', resp: 'oo', vowel: true }, u: { ipa: 'ʉː', resp: 'ew', vowel: true }, y: { ipa: 'yː', resp: 'ü', vowel: true },
  å: { ipa: 'oː', resp: 'aw', vowel: true }, ø: { ipa: 'øː', resp: 'ö', vowel: true }, æ: { ipa: 'æː', resp: 'aa', vowel: true },
};
const SHORT: Record<string, Ph> = {
  a: { ipa: 'ɑ', resp: 'ah', vowel: true }, e: { ipa: 'ɛ', resp: 'eh', vowel: true }, i: { ipa: 'ɪ', resp: 'i', vowel: true },
  o: { ipa: 'ɔ', resp: 'o', vowel: true }, u: { ipa: 'ɵ', resp: 'ew', vowel: true }, y: { ipa: 'ʏ', resp: 'ü', vowel: true },
  å: { ipa: 'ɔ', resp: 'o', vowel: true }, ø: { ipa: 'œ', resp: 'ö', vowel: true }, æ: { ipa: 'æ', resp: 'a', vowel: true },
};
const DIPH: Record<string, Ph> = {
  E: { ipa: 'æɪ', resp: 'ay', vowel: true }, Ø: { ipa: 'øʏ', resp: 'öy', vowel: true }, A: { ipa: 'æʉ', resp: 'aew', vowel: true },
};
const CONS: Record<string, Ph> = {
  b: { ipa: 'b', resp: 'b' }, d: { ipa: 'd', resp: 'd' }, f: { ipa: 'f', resp: 'f' }, g: { ipa: 'ɡ', resp: 'g' }, h: { ipa: 'h', resp: 'h' },
  j: { ipa: 'j', resp: 'y' }, k: { ipa: 'k', resp: 'k' }, l: { ipa: 'l', resp: 'l' }, m: { ipa: 'm', resp: 'm' }, n: { ipa: 'n', resp: 'n' },
  p: { ipa: 'p', resp: 'p' }, r: { ipa: 'ɾ', resp: 'r' }, s: { ipa: 's', resp: 's' }, t: { ipa: 't', resp: 't' }, v: { ipa: 'v', resp: 'v' },
  w: { ipa: 'v', resp: 'v' }, x: { ipa: 'ks', resp: 'ks' }, z: { ipa: 's', resp: 's' }, c: { ipa: 'k', resp: 'k' }, q: { ipa: 'k', resp: 'k' },
  ç: { ipa: 'ç', resp: 'ç' }, ʃ: { ipa: 'ʃ', resp: 'sh' }, ʂ: { ipa: 'ʂ', resp: 'sh' }, ŋ: { ipa: 'ŋ', resp: 'ng' },
  ʈ: { ipa: 'ʈ', resp: 't' }, ɳ: { ipa: 'ɳ', resp: 'n' }, ɭ: { ipa: 'ɭ', resp: 'l' },
};

export interface Transcription { ipa: string; respelling: string; notes: string[]; tone?: { tone: Tone; unverified: true } }

/** Letters to sound symbols, before vowel length is decided. Silent letters stay as '·' so that they still count as consonants. */
function prepare(w: string, notes: string[]): string {
  let s = w;
  const note = (n: string): void => { if (!notes.includes(n)) notes.push(n); };
  if (/^hj/.test(s)) { s = s.replace(/^hj/, `${SILENT}j`); note('h is silent in hj-.'); }
  if (/^hv/.test(s)) { s = s.replace(/^hv/, `${SILENT}v`); note('h is silent in hv-.'); }
  s = s.replace(/skj/g, 'ʃ').replace(/sj/g, 'ʃ');
  if (/ʃ/.test(s)) note('sj, skj and sk before i / y / ø are [ʃ] ("sh"); in much speech kj and sj have merged.');
  s = s.replace(/sk(?=[iyø])/g, 'ʃ');
  s = s.replace(/gj/g, `${SILENT}j`).replace(/kj/g, 'ç').replace(/tj/g, 'ç');
  if (/ç/.test(s)) note('kj, tj and k before i / y are [ç], like the ch of German "ich".');
  s = s.replace(/k(?=[iyj])/g, 'ç').replace(/g(?=[iyj])/g, 'j');
  s = s.replace(/rs/g, 'ʂ').replace(/rt/g, 'ʈ').replace(/rn/g, 'ɳ').replace(/rl/g, 'ɭ');
  if (/[ʂʈɳɭ]/.test(s)) note('In East Norwegian rs, rt, rn and rl are retroflex ([ʂ ʈ ɳ ɭ]); the r is not heard separately.');
  s = s.replace(/ng/g, 'ŋ').replace(/nk/g, 'ŋk');
  s = s.replace(/([nlr])d(?=$|e|et|en|ene|er)/g, `$1${SILENT}`);
  if (new RegExp(`${SILENT}`).test(s) && /[nlr]·/.test(s)) note('A d after n, l or r is silent (land, kald, ord).');
  s = s.replace(/ig(?=$|e)/g, 'i·');
  s = s.replace(/ei/g, 'E').replace(/øy/g, 'Ø').replace(/au/g, 'A');
  return s;
}

/** Words that start like a prefixed verb and are not (bedre, beste, erter). */
const NOT_PREFIXED = new Set(['bedre', 'beste', 'berre', 'erter', 'bein', 'berg', 'bear', 'ere', 'beger', 'fortau']);
const UNSTRESSED_PREFIX = /^(be|for|er|mis)(?=[^aeiouyæøå]*[aeiouyæøå])/;


/**
 * Function words whose everyday East Norwegian pronunciation the letter rules cannot derive (machine-draft, awaiting a native
 * speaker): the -eg pronouns say [æɪ], og is a bare vowel, det and de lose their final letter, hv- is [v], ikke has a short i.
 */
const LISTED: Readonly<Record<string, { ipa: string; resp: string }>> = {
  jeg: { ipa: 'ˈjæɪ', resp: 'yai' }, meg: { ipa: 'ˈmæɪ', resp: 'mai' }, deg: { ipa: 'ˈdæɪ', resp: 'dai' }, seg: { ipa: 'ˈsæɪ', resp: 'sai' },
  og: { ipa: 'ˈɔ', resp: 'o' }, det: { ipa: 'ˈdeː', resp: 'deh' }, de: { ipa: 'ˈdiː', resp: 'dee' }, er: { ipa: 'ˈæːr', resp: 'air' },
  hva: { ipa: 'ˈvɑː', resp: 'vaa' }, hvem: { ipa: 'ˈvɛm', resp: 'vem' }, hvor: { ipa: 'ˈvuːr', resp: 'voor' }, hvordan: { ipa: 'ˈvuɖɑn', resp: 'VOOR-dan' }, hvorfor: { ipa: 'ˈvuːrfɔr', resp: 'VOOR-for' },
  ikke: { ipa: 'ˈɪkə', resp: 'IK-keh' }, også: { ipa: 'ˈɔsɔ', resp: 'OS-so' }, du: { ipa: 'ˈdʉː', resp: 'dew' }, nå: { ipa: 'ˈnoː', resp: 'naw' },
};

export function transcribe(word: string): Transcription | undefined {
  const w = word.normalize('NFC').toLocaleLowerCase('nb').replace(/[-'’]/g, '');
  if (!w || !/^[a-zæøåéèêóòô]+$/u.test(w)) return undefined;
  const listed = LISTED[w];
  if (listed) return { ipa: listed.ipa, respelling: listed.resp, notes: ['listed word: its everyday pronunciation does not follow the letter rules'] };
  const notes: string[] = [];
  const ascii = w.replace(/[éèê]/g, 'e').replace(/[óòô]/g, 'o');
  const s = prepare(ascii, notes);
  const chars = [...s];
  // vowel nuclei: each vowel letter (or ei / øy / au) is one
  const isV = (c: string): boolean => ASCII_VOWELS.has(c);
  const nuclei: number[] = [];
  chars.forEach((c, i) => { if (isV(c)) nuclei.push(i); });
  const prefix = UNSTRESSED_PREFIX.exec(ascii);
  const prefixed = !!prefix && nuclei.length >= 2 && ascii.length - prefix[1].length >= 3 && !NOT_PREFIXED.has(ascii);
  const stressIdx = prefixed ? 1 : 0;
  const stressMarkAt = stressIdx === 1 && prefix ? prefix[1].length : 0;
  const phs: Ph[] = [];
  let ipa = '';
  chars.forEach((c, i) => {
    if (i === stressMarkAt && nuclei.length >= 2) ipa += 'ˈ';
    if (i === 0 && nuclei.length === 1) ipa += 'ˈ';
    if (c === SILENT) return;
    if (isV(c)) {
      const k = nuclei.indexOf(i);
      const stressed = k === stressIdx;
      let ph: Ph;
      if ('EØA'.includes(c)) ph = DIPH[c];
      else if (stressed) {
        let after = 0;
        for (let j = i + 1; j < chars.length && !isV(chars[j]); j++) after++;
        ph = after >= 2 ? SHORT[c] : LONG[c];
      } else if (c === 'e' && /^(n|r|l|t|s|ne|rne|ne|ns|rs)?$/.test(chars.slice(i + 1).join(''))) ph = { ipa: 'ə', resp: 'uh', vowel: true };
      else ph = SHORT[c];
      ipa += ph.ipa;
      phs.push(ph);
      return;
    }
    const ph = CONS[c];
    if (!ph) return;
    if (i > 0 && chars[i - 1] === c) return; // a doubled consonant letter is one sound
    ipa += ph.ipa;
    phs.push(ph);
  });
  const respelling = phs.map((p) => p.resp).join('');
  const tone = TONE_PAIRS[w] ? { tone: TONE_PAIRS[w].tone, unverified: true as const } : undefined;
  if (!tone && nuclei.length >= 2) notes.push('Tone (the word accent) is not shown: it must be learned with the word.');
  if (tone) notes.push(`Tone ${tone.tone} (unverified; minimal pair with ${TONE_PAIRS[w].pair}).`);
  return { ipa, respelling, notes, tone };
}

export const PRONUNCIATION_TAGS = ['east', 'machine-draft'] as const;
