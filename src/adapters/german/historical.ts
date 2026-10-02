/**
 * Older German spelling related to today's (daß → dass, thun → tun, Thal → Tal). The text is NEVER changed: this module
 * only says what today's spelling of a written form is, so that the adapter can give the modern lemma, tag the word
 * `de-1901` or `de-pre1901` and keep the written form on the page.
 *
 * Two periods.
 *   de-1901      the spelling of 1901–1996 (the Luther Bible of 1912, Kafka, most twentieth-century print): ß after a
 *                short vowel where today ss is written (daß, muß, Fluß), and the words the reform of 1996 changed
 *                (rauh → rau, Stengel → Stängel, numerieren → nummerieren, Schiffahrt → Schifffahrt). Forms of this
 *                kind also stand in texts older than 1901, which wrote daß and muß too.
 *   de-pre1901   the spelling before the orthographic conference of 1901 (Goethe, Schiller and Grimm in their original
 *                spelling, most nineteenth-century print): th for t in native words (thun, Thal, Muth), c for k or z in
 *                loanwords (Cultur, Concert), -iren for -ieren, ey for ei, dt for t (todt), -niß for -nis, giebt and
 *                gieng, hieng, fieng, aa / ee / oo before r (Waare, Heerd), Ae / Oe / Ue for Ä / Ö / Ü at the start of
 *                a word, and single words (Hülfe, ächt, Aeltern).
 *
 * Two layers, best first. (1) A LISTED pair: an exact word whose modern spelling is certain, confidence 0.9; nothing
 * else is asked. (2) A PATTERN result: a pattern is tried only when the written form is itself no modern word, and its
 * result counts only when the caller's `isModernWord` says the candidate is a word: 0.7 for one pattern, 0.5 for two
 * patterns combined. A written form that is a modern word is never related (Maße stays Maße; Fuß, groß, Straße, heißen,
 * Thron, Theater stay). Spelling is not vocabulary: ward for wurde, Weib, Odem are archaic WORDS and are not related.
 *
 * Capitalisation: a written form is lower case, Capitalised or ALL CAPS (anything else, or a form with a non-letter in
 * it, is left alone); the modern spelling comes back in the same capitalisation. A Capitalised form may be a sentence
 * start, so for such a form the word test also accepts the lower-case spelling. A lower-case written form meets only
 * the listed words that are written in lower case (a lower-case "hülfe" is the subjunctive of helfen, not Hilfe).
 *
 * Only spelling facts that are certain are listed; machine-drafted, not reviewed by a native speaker.
 */

export interface DeSpellingRelation { modern: string; period: 'de-1901' | 'de-pre1901'; confidence: number; rule: string }

type Period = DeSpellingRelation['period'];
type CaseKind = 'lower' | 'cap' | 'upper';

// ----------------------------------------------------------------------------------------------------------------
// Listed pairs
// ----------------------------------------------------------------------------------------------------------------

interface Group { period: Period; rule: string; pairs: ReadonlyArray<readonly [string, string]> }

/** Written as the older text writes them, with the capital letter a noun has. */
export const LISTED_GROUPS: readonly Group[] = [
  {
    period: 'de-1901',
    rule: 'ß after a short vowel is written ss since 1996',
    pairs: [
      ['daß', 'dass'], ['muß', 'muss'], ['mußte', 'musste'], ['mußten', 'mussten'], ['müßte', 'müsste'], ['müßten', 'müssten'],
      ['müßt', 'müsst'], ['läßt', 'lässt'], ['ißt', 'isst'], ['frißt', 'frisst'], ['vergißt', 'vergisst'], ['mißt', 'misst'],
      ['wußte', 'wusste'], ['wußten', 'wussten'], ['wüßte', 'wüsste'], ['gewußt', 'gewusst'], ['gewiß', 'gewiss'],
      ['bißchen', 'bisschen'], ['naß', 'nass'], ['blaß', 'blass'],
      ['Kuß', 'Kuss'], ['Fluß', 'Fluss'], ['Schloß', 'Schloss'], ['Prozeß', 'Prozess'], ['Haß', 'Hass'], ['Faß', 'Fass'],
      ['Genuß', 'Genuss'], ['Schluß', 'Schluss'], ['Schuß', 'Schuss'], ['Einfluß', 'Einfluss'], ['Abschluß', 'Abschluss'],
      ['Anschluß', 'Anschluss'], ['Beschluß', 'Beschluss'], ['Entschluß', 'Entschluss'], ['Ausschuß', 'Ausschuss'],
      ['Nuß', 'Nuss'], ['Paß', 'Pass'], ['Roß', 'Ross'], ['Kompaß', 'Kompass'], ['Verdruß', 'Verdruss'], ['Erlaß', 'Erlass'],
      ['Biß', 'Biss'], ['Riß', 'Riss'], ['Geschoß', 'Geschoss'], ['Sproß', 'Spross'], ['Eßzimmer', 'Esszimmer'],
    ],
  },
  {
    period: 'de-1901',
    rule: 'three equal consonants in a row are all written since 1996',
    pairs: [['Schiffahrt', 'Schifffahrt'], ['Brennessel', 'Brennnessel'], ['Bettuch', 'Betttuch'], ['Stilleben', 'Stillleben']],
  },
  {
    period: 'de-1901',
    rule: 'a word whose spelling the reform of 1996 changed',
    pairs: [
      ['rauh', 'rau'], ['rauhe', 'raue'], ['rauher', 'rauer'], ['Rauhfaser', 'Raufaser'], ['Stengel', 'Stängel'],
      ['numerieren', 'nummerieren'], ['numeriert', 'nummeriert'], ['plazieren', 'platzieren'], ['plaziert', 'platziert'],
      ['Gemse', 'Gämse'], ['behende', 'behände'], ['Quentchen', 'Quäntchen'], ['überschwenglich', 'überschwänglich'],
      ['Bendel', 'Bändel'], ['belemmert', 'belämmert'], ['Tolpatsch', 'Tollpatsch'], ['Känguruh', 'Känguru'], ['Roheit', 'Rohheit'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'th for t in a native word, written t since 1901',
    pairs: [
      ['thun', 'tun'], ['thut', 'tut'], ['that', 'tat'], ['thaten', 'taten'], ['gethan', 'getan'], ['thue', 'tue'], ['thust', 'tust'],
      ['Thal', 'Tal'], ['Thäler', 'Täler'], ['Theil', 'Teil'], ['Theile', 'Teile'], ['theilen', 'teilen'], ['vertheilen', 'verteilen'],
      ['Thier', 'Tier'], ['Thiere', 'Tiere'], ['Thür', 'Tür'], ['Thüre', 'Türe'], ['Thräne', 'Träne'], ['Thränen', 'Tränen'],
      ['Rath', 'Rat'], ['Muth', 'Mut'], ['Noth', 'Not'], ['roth', 'rot'], ['Werth', 'Wert'], ['Wirth', 'Wirt'], ['Athem', 'Atem'],
      ['Thurm', 'Turm'], ['Thürme', 'Türme'], ['Thee', 'Tee'], ['Thau', 'Tau'], ['Thaler', 'Taler'], ['Thatsache', 'Tatsache'],
      ['Armuth', 'Armut'], ['Heimath', 'Heimat'], ['Gemüth', 'Gemüt'], ['Blüthe', 'Blüte'], ['Gluth', 'Glut'], ['Fluth', 'Flut'],
      ['Wuth', 'Wut'], ['thätig', 'tätig'], ['Thätigkeit', 'Tätigkeit'], ['Eigenthum', 'Eigentum'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'c for k or z in a loanword, written k or z since 1901',
    pairs: [
      ['Cultur', 'Kultur'], ['Capitel', 'Kapitel'], ['Classe', 'Klasse'], ['Centrum', 'Zentrum'], ['Concert', 'Konzert'],
      ['Cabinet', 'Kabinett'], ['Cigarre', 'Zigarre'], ['Medicin', 'Medizin'], ['Officier', 'Offizier'], ['Cavalier', 'Kavalier'],
      ['Doctor', 'Doktor'], ['Accent', 'Akzent'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: '-ir- for -ier- in a verb of foreign origin, written -ier- since 1901',
    pairs: [
      ['studiren', 'studieren'], ['regirt', 'regiert'], ['regiren', 'regieren'], ['probiren', 'probieren'],
      ['marschiren', 'marschieren'], ['existiren', 'existieren'], ['spaziren', 'spazieren'], ['studirt', 'studiert'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'ey for ei, written ei since 1901',
    pairs: [
      ['seyn', 'sein'], ['sey', 'sei'], ['seyd', 'seid'], ['bey', 'bei'], ['frey', 'frei'], ['zwey', 'zwei'], ['drey', 'drei'],
      ['Freyheit', 'Freiheit'], ['Arzney', 'Arznei'], ['Meynung', 'Meinung'], ['Beyspiel', 'Beispiel'], ['Ey', 'Ei'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'dt for t, written t since 1901',
    pairs: [['todt', 'tot'], ['Todt', 'Tod'], ['tödten', 'töten'], ['Tödtung', 'Tötung']],
  },
  {
    period: 'de-pre1901',
    rule: '-niß for -nis, written -nis since 1901',
    pairs: [
      ['Zeugniß', 'Zeugnis'], ['Gleichniß', 'Gleichnis'], ['Finsterniß', 'Finsternis'], ['Geheimniß', 'Geheimnis'],
      ['Hinderniß', 'Hindernis'], ['Gedächtniß', 'Gedächtnis'], ['Bedürfniß', 'Bedürfnis'], ['Verhältniß', 'Verhältnis'],
      ['Verständniß', 'Verständnis'], ['Ergebniß', 'Ergebnis'], ['Ereigniß', 'Ereignis'], ['Erlebniß', 'Erlebnis'],
      ['Bekenntniß', 'Bekenntnis'], ['Gefängniß', 'Gefängnis'], ['Begräbniß', 'Begräbnis'], ['Wildniß', 'Wildnis'],
      ['Bündniß', 'Bündnis'], ['Erkenntniß', 'Erkenntnis'], ['Kenntniß', 'Kenntnis'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'a doubled vowel before r (Waare, Heerd) is written with a single vowel since 1901',
    pairs: [
      ['Waare', 'Ware'], ['Waaren', 'Waren'], ['Schaar', 'Schar'], ['Schaaren', 'Scharen'], ['Heerd', 'Herd'],
      ['Heerde', 'Herde'], ['Heerden', 'Herden'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'giebt, gieng, fieng, hieng are written gibt, ging, fing, hing since 1901',
    pairs: [
      ['giebt', 'gibt'], ['giebst', 'gibst'], ['gieb', 'gib'], ['ergiebt', 'ergibt'], ['vergiebt', 'vergibt'],
      ['gieng', 'ging'], ['giengen', 'gingen'], ['fieng', 'fing'], ['fiengen', 'fingen'], ['hieng', 'hing'], ['hiengen', 'hingen'],
      ['empfieng', 'empfing'], ['anfieng', 'anfing'],
    ],
  },
  {
    period: 'de-pre1901',
    rule: 'an older spelling of this word, written otherwise since 1901',
    pairs: [
      ['Hülfe', 'Hilfe'], ['hülflos', 'hilflos'], ['hülfreich', 'hilfreich'], ['Hülfsmittel', 'Hilfsmittel'], ['ächt', 'echt'],
      ['Aeltern', 'Eltern'], ['Gränze', 'Grenze'], ['Gränzen', 'Grenzen'], ['Wittwe', 'Witwe'], ['Maaß', 'Maß'],
      ['Aerzte', 'Ärzte'], ['Oel', 'Öl'], ['Uebel', 'Übel'], ['Ueber', 'Über'], ['Oesterreich', 'Österreich'],
    ],
  },
];

/**
 * One listed pair, found by the lower-case old spelling. `capEntry`: the old word is written with a capital (a noun),
 * so only a capitalised written form meets it: a lower-case "hülfe" is the subjunctive of helfen, not the noun Hilfe.
 */
interface Listed { modern: string; capEntry: boolean; period: Period; rule: string }

const LISTED = new Map<string, Listed[]>();
for (const g of LISTED_GROUPS) {
  for (const [old, modern] of g.pairs) {
    const key = old.toLowerCase();
    const list = LISTED.get(key) ?? [];
    list.push({ modern, capEntry: old[0] !== old[0].toLowerCase(), period: g.period, rule: g.rule });
    LISTED.set(key, list);
  }
}

/** Number of listed pairs per period (for tests and reports). */
export const LISTED_COUNT: Readonly<Record<Period, number>> = {
  'de-1901': LISTED_GROUPS.filter((g) => g.period === 'de-1901').reduce((n, g) => n + g.pairs.length, 0),
  'de-pre1901': LISTED_GROUPS.filter((g) => g.period === 'de-pre1901').reduce((n, g) => n + g.pairs.length, 0),
};

// ----------------------------------------------------------------------------------------------------------------
// Patterns
// ----------------------------------------------------------------------------------------------------------------

interface Edit { index: number; length: number; repl: string }
interface Pattern { id: string; period: Period; rule: string; edits(s: string, cap: CaseKind): Edit[] }

/**
 * Greek and other loan words that keep th today. The th inside them is never rewritten, whatever the word test says:
 * Thron, Theater, Thema, Theologie, Apotheke, Bibliothek, Mathematik, Methode, Ethik, Rhythmus, Katholik …
 */
const TH_ANY: readonly string[] = [
  'thron', 'theat', 'theol', 'theor', 'therap', 'therm', 'thym', 'thek', 'mathem', 'method', 'kathol', 'kathed', 'ethik', 'ethisch',
  'ästhet', 'asthma', 'athlet', 'athen', 'authent', 'arithm', 'orthograph', 'orthodox', 'sympath', 'antipath', 'empath', 'pathos',
  'patholog', 'pathet', 'mythos', 'mythisch', 'mythus', 'rhythm', 'lithograph', 'lithium', 'synthes', 'synthet', 'hypothes',
  'hypothek', 'zither', 'goethe', 'luther', 'lothar', 'thüring', 'mathild', 'mathias',
];
const TH_START: readonly string[] = ['them', 'these', 'thesis', 'thesau', 'thomas'];

function thProtected(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const stem of TH_ANY) for (let i = s.indexOf(stem); i >= 0; i = s.indexOf(stem, i + 1)) out.push([i, i + stem.length]);
  for (const stem of TH_START) if (s.startsWith(stem)) out.push([0, stem.length]);
  return out;
}

const EY_NAMES: readonly string[] = ['meyer', 'geyer', 'beyer', 'heyne', 'heyse', 'eyck'];

const matches = (s: string, re: RegExp): RegExpMatchArray[] => [...s.matchAll(re)];

const PATTERNS: readonly Pattern[] = [
  { id: 'ss', period: 'de-1901', rule: 'ß after a short vowel is written ss since 1996',
    edits: (s) => matches(s, /ß/g).map((m) => ({ index: m.index!, length: 1, repl: 'ss' })) },
  { id: 'triple', period: 'de-1901', rule: 'three equal consonants in a row are all written since 1996 (Schifffahrt)',
    edits: (s) => matches(s, /([bdfgklmnprstz])\1(?=[a-zäöü])/g).map((m) => ({ index: m.index! + 2, length: 0, repl: m[1] })) },
  { id: 'th', period: 'de-pre1901', rule: 'th for t in a native word, written t since 1901',
    edits: (s) => {
      const prot = thProtected(s);
      return matches(s, /th/g)
        .filter((m) => !prot.some(([a, b]) => m.index! < b && m.index! + 2 > a))
        .map((m) => ({ index: m.index!, length: 2, repl: 't' }));
    } },
  { id: 'c', period: 'de-pre1901', rule: 'c for k or z in a loanword, written k or z since 1901',
    edits: (s) => matches(s, /c(?![hk])/g)
      .filter((m) => m.index === 0 || s[m.index! - 1] !== 's')
      .map((m) => ({ index: m.index!, length: 1, repl: /[eiyäöé]/.test(s[m.index! + 1] ?? '') ? 'z' : 'k' })) },
  { id: 'ir', period: 'de-pre1901', rule: '-ir- for -ier- in a verb of foreign origin, written -ier- since 1901',
    edits: (s) => matches(s, /(?<=.)ir(?=(?:en|t|te|ten|st|e|et|end|ung|ungen)$)/g).map((m) => ({ index: m.index!, length: 2, repl: 'ier' })) },
  { id: 'ey', period: 'de-pre1901', rule: 'ey for ei, written ei since 1901',
    edits: (s) => (EY_NAMES.some((n) => s.startsWith(n)) ? [] : matches(s, /ey/g).map((m) => ({ index: m.index!, length: 2, repl: 'ei' }))) },
  { id: 'dt', period: 'de-pre1901', rule: 'dt for t, written t since 1901',
    edits: (s) => matches(s, /dt/g).map((m) => ({ index: m.index!, length: 2, repl: 't' })) },
  { id: 'niss', period: 'de-pre1901', rule: '-niß for -nis, written -nis since 1901',
    edits: (s) => matches(s, /niß$/g).map((m) => ({ index: m.index!, length: 3, repl: 'nis' })) },
  { id: 'double', period: 'de-pre1901', rule: 'a doubled vowel before r (Waare, Heerd) is written with a single vowel since 1901',
    edits: (s) => matches(s, /(aa|ee|oo)(?=r)/g).map((m) => ({ index: m.index!, length: 2, repl: m[1][0] })) },
  { id: 'gieng', period: 'de-pre1901', rule: 'gieng, fieng, hieng are written ging, fing, hing since 1901',
    edits: (s) => matches(s, /(?<=[fgh])ieng(?=(?:en|st|t|e)?$)/g).map((m) => ({ index: m.index!, length: 4, repl: 'ing' })) },
  { id: 'giebt', period: 'de-pre1901', rule: 'giebt is written gibt since 1901',
    edits: (s) => matches(s, /gieb(?=(?:st|t)?$)/g).map((m) => ({ index: m.index!, length: 4, repl: 'gib' })) },
  { id: 'umlaut', period: 'de-pre1901', rule: 'Ae, Oe, Ue at the start of a word for Ä, Ö, Ü',
    edits: (s, cap) => {
      if (cap === 'lower') return [];
      const m = /^(ae|oe|ue)/.exec(s);
      return m ? [{ index: 0, length: 2, repl: ({ ae: 'ä', oe: 'ö', ue: 'ü' } as Record<string, string>)[m[1]] }] : [];
    } },
];

/** Every string the edits can give: all applied together, and (a few edits) each one alone. */
function variants(s: string, edits: Edit[]): string[] {
  if (!edits.length) return [];
  const apply = (es: Edit[]): string => {
    let out = '';
    let last = 0;
    for (const e of es) { out += s.slice(last, e.index) + e.repl; last = e.index + e.length; }
    return out + s.slice(last);
  };
  const out = new Set<string>([apply(edits)]);
  if (edits.length > 1 && edits.length <= 4) for (const e of edits) out.add(apply([e]));
  out.delete(s);
  return [...out];
}

// ----------------------------------------------------------------------------------------------------------------
// Capitalisation
// ----------------------------------------------------------------------------------------------------------------

function caseOf(form: string): CaseKind | null {
  if (form === form.toLowerCase()) return 'lower';
  if (form === form.toUpperCase()) return form.length > 1 ? 'upper' : 'cap';
  const first = form[0];
  if (first !== first.toLowerCase() && form.slice(1) === form.slice(1).toLowerCase()) return 'cap';
  return null;
}

const capitalise = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function withCase(lower: string, cap: CaseKind): string {
  return cap === 'lower' ? lower : cap === 'cap' ? capitalise(lower) : lower.toUpperCase();
}

/** Is `lower`, in the capitalisation of the written form, a modern word? A sentence start may hide a lower-case word. */
function isWordAs(lower: string, cap: CaseKind, isModernWord: (form: string) => boolean): boolean {
  if (cap === 'lower') return isModernWord(lower);
  const c = capitalise(lower);
  return isModernWord(c) || isModernWord(lower) || (cap === 'upper' && isModernWord(lower.toUpperCase()));
}

// ----------------------------------------------------------------------------------------------------------------
// The function
// ----------------------------------------------------------------------------------------------------------------

/**
 * The modern spellings an older written form may stand for, best first (at most three); empty for a form that is
 * modern spelling. `isModernWord` says whether a candidate modern spelling is a known word (lexicon, or a
 * dictionary-backed test).
 */
export function historicalGerman(form: string, isModernWord: (form: string) => boolean): DeSpellingRelation[] {
  const written = form.normalize('NFC');
  if (!/^\p{L}+$/u.test(written)) return [];
  const cap = caseOf(written);
  if (!cap) return [];
  const lower = written.toLowerCase();
  if (isWordAs(lower, cap, isModernWord)) return [];

  const out: DeSpellingRelation[] = [];
  const have = new Set<string>();
  const push = (r: DeSpellingRelation) => { if (!have.has(r.modern)) { have.add(r.modern); out.push(r); } };

  // 1. listed pairs: an entry written with a capital is a noun and needs a capital; a written lower-case form meets only
  //    the lower-case entries. A form with a capital meets the matching (capital) entries first.
  const entries = LISTED.get(lower) ?? [];
  const usable = entries.filter((e) => (cap === 'lower' ? !e.capEntry : true));
  const ordered = [...usable.filter((e) => e.capEntry), ...usable.filter((e) => !e.capEntry)];
  for (const e of ordered) {
    push({ modern: cap === 'upper' ? e.modern.toUpperCase() : cap === 'cap' ? capitalise(e.modern) : e.modern, period: e.period, confidence: 0.9, rule: e.rule });
  }

  // 2. patterns: one, then two of different kinds; the result must be a modern word
  interface Node { s: string; used: Pattern[] }
  const level1 = new Map<string, Node>();
  for (const p of PATTERNS) for (const v of variants(lower, p.edits(lower, cap))) if (!level1.has(v)) level1.set(v, { s: v, used: [p] });
  const found = new Map<string, Node>();
  for (const n of level1.values()) if (isWordAs(n.s, cap, isModernWord)) found.set(n.s, n);
  for (const n of level1.values()) {
    for (const p of PATTERNS) {
      if (n.used.includes(p)) continue;
      for (const v of variants(n.s, p.edits(n.s, cap))) {
        if (v === lower || found.has(v) || level1.has(v)) continue;
        if (isWordAs(v, cap, isModernWord)) found.set(v, { s: v, used: [...n.used, p] });
      }
    }
  }
  const byCount = [...found.values()].sort((a, b) => a.used.length - b.used.length);
  for (const n of byCount) {
    push({
      modern: withCase(n.s, cap),
      period: n.used.some((p) => p.period === 'de-pre1901') ? 'de-pre1901' : 'de-1901',
      confidence: n.used.length === 1 ? 0.7 : 0.5,
      rule: n.used.map((p) => p.rule).join('; '),
    });
  }
  return out.slice(0, 3);
}
