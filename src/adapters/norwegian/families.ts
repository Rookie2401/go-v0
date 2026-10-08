/**
 * Concept families: the same meaning in Bokmål and Nynorsk (jeg / eg, ikke / ikkje, uke / veke). MACHINE-DRAFTED, pending native
 * review: the table is recon 1 (B10) plus the nb / nn pairs of the strong-verb table (B4); a cell the author is unsure of is
 * listed in UNVERIFIED_FAMILIES. The words of a family are NEVER merged: each keeps its own lemma, its own language code ('nb' or
 * 'nn') and therefore its own item id; mastery is not transferred between members. A family is information for the word sheet
 * ("Nynorsk: eg") and for GoLearn's "related seen" signal, never credit. `relate()` stays 'none' for jeg / eg.
 *
 * Row format:   bokmål|POS = nynorsk[, nynorsk2] [|POS2] | meaning
 * A word that is spelled the same in both standards needs no row: `familyOf` builds the family of such a word from the two
 * lexicons (hus ↔ hus) when both hold it with the same part of speech.
 */
import type { LanguageCode, PartOfSpeech } from '../../core';
import { lexiconFor } from './lexicon';
import type { NoStandard } from './types';

export interface FamilyMember { lang: LanguageCode; lemma: string; pos?: PartOfSpeech; register?: string[]; note?: string }
export interface Family { id: string; meaning: string; members: FamilyMember[] }

const POS: Record<string, PartOfSpeech> = { N: 'NOUN', V: 'VERB', ADJ: 'ADJ', ADV: 'ADV', PRON: 'PRON', DET: 'DET', ADP: 'ADP', CONJ: 'CONJ', SCONJ: 'SCONJ', AUX: 'AUX', NUM: 'NUM', PART: 'PART' };

const SOURCE = `
// ── pronouns, determiners, wh-words ──
jeg|PRON = eg | I
hun|PRON = ho | she
ham|PRON = honom | him
de|PRON = dei | they
dere|PRON = de | you (plural)
seg|PRON = seg | oneself
man|PRON = ein | one, you (generic)
noen|DET = nokon | some, any
noen|PRON = nokon | someone, anyone
noe|DET = noko | some, any (neuter)
noe|PRON = noko | something
mye|DET = mykje | much, a lot of
mye|ADV = mykje | much, a lot
mer|ADV = meir | more
mer|DET = meir | more
flere|DET = fleire | more (several)
hvem|PRON = kven | who
hva|PRON = kva | what
hvorfor|ADV = kvifor | why
hvordan|ADV = korleis | how
hvor|ADV = kvar, kor | where; how (before an adjective)
hver|DET = kvar | each, every
selv|PRON = sjølv | self
en|DET = ein | a, an (masculine)
hele|DET = heile | the whole
annen|ADJ = annan | other
samme|ADJ = same | same
// ── function words ──
ikke|ADV = ikkje | not
også|ADV = òg, også | also
bare|ADV = berre | only
fra|ADP = frå | from
uten|ADP = utan | without
hos|ADP = hjå | at (someone's place)
mens|SCONJ = medan | while
siden|SCONJ = sidan | since
siden|ADP = sidan | since
hvis|SCONJ = viss, dersom | if
da|SCONJ = då | when (a single past event)
da|ADV = då | then
nå|ADV = no, nå | now
ennå|ADV = enno | yet, still
fremdeles|ADV = framleis | still
sammen|ADV = saman | together
hjem|ADV = heim | (to) home
hjemme|ADV = heime | at home
allerede|ADV = allereie | already
heller|ADV = heller | rather
helt|ADV = heilt | completely
plutselig|ADV = plutseleg | suddenly
sjelden|ADV = sjeldan | seldom
enda|ADV = endå | even; still
fram|ADV = fram | forward
foran|ADP = framfor | in front of
innen|ADP = innan | within
utenfor|ADP = utanfor | outside of
og|CONJ = og | and
tjue|NUM = tjue | twenty
sju|NUM = sju | seven
// ── verbs (the strong-verb table and the common weak verbs) ──
være|AUX = vere, vera | be
ha|AUX = ha, hava | have
bli|AUX = bli, verte | become
gjøre|V = gjere | do; make
komme|V = kome | come
se|V = sjå | see
si|V = seie | say
gi|V = gje, gi | give
høre|V = høyre | hear
spørre|V = spørje | ask
begynne|V = byrje, begynne | begin
tenke|V = tenkje | think
hete|V = heite | be called
spise|V = ete, spise | eat
kjøre|V = køyre | drive
tro|V = tru | believe
bo|V = bu | live; reside
la|V = late | let; allow
holde|V = halde | hold; keep
sitte|V = sitje | sit
ligge|V = liggje | lie; be located
legge|V = leggje | lay; put
sette|V = setje | set; put
synge|V = syngje | sing
svømme|V = symje | swim
skjære|V = skjere | cut
trekke|V = trekkje | pull
velge|V = velje | choose
selge|V = selje | sell
fortelle|V = fortelje | tell
stjele|V = stele | steal
dø|V = døy | die
bære|V = bere | carry
besøke|V = besøkje | visit
åpne|V = opne | open
ønske|V = ønskje | wish
huske|V = hugse | remember
spille|V = spele | play
telle|V = telje | count
kreve|V = krevje | demand
mene|V = meine | think; mean
vite|V = vite | know (a fact)
// ── nouns ──
uke|N = veke | week
måned|N = månad | month
gang|N = gong | time; occasion
barn|N = barn | child
hjerte|N = hjarte | heart
øye|N = auge | eye
øre|N = øyre | ear
hode|N = hovud | head
gutt|N = gut | boy
venn|N = ven | friend
søster|N = syster, søster | sister
kjøkken|N = kjøken | kitchen
melk|N = mjølk | milk
sted|N = stad | place
vei|N = veg | road; way
hjem|N = heim | home
skole|N = skule | school
lærer|N = lærar | teacher
kirke|N = kyrkje | church
kjærlighet|N = kjærleik | love
håp|N = von | hope
bønn|N = bøn | prayer
vindu|N = vindauge | window
bilde|N = bilete | picture
navn|N = namn | name
vann|N = vatn | water
kaffe|N = kaffi | coffee
kjøtt|N = kjøt | meat
frokost|N = frukost | breakfast
oppgave|N = oppgåve | task
sykehus|N = sjukehus | hospital
leilighet|N = leilegheit | flat, apartment
vær|N = vêr | weather
sommer|N = sommar | summer
høst|N = haust | autumn
morgen|N = morgon | morning
penger|N = pengar | money
lønn|N = løn | wage
tilgivelse|N = tilgjeving | forgiveness
frelser|N = frelsar | saviour
sang|N = song | song
verden|N = verd | world
menighet|N = kyrkjelyd | congregation
gudstjeneste|N = gudsteneste | worship service
vitnesbyrd|N = vitnemål | testimony
lege|N = lækjar | doctor
kjæreste|N = kjærast | boyfriend; girlfriend
tall|N = tal | number
drøm|N = draum | dream
hånd|N = hand | hand
oppgave|N = oppgåve | task
// ── adjectives ──
gammel|ADJ = gammal | old
dårlig|ADJ = dårleg | bad
vanskelig|ADJ = vanskeleg | difficult
vanlig|ADJ = vanleg | common; usual
farlig|ADJ = farleg | dangerous
hyggelig|ADJ = hyggeleg | pleasant
tidlig|ADJ = tidleg | early
høy|ADJ = høg | tall; high; loud
lav|ADJ = låg | low
hel|ADJ = heil | whole
egen|ADJ = eigen | own
åpen|ADJ = open | open
rød|ADJ = raud | red
grønn|ADJ = grøn | green
hvit|ADJ = kvit | white
syk|ADJ = sjuk | ill
sulten|ADJ = svolten | hungry
ensom|ADJ = ensam | lonely
spennende|ADJ = spennande | exciting
levende|ADJ = levande | living
kjent|ADJ = kjend | known
født|ADJ = fødd | born
forrige|ADJ = førre | previous
`;

/** Rows the author is unsure of: shown to a reviewer, never hidden. */
export const UNVERIFIED_FAMILIES: readonly string[] = ['søster', 'hånd', 'gang', 'verden', 'menighet', 'vitnesbyrd', 'lege', 'kjæreste', 'hvor', 'også', 'siden', 'foran'];

interface Row { nb: string; nbPos: PartOfSpeech; nn: string[]; meaning: string }

function parse(): Row[] {
  const out: Row[] = [];
  for (const line of SOURCE.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const eq = s.indexOf(' = ');
    const lhs = s.slice(0, eq);
    const rest = s.slice(eq + 3);
    const bar = rest.lastIndexOf(' | ');
    const rhs = rest.slice(0, bar);
    const meaning = rest.slice(bar + 3);
    const [nb, posCode] = lhs.split('|');
    out.push({ nb, nbPos: POS[posCode], nn: rhs.split(',').map((x) => x.trim()), meaning });
  }
  return out;
}

const ROWS = parse();

function lc(s: string): string { return s.normalize('NFC').toLocaleLowerCase('nb'); }

function memberOf(lang: 'nb' | 'nn', lemma: string, pos: PartOfSpeech): FamilyMember {
  const m: FamilyMember = { lang, lemma, pos };
  if (UNVERIFIED_FAMILIES.includes(lemma)) m.note = 'machine-draft, unverified';
  return m;
}

/** The concept family of a lemma of the given standard, or undefined. */
export function familyOf(std: NoStandard, lemma: string, pos?: PartOfSpeech): Family | undefined {
  const key = lc(lemma);
  const rows = ROWS.filter((r) => (std === 'nb' ? lc(r.nb) === key : r.nn.some((n) => lc(n) === key)) && (!pos || r.nbPos === pos));
  if (rows.length) {
    const r = rows[0];
    const members: FamilyMember[] = [memberOf('nb', r.nb, r.nbPos), ...r.nn.map((n) => memberOf('nn', n, r.nbPos))];
    return { id: `no-family:${r.nb}:${r.nbPos}`, meaning: r.meaning, members };
  }
  // the same spelling in both lexicons: hus ↔ hus
  const other = std === 'nb' ? 'nn' : 'nb';
  const mine = lexiconFor(std);
  const theirs = lexiconFor(other);
  const hits = mine.entriesOf(lemma).filter((e) => !pos || e.pos === pos);
  for (const e of hits) {
    if (e.pos === 'PROPN') continue;
    if (theirs.hasLemma(lemma, e.pos)) {
      const nbLemma = lemma;
      return { id: `no-family:${nbLemma}:${e.pos}`, meaning: e.gloss, members: [memberOf('nb', lemma, e.pos), memberOf('nn', lemma, e.pos)] };
    }
  }
  return undefined;
}

export const FAMILY_ROW_COUNT = ROWS.length;
export function familyRows(): ReadonlyArray<{ nb: string; nn: string[]; pos: PartOfSpeech; meaning: string }> {
  return ROWS.map((r) => ({ nb: r.nb, nn: r.nn, pos: r.nbPos, meaning: r.meaning }));
}

/** Nynorsk forms that are not Bokmål, with the Bokmål form to write: derived from the table (single-word, closed-class). */
export function nynorskOnlyForms(): Map<string, { nb: string; pos: PartOfSpeech }> {
  const nb = lexiconFor('nb');
  const out = new Map<string, { nb: string; pos: PartOfSpeech }>();
  for (const r of ROWS) {
    for (const n of r.nn) {
      const k = lc(n);
      if (k === lc(r.nb) || nb.has(k) || out.has(k)) continue;
      out.set(k, { nb: r.nb, pos: r.nbPos });
    }
  }
  return out;
}
