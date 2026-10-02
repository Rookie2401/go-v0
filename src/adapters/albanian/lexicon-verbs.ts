/**
 * Standard Albanian verbs of the word list, with their principal parts. Package Q2.
 *
 * MACHINE-DRAFTED: this list and the rules in morph-verb.ts were written by a language model and have not been checked
 * by a native speaker. Only verbs whose first person singular present, aorist and participle were known with confidence
 * are here; a verb that was not sure is left out (see the package report). Standard Albanian only: no Gheg forms.
 *
 * Reading the entries: `V(lemma, cls, aorist, participle, gloss, extra)`. The lemma is the first person singular present
 * active (punoj, hap, marr, jam). `aorist` is the first person singular aorist; `aorist3` the third person singular
 * when it does not follow from it. `pres23` is the second / third person singular present when the stem changes. A verb
 * with `nonActive: 'only'` is listed under its non-active first person singular present (pendohem); its `aorist` is then
 * the ACTIVE-looking first person singular that follows "u" (u pendova), and only the special non-active third person
 * singular (u pendua) is produced as a form. `forms` carry what the rules do not reach ("form: tags").
 */
import type { SqLexeme } from './types';
import { V } from './types';

type Extra = NonNullable<Parameters<typeof V>[5]>;

/** A regular verb in -oj: aorist -ova, participle -uar (punoj, punova, punuar). */
const oj = (lemma: string, gloss: string, extra: Extra = {}): SqLexeme => {
  const base = lemma.slice(0, -2);
  return V(lemma, 'oj', `${base}ova`, `${base}uar`, gloss, extra);
};

/** The six persons' forms with one set of tags, for the irregular verbs: six('pres ind', 'jam', 'je', ...). */
const PERSON = ['1 sg', '2 sg', '3 sg', '1 pl', '2 pl', '3 pl'];
const six = (tags: string, ...forms: string[]): string[] => forms.map((f, i) => `${f}: ${PERSON[i]} ${tags}`);

// ───────────────────────────── the irregular verbs (everything from `forms`) ─────────────────────────────

const IRREGULAR: SqLexeme[] = [
  V('jam', 'irr', undefined, 'qenë', 'to be', {
    forms: [
      ...six('pres ind', 'jam', 'je', 'është', 'jemi', 'jeni', 'janë'),
      ...six('pres subj', 'jem', 'jesh', 'jetë', 'jemi', 'jeni', 'jenë'),
      ...six('impf ind', 'isha', 'ishe', 'ishte', 'ishim', 'ishit', 'ishin'),
      ...six('aor ind', 'qeshë', 'qe', 'qe', 'qemë', 'qetë', 'qenë'),
      'ji: 2 sg imper', 'jini: 2 pl imper',
      ...six('opt', 'qofsha', 'qofsh', 'qoftë', 'qofshim', 'qofshi', 'qofshin'),
      ...six('pres adm', 'qenkam', 'qenke', 'qenka', 'qenkemi', 'qenkeni', 'qenkan'),
    ],
  }),
  V('kam', 'irr', undefined, 'pasur', 'to have', {
    forms: [
      ...six('pres ind', 'kam', 'ke', 'ka', 'kemi', 'keni', 'kanë'),
      ...six('pres subj', 'kem', 'kesh', 'ketë', 'kemi', 'keni', 'kenë'),
      ...six('impf ind', 'kisha', 'kishe', 'kishte', 'kishim', 'kishit', 'kishin'),
      ...six('aor ind', 'pata', 'pate', 'pati', 'patëm', 'patët', 'patën'),
      'ki: 2 sg imper', 'kini: 2 pl imper',
      ...six('opt', 'pasha', 'paç', 'pastë', 'pashim', 'pashi', 'pashin'),
      ...six('pres adm', 'paskam', 'paske', 'paska', 'paskemi', 'paskeni', 'paskan'),
    ],
  }),
  V('dua', 'irr', undefined, 'dashur', 'to want, to love', {
    nonActive: true,
    forms: [
      ...six('pres ind', 'dua', 'do', 'do', 'duam', 'doni', 'duan'),
      ...six('pres subj', 'dua', 'duash', 'dashë', 'duam', 'doni', 'duan'),
      ...six('impf ind', 'doja', 'doje', 'donte', 'donim', 'donit', 'donin'),
      ...six('aor ind', 'desha', 'deshe', 'deshi', 'deshëm', 'deshët', 'deshën'),
      'duhem: 1 sg pres ind mid', // the non-active (duhet = it is needed) follows from this stem
    ],
  }),
  V('them', 'irr', undefined, 'thënë', 'to say', {
    nonActive: true,
    forms: [
      ...six('pres ind', 'them', 'thua', 'thotë', 'themi', 'thoni', 'thonë'),
      ...six('pres subj', 'them', 'thuash', 'thotë', 'themi', 'thoni', 'thonë'),
      ...six('impf ind', 'thosha', 'thoshe', 'thoshte', 'thoshim', 'thoshit', 'thoshin'),
      ...six('aor ind', 'thashë', 'the', 'tha', 'thamë', 'thatë', 'thanë'),
      'thuaj: 2 sg imper', 'thoni: 2 pl imper',
      'thuhem: 1 sg pres ind mid',
    ],
  }),
  V('vij', 'irr', undefined, 'ardhur', 'to come', {
    forms: [
      ...six('pres ind', 'vij', 'vjen', 'vjen', 'vijmë', 'vini', 'vijnë'),
      ...six('pres subj', 'vij', 'vish', 'vijë', 'vijmë', 'vini', 'vijnë'),
      ...six('impf ind', 'vija', 'vije', 'vinte', 'vinim', 'vinit', 'vinin'),
      ...six('aor ind', 'erdha', 'erdhe', 'erdhi', 'erdhëm', 'erdhët', 'erdhën'),
      'eja: 2 sg imper', 'ejani: 2 pl imper',
    ],
  }),
  V('bie', 'irr', undefined, 'rënë', 'to fall', {
    forms: [
      ...six('pres ind', 'bie', 'bie', 'bie', 'biem', 'bieni', 'bien'),
      ...six('pres subj', 'bie', 'biesh', 'bjerë', 'biem', 'bieni', 'bien'),
      ...six('impf ind', 'bija', 'bije', 'binte', 'binim', 'binit', 'binin'),
      ...six('aor ind', 'rashë', 're', 'ra', 'ramë', 'ratë', 'ranë'),
    ],
  }),
  V('iki', 'irr', undefined, 'ikur', 'to leave, to flee', {
    forms: [
      ...six('pres ind', 'iki', 'ikën', 'ikën', 'ikim', 'ikni', 'ikin'),
      ...six('pres subj', 'iki', 'ikësh', 'ikë', 'ikim', 'ikni', 'ikin'),
      ...six('impf ind', 'ikja', 'ikje', 'ikte', 'iknim', 'iknit', 'iknin'),
      ...six('aor ind', 'ika', 'ike', 'iku', 'ikëm', 'ikët', 'ikën'),
      'ik: 2 sg imper', 'ikni: 2 pl imper',
    ],
  }),
];

// ───────────────────────────── short vowel stems ─────────────────────────────

const VOWEL: SqLexeme[] = [
  V('ha', 'vowel', 'hëngra', 'ngrënë', 'to eat', { forms: ['ha: 2 sg imper'] }),
  V('pi', 'vowel', 'piva', 'pirë', 'to drink', { aorist3: 'piu', forms: ['pi: 2 sg imper'] }),
  V('fle', 'vowel', 'fjeta', 'fjetur', 'to sleep', { forms: ['fli: 2 sg imper'] }),
  V('di', 'vowel', 'dita', 'ditur', 'to know (a fact)', { forms: ['dije: 2 sg imper', 'dijeni: 2 pl imper'] }),
  V('rri', 'vowel', 'ndenja', 'ndenjur', 'to stay, to sit', { forms: ['rri: 2 sg imper'] }),
  V('lë', 'vowel', 'lashë', 'lënë', 'to leave, to let', { aorist3: 'la' }),
  V('vë', 'vowel', 'vura', 'vënë', 'to put, to place', { forms: ['vumë: 1 pl aor ind', 'vutë: 2 pl aor ind', 'vunë: 3 pl aor ind'] }),
  V('zë', 'vowel', 'zura', 'zënë', 'to catch, to seize', { forms: ['zumë: 1 pl aor ind', 'zutë: 2 pl aor ind', 'zunë: 3 pl aor ind'] }),
  V('ngre', 'vowel', 'ngrita', 'ngritur', 'to raise, to lift', { nonActive: true, forms: ['ngri: 2 sg imper'] }),
];

// ───────────────────────────── consonant stems ─────────────────────────────

const CONS: SqLexeme[] = [
  V('hap', 'cons', 'hapa', 'hapur', 'to open', { nonActive: true }),
  V('mbyll', 'cons', 'mbylla', 'mbyllur', 'to close', { nonActive: true }),
  V('marr', 'cons', 'mora', 'marrë', 'to take, to get', { pres23: 'merr', nonActive: true }),
  V('jap', 'cons', 'dhashë', 'dhënë', 'to give', { pres23: 'jep', aorist3: 'dha', nonActive: true }),
  V('shoh', 'cons', 'pashë', 'parë', 'to see', { pres23: 'sheh', aorist3: 'pa', nonActive: true, forms: ['shihni: 2 pl pres ind', 'shih: 2 sg imper'] }),
  V('dal', 'cons', 'dola', 'dalë', 'to go out', { pres23: 'del', forms: ['dilni: 2 pl pres ind', 'dil: 2 sg imper'] }),
  V('flas', 'cons', 'fola', 'folur', 'to speak', { pres23: 'flet', nonActive: true, forms: ['flisni: 2 pl pres ind', 'fol: 2 sg imper', 'flitem: 1 sg pres ind mid'] }),
  V('sjell', 'cons', 'solla', 'sjellë', 'to bring', { forms: ['sillni: 2 pl pres ind', 'sill: 2 sg imper'] }),
  V('njoh', 'cons', 'njoha', 'njohur', 'to know (a person), to recognise', { pres23: 'njeh', aorist3: 'njohu', nonActive: true, forms: ['njihni: 2 pl pres ind', 'njih: 2 sg imper'] }),
  V('pres', 'cons', 'prita', 'pritur', 'to wait (for)', { pres23: 'pret', forms: ['prisni: 2 pl pres ind', 'prit: 2 sg imper'] }),
  V('pyes', 'cons', 'pyeta', 'pyetur', 'to ask', { pres23: 'pyet', forms: ['pyesni: 2 pl pres ind', 'pyet: 2 sg imper'] }),
  V('vdes', 'cons', 'vdiqa', 'vdekur', 'to die', { aorist3: 'vdiq', forms: ['vdisni: 2 pl pres ind'] }),
  V('hedh', 'cons', 'hodha', 'hedhur', 'to throw', { nonActive: true, forms: ['hidhni: 2 pl pres ind', 'hidh: 2 sg imper'] }),
  V('shes', 'cons', 'shita', 'shitur', 'to sell', { pres23: 'shet', nonActive: true, forms: ['shisni: 2 pl pres ind', 'shit: 2 sg imper', 'shitem: 1 sg pres ind mid'] }),
  V('ndjek', 'cons', 'ndoqa', 'ndjekur', 'to follow, to pursue', { nonActive: true, forms: ['ndiqni: 2 pl pres ind', 'ndiq: 2 sg imper'] }),
  V('mbledh', 'cons', 'mblodha', 'mbledhur', 'to gather', { nonActive: true, forms: ['mblidhni: 2 pl pres ind', 'mblidh: 2 sg imper'] }),
  V('zgjedh', 'cons', 'zgjodha', 'zgjedhur', 'to choose', { forms: ['zgjidhni: 2 pl pres ind', 'zgjidh: 2 sg imper'] }),
  V('vjedh', 'cons', 'vodha', 'vjedhur', 'to steal', { forms: ['vidhni: 2 pl pres ind', 'vidh: 2 sg imper'] }),
  V('heq', 'cons', 'hoqa', 'hequr', 'to remove, to take away', { nonActive: true, forms: ['hiqni: 2 pl pres ind', 'hiq: 2 sg imper'] }),
  V('vras', 'cons', 'vrava', 'vrarë', 'to kill', { pres23: 'vret', aorist3: 'vrau', nonActive: true, forms: ['vrisni: 2 pl pres ind', 'vrit: 2 sg imper', 'vritem: 1 sg pres ind mid'] }),
  V('mbjell', 'cons', 'mbolla', 'mbjellë', 'to sow', { forms: ['mbillni: 2 pl pres ind', 'mbill: 2 sg imper'] }),
  V('vesh', 'cons', 'vesha', 'veshur', 'to dress, to put on', { nonActive: true, forms: ['vishni: 2 pl pres ind', 'vish: 2 sg imper'] }),
  V('shëtis', 'cons', 'shëtita', 'shëtitur', 'to walk, to stroll', { pres23: 'shëtit', forms: ['shëtisni: 2 pl pres ind', 'shëtit: 2 sg imper'] }),
  V('përgatis', 'cons', 'përgatita', 'përgatitur', 'to prepare', { pres23: 'përgatit', forms: ['përgatisni: 2 pl pres ind', 'përgatit: 2 sg imper'] }),
  V('lidh', 'cons', 'lidha', 'lidhur', 'to tie, to connect', { nonActive: true }),
  V('fal', 'cons', 'fala', 'falur', 'to forgive'),
  V('fut', 'cons', 'futa', 'futur', 'to put in, to insert'),
  V('qesh', 'cons', 'qesha', 'qeshur', 'to laugh'),
  V('hip', 'cons', 'hipa', 'hipur', 'to climb, to mount'),
  V('korr', 'cons', 'korra', 'korrur', 'to reap'),
  V('kap', 'cons', 'kapa', 'kapur', 'to catch, to grab'),
  V('rrit', 'cons', 'rrita', 'rritur', 'to raise, to grow (something)'),
  V('ndal', 'cons', 'ndala', 'ndalur', 'to stop (something)'),
  V('puth', 'cons', 'putha', 'puthur', 'to kiss'),
  V('humb', 'cons', 'humba', 'humbur', 'to lose'),
  V('lëviz', 'cons', 'lëviza', 'lëvizur', 'to move'),
  V('prish', 'cons', 'prisha', 'prishur', 'to spoil, to ruin'),
  V('ndez', 'cons', 'ndeza', 'ndezur', 'to light, to switch on'),
  V('vendos', 'cons', 'vendosa', 'vendosur', 'to decide, to place'),
  V('përdor', 'cons', 'përdora', 'përdorur', 'to use', { nonActive: true }),
  V('shpall', 'cons', 'shpalla', 'shpallur', 'to declare, to proclaim'),
  V('hesht', 'cons', 'heshta', 'heshtur', 'to be silent'),
  V('shtyp', 'cons', 'shtypa', 'shtypur', 'to press, to print'),
  V('mbyt', 'cons', 'mbyta', 'mbytur', 'to drown, to choke'),
  V('zhduk', 'cons', 'zhduka', 'zhdukur', 'to make disappear, to destroy'),
  V('porosit', 'cons', 'porosita', 'porositur', 'to order'),
  V('mbështet', 'cons', 'mbështeta', 'mbështetur', 'to support, to lean'),
  V('përmend', 'cons', 'përmenda', 'përmendur', 'to mention'),
  V('përmbush', 'cons', 'përmbusha', 'përmbushur', 'to fulfil'),
];

// ───────────────────────────── verbs in -j that are not plain -oj ─────────────────────────────

const J_VERBS: SqLexeme[] = [
  V('shkruaj', 'oj', 'shkrova', 'shkruar', 'to write', { nonActive: true }),
  V('luaj', 'oj', 'luajta', 'luajtur', 'to play', { nonActive: true }),
  V('ruaj', 'oj', 'ruajta', 'ruajtur', 'to guard, to keep'),
  V('vuaj', 'oj', 'vuajta', 'vuajtur', 'to suffer'),
  V('mbaj', 'oj', 'mbajta', 'mbajtur', 'to hold, to keep', { nonActive: true }),
  V('paguaj', 'oj', 'pagova', 'paguar', 'to pay'),
  V('gatuaj', 'oj', 'gatova', 'gatuar', 'to cook'),
  V('laj', 'oj', 'lava', 'larë', 'to wash', { aorist3: 'lau', nonActive: true }),
  V('blej', 'oj', 'bleva', 'blerë', 'to buy', { aorist3: 'bleu', nonActive: true, forms: ['blihem: 1 sg pres ind mid'] }),
  V('fshij', 'oj', 'fshiva', 'fshirë', 'to wipe, to sweep', { aorist3: 'fshiu', nonActive: true }),
  V('qaj', 'oj', 'qava', 'qarë', 'to cry, to weep', { aorist3: 'qau' }),
  V('ndaj', 'oj', 'ndava', 'ndarë', 'to divide, to share', { aorist3: 'ndau', nonActive: true }),
  V('shpërndaj', 'oj', 'shpërndava', 'shpërndarë', 'to distribute, to scatter', { aorist3: 'shpërndau' }),
  V('bëj', 'oj', 'bëra', 'bërë', 'to do, to make', {
    nonActive: true,
    forms: ['bëmë: 1 pl aor ind', 'bëtë: 2 pl aor ind', 'bënë: 3 pl aor ind', 'bë: 3 sg aor ind mid'],
  }),
  V('gjej', 'oj', 'gjeta', 'gjetur', 'to find', { forms: ['gjej: 2 sg imper'] }),
  V('hyj', 'oj', 'hyra', 'hyrë', 'to enter', { forms: ['hyr: 2 sg imper'] }),
  V('kthej', 'oj', 'ktheva', 'kthyer', 'to return (something), to give back', { aorist3: 'ktheu' }),
  V('pëlqej', 'oj', 'pëlqeva', 'pëlqyer', 'to like, to please', { aorist3: 'pëlqeu' }),
  V('gënjej', 'oj', 'gënjeva', 'gënjyer', 'to lie to, to deceive', { aorist3: 'gënjeu' }),
  V('thyej', 'oj', 'thyeva', 'thyer', 'to break', { aorist3: 'thyeu' }),
  V('përkthej', 'oj', 'përktheva', 'përkthyer', 'to translate', { aorist3: 'përktheu' }),
  V('shërbej', 'oj', 'shërbeva', 'shërbyer', 'to serve', { aorist3: 'shërbeu' }),
  V('rrëfej', 'oj', 'rrëfeva', 'rrëfyer', 'to confess, to tell', { aorist3: 'rrëfeu' }),
  V('arrij', 'oj', 'arrita', 'arritur', 'to arrive, to reach'),
  V('mbërrij', 'oj', 'mbërrita', 'mbërritur', 'to arrive'),
  V('mbroj', 'oj', 'mbrojta', 'mbrojtur', 'to defend, to protect', { nonActive: true }),
  V('nënshkruaj', 'oj', 'nënshkrova', 'nënshkruar', 'to sign'),
];

// ───────────────────────────── non-active only (listed under -hem / -em) ─────────────────────────────

const DEPONENT: SqLexeme[] = [
  V('lutem', 'cons', 'luta', 'lutur', 'to pray', { nonActive: 'only' }),
  V('pendohem', 'cons', 'pendova', 'penduar', 'to repent', { nonActive: 'only' }),
  V('përgjigjem', 'cons', 'përgjigja', 'përgjigjur', 'to answer', { nonActive: 'only' }),
  V('kujdesem', 'cons', 'kujdesa', 'kujdesur', 'to take care', { nonActive: 'only' }),
  V('ulem', 'cons', 'ula', 'ulur', 'to sit down', { nonActive: 'only' }),
  V('kthehem', 'cons', 'ktheva', 'kthyer', 'to come back, to turn round', { nonActive: 'only' }),
  V('bindem', 'cons', 'binda', 'bindur', 'to obey', { nonActive: 'only' }),
  V('përulem', 'cons', 'përula', 'përulur', 'to humble oneself', { nonActive: 'only' }),
  V('ringjallem', 'cons', 'ringjalla', 'ringjallur', 'to rise again', { nonActive: 'only' }),
  V('lindem', 'cons', 'linda', 'lindur', 'to be born', { nonActive: 'only' }),
  V('quhem', 'cons', 'quajta', 'quajtur', 'to be called', { nonActive: 'only' }),
  V('martohem', 'cons', 'martova', 'martuar', 'to marry, to get married', { nonActive: 'only' }),
  V('lodhem', 'cons', 'lodha', 'lodhur', 'to get tired', { nonActive: 'only' }),
  V('gëzohem', 'cons', 'gëzova', 'gëzuar', 'to rejoice, to be glad', { nonActive: 'only' }),
  V('ankohem', 'cons', 'ankova', 'ankuar', 'to complain', { nonActive: 'only' }),
  V('afrohem', 'cons', 'afrova', 'afruar', 'to come near', { nonActive: 'only' }),
  V('largohem', 'cons', 'largova', 'larguar', 'to go away, to withdraw', { nonActive: 'only' }),
  V('pajtohem', 'cons', 'pajtova', 'pajtuar', 'to agree, to be reconciled', { nonActive: 'only' }),
  V('ndodhem', 'cons', 'ndodha', 'ndodhur', 'to be (located); to happen', { nonActive: 'only' }),
  V('gjendem', 'cons', 'gjenda', 'gjendur', 'to be found, to find oneself', { nonActive: 'only' }),
  V('nisem', 'cons', 'nisa', 'nisur', 'to set out', { nonActive: 'only' }),
  V('mbetem', 'cons', 'mbeta', 'mbetur', 'to remain', { nonActive: 'only' }),
  V('dukem', 'cons', 'duka', 'dukur', 'to seem, to appear', { nonActive: 'only' }),
  V('kënaqem', 'cons', 'kënaqa', 'kënaqur', 'to be pleased, to enjoy', { nonActive: 'only' }),
  V('habitem', 'cons', 'habita', 'habitur', 'to be surprised', { nonActive: 'only' }),
  V('shfaqem', 'cons', 'shfaqa', 'shfaqur', 'to appear, to show oneself', { nonActive: 'only' }),
  V('përpiqem', 'cons', 'përpoqa', 'përpjekur', 'to try, to strive', { nonActive: 'only' }),
  V('mundem', 'cons', 'munda', 'mundur', 'to be able, can', { nonActive: 'only' }),
];

// ───────────────────────────── regular verbs in -oj ─────────────────────────────

const REGULAR_OJ: SqLexeme[] = [
  // everyday life
  oj('punoj', 'to work', { nonActive: true }),
  oj('mësoj', 'to learn, to teach'),
  oj('lexoj', 'to read', { nonActive: true }),
  oj('dëgjoj', 'to hear, to listen', { nonActive: true }),
  oj('kuptoj', 'to understand', { nonActive: true }),
  oj('mendoj', 'to think'),
  oj('kujtoj', 'to remember'),
  oj('harroj', 'to forget'),
  oj('filloj', 'to begin'),
  oj('mbaroj', 'to finish'),
  oj('jetoj', 'to live'),
  oj('ndihmoj', 'to help'),
  oj('shkoj', 'to go'),
  oj('kërkoj', 'to look for, to ask for', { nonActive: true }),
  oj('pranoj', 'to accept'),
  oj('shtoj', 'to add'),
  oj('ndryshoj', 'to change'),
  oj('ndërroj', 'to change, to swap'),
  oj('pushoj', 'to rest'),
  oj('shikoj', 'to look at, to watch'),
  oj('pastroj', 'to clean'),
  oj('notoj', 'to swim'),
  oj('këndoj', 'to sing'),
  oj('shpresoj', 'to hope'),
  oj('dëshiroj', 'to wish, to desire'),
  oj('telefonoj', 'to telephone'),
  oj('shpjegoj', 'to explain'),
  oj('ndërtoj', 'to build', { nonActive: true }),
  oj('organizoj', 'to organise', { nonActive: true }),
  oj('dërgoj', 'to send', { nonActive: true }),
  oj('çoj', 'to take, to send'),
  oj('tregoj', 'to show, to tell'),
  oj('bisedoj', 'to talk, to converse'),
  oj('vizitoj', 'to visit'),
  oj('udhëtoj', 'to travel'),
  oj('festoj', 'to celebrate'),
  oj('ftoj', 'to invite'),
  oj('takoj', 'to meet'),
  oj('dashuroj', 'to love'),
  oj('ëndërroj', 'to dream'),
  oj('këshilloj', 'to advise'),
  oj('studioj', 'to study'),
  oj('vizatoj', 'to draw'),
  oj('qëndroj', 'to stay, to stand'),
  oj('mohoj', 'to deny'),
  oj('ofroj', 'to offer'),
  oj('ndaloj', 'to forbid, to stop'),
  oj('lejoj', 'to allow'),
  oj('provoj', 'to try, to test'),
  oj('krijoj', 'to create'),
  oj('zhvilloj', 'to develop'),
  oj('dyshoj', 'to doubt'),
  oj('ngatërroj', 'to confuse, to mix up'),
  oj('rregulloj', 'to arrange, to fix'),
  oj('çmoj', 'to value, to esteem'),
  oj('fitoj', 'to win, to earn'),
  oj('numëroj', 'to count'),
  oj('lëshoj', 'to release, to let go'),
  oj('sulmoj', 'to attack'),
  oj('veproj', 'to act'),
  oj('respektoj', 'to respect'),
  oj('gjykoj', 'to judge'),
  oj('dënoj', 'to punish, to condemn'),
  oj('zbuloj', 'to reveal, to discover'),
  oj('dhuroj', 'to give (as a gift)'),
  oj('zgjoj', 'to wake (someone)', { nonActive: true }),
  oj('rrëzoj', 'to knock down'),
  oj('dëmtoj', 'to damage'),
  oj('plotësoj', 'to complete, to fulfil'),
  oj('shkatërroj', 'to destroy'),
  oj('hartoj', 'to compose, to draw up'),
  oj('përfundoj', 'to conclude, to end'),
  oj('vazhdoj', 'to continue'),
  oj('kontrolloj', 'to check, to control'),
  oj('pohoj', 'to affirm'),
  oj('dorëzoj', 'to hand over'),
  oj('ngushëlloj', 'to comfort'),
  oj('vlerësoj', 'to value, to assess'),
  oj('shqiptoj', 'to pronounce'),
  oj('bashkëpunoj', 'to cooperate'),
  // faith and church
  oj('besoj', 'to believe'),
  oj('shpëtoj', 'to save'),
  oj('adhuroj', 'to worship'),
  oj('bekoj', 'to bless'),
  oj('predikoj', 'to preach'),
  oj('dëshmoj', 'to testify'),
  oj('kryqëzoj', 'to crucify'),
  oj('vrapoj', 'to run'),
  oj('falënderoj', 'to thank'),
  oj('lavdëroj', 'to praise'),
  oj('pagëzoj', 'to baptise'),
  oj('shenjtëroj', 'to make holy, to sanctify'),
  oj('mëkatoj', 'to sin'),
  oj('premtoj', 'to promise'),
  oj('ndëshkoj', 'to punish'),
  oj('bashkoj', 'to unite, to join'),
  oj('tradhtoj', 'to betray'),
  oj('sakrifikoj', 'to sacrifice'),
];

export const SQ_VERBS: SqLexeme[] = [...IRREGULAR, ...VOWEL, ...CONS, ...J_VERBS, ...DEPONENT, ...REGULAR_OJ];
