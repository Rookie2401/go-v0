/**
 * The word-list additions of the Albanian ladder plan (data/ladder/sq/PLAN-A1-2-A2.md, section 6.1): 271 words that
 * the units of stages a1-2, a2-1 and a2-2 teach and that the lists in lexicon-{nouns,verbs,modifiers}.ts did not have.
 * A word the list does not know has no reading at all, and every inflected form of it then counts as a separate
 * unknown "lemma" at the ladder gate; with these entries a listed form is read as its lemma.
 *
 * MACHINE-DRAFTED, like the rest of the word list: the forms are the planner's, checked here against English
 * Wiktionary's Albanian entries (data/research/kaikki, read only) where it has the word. No native speaker has looked at
 * them. Where the plan and Wiktionary differ, Wiktionary's form is used and the difference is noted next to the entry
 * (para: def. paraja, not paratë; pjek: aorist poqa; ngas: ngava / ngarë; thërras: thërrita / thërritur).
 *
 * The 22 verbs, the adjectives and the adverbs are here; the closed-class words of the plan (deri, mes, përmes,
 * përgjatë, përveç, mirëpo, siç, pasi, tilla) are in function-minor.ts and function-pronouns.ts. Entries are grouped by
 * the stage of the unit that first uses them; the order inside a group is the plan's.
 *
 * The second half (SQ_BRIDGE_*) is the word list of the b1-bridge, the 25 controlled units after a2-2 (data/ladder/sq/authoring/b1.txt): about 160
 * nouns, adjectives, adverbs, verbs and names that the bridge texts use and the lists above did not have. Same status: machine-drafted from
 * Wiktionary and general knowledge, unreviewed. A form the engine reads badly (t'ju / t'u clusters, vjet, ike) is not listed; the text avoids it.
 * The plan's 262 words stay one array (SQ_LADDER_LEXEMES, pinned by test/adapters/albanian-ladder.test.ts); the bridge's are SQ_BRIDGE_LEXEMES.
 */
import type { SqLexeme } from './types';
import { A, N, V, W } from './types';

/** An adjective that takes the linking article (i aftë). */
const I = (lemma: string, gloss: string, extra: Parameters<typeof A>[3] = {}): SqLexeme => A(lemma, true, gloss, extra);
/** An adjective without the linking article (kombëtar). Feminine and plural forms are stated when they are not the regular -e / -ë / -e. */
const NA = (lemma: string, gloss: string, extra: Parameters<typeof A>[3] = {}): SqLexeme => A(lemma, false, gloss, extra);
const ADV = (lemma: string, gloss: string): SqLexeme => W(lemma, 'ADV', gloss);
/** A proper noun (a name): PN('Agim', 'm', 'Agimi', 'Agim (man's name)'). Names count as known words at the ladder gate. */
const PN = (lemma: string, gender: 'm' | 'f', def: string, gloss: string): SqLexeme => ({ ...N(lemma, gender, def, undefined, gloss), pos: 'PROPN' });

type VExtra = NonNullable<Parameters<typeof V>[5]>;
const PERSON = ['1 sg', '2 sg', '3 sg', '1 pl', '2 pl', '3 pl'];
/** The six aorist forms of a variant stem, as explicit forms: aor6('poqa', 'poqe', 'poqi', 'poqëm', 'poqët', 'poqën'). */
const aor6 = (...f: string[]): string[] => f.map((x, i) => `${x}: ${PERSON[i]} aor ind`);
/** The aorist -a, -e, -i, -ëm, -ët, -ën of a stem. */
const aorA = (stem: string): string[] => aor6(`${stem}a`, `${stem}e`, `${stem}i`, `${stem}ëm`, `${stem}ët`, `${stem}ën`);
/** A regular verb in -oj: aorist -ova, participle -uar. */
const oj = (lemma: string, gloss: string, extra: VExtra = {}): SqLexeme => {
  const base = lemma.slice(0, -2);
  return V(lemma, 'oj', `${base}ova`, `${base}uar`, gloss, extra);
};

const SQ_PLAN_NOUNS: SqLexeme[] = [
  // a1-2
  N('herë', 'f', 'hera', 'herë', 'time, occasion (një herë, dy herë)'),
  N('karrige', 'f', 'karrigia', 'karrige', 'chair', { forms: ['karrigen: acc sg def', 'karriges: gen dat abl sg def', 'karrigeje: gen dat abl sg indef'] }),
  N('dollap', 'm', 'dollapi', 'dollapë', 'cupboard, wardrobe'),
  N('pallto', 'f', 'palltoja', 'pallto', 'coat', { forms: ['palltonë: acc sg def', 'palltosë: gen dat abl sg def', 'palltot: nom acc pl def'] }),
  N('ngjyrë', 'f', 'ngjyra', 'ngjyra', 'colour'),
  N('madhësi', 'f', 'madhësia', 'madhësi', 'size'),
  N('zbritje', 'f', 'zbritja', 'zbritje', 'discount'),
  N('para', 'f', 'paraja', 'para', 'money (plural in use)', { forms: ['paratë: nom acc pl def', 'paranë: acc sg def', 'parasë: gen dat abl sg def'] }),
  N('euro', 'f', 'euroja', 'euro', 'euro', { forms: ['euron: acc sg def', 'eurosë: gen dat abl sg def', 'eurot: nom acc pl def'] }),
  N('kusur', 'm', 'kusuri', undefined, 'change (money)'),
  N('peshk', 'm', 'peshku', 'peshq', 'fish', { forms: ['peshqit: nom acc pl def'] }),
  N('faturë', 'f', 'fatura', 'fatura', 'bill'),
  N('porosi', 'f', 'porosia', 'porosi', 'order (in a restaurant)'),
  N('furgon', 'm', 'furgoni', 'furgonë', 'minibus'),
  N('linjë', 'f', 'linja', 'linja', 'line, bus route'),
  N('ndalesë', 'f', 'ndalesa', 'ndalesa', 'stop'),
  N('vonesë', 'f', 'vonesa', 'vonesa', 'delay'),
  N('kryqëzim', 'm', 'kryqëzimi', 'kryqëzime', 'crossroads'),
  N('kthesë', 'f', 'kthesa', 'kthesa', 'turn, bend'),
  N('stinë', 'f', 'stina', 'stinë', 'season'),
  N('stomak', 'm', 'stomaku', 'stomakë', 'stomach'),
  N('gjoks', 'm', 'gjoksi', 'gjokse', 'chest'),
  N('ilaç', 'm', 'ilaçi', 'ilaçe', 'medicine'),
  N('temperaturë', 'f', 'temperatura', 'temperatura', 'temperature; fever'),
  N('recetë', 'f', 'receta', 'receta', 'prescription; recipe'),
  N('kollë', 'f', 'kolla', undefined, 'cough'),
  N('ftohje', 'f', 'ftohja', 'ftohje', 'cold (illness)'),
  N('gjumë', 'm', 'gjumi', undefined, 'sleep'),
  N('ftesë', 'f', 'ftesa', 'ftesa', 'invitation'),
  N('urim', 'm', 'urimi', 'urime', 'good wish, greeting'),
  N('celular', 'm', 'celulari', 'celularë', 'mobile phone'),
  N('bujk', 'm', 'bujku', 'bujq', 'farmer, peasant', { forms: ['bujqit: nom acc pl def'] }),
  N('përgjigje', 'f', 'përgjigjja', 'përgjigje', 'answer'),
  N('kartolinë', 'f', 'kartolina', 'kartolina', 'postcard'),
  N('zarf', 'm', 'zarfi', 'zarfe', 'envelope'),
  N('shënim', 'm', 'shënimi', 'shënime', 'note'),
  N('ofertë', 'f', 'oferta', 'oferta', 'offer; offering'),
  N('bashkësi', 'f', 'bashkësia', 'bashkësi', 'community, fellowship'),
  N('mbledhje', 'f', 'mbledhja', 'mbledhje', 'meeting, gathering'),
  N('kor', 'm', 'kori', 'kore', 'choir'),
  N('moshë', 'f', 'mosha', 'moshë', 'age'),
  N('fëmijëri', 'f', 'fëmijëria', undefined, 'childhood'),
  N('rini', 'f', 'rinia', undefined, 'youth'),
  N('kos', 'm', 'kosi', undefined, 'yoghurt'),
  N('miell', 'm', 'mielli', undefined, 'flour'),
  N('spinaq', 'm', 'spinaqi', undefined, 'spinach'),
  N('furrë', 'f', 'furra', 'furra', 'oven; bakery'),
  // a2-1
  N('çati', 'f', 'çatia', 'çati', 'roof'),
  N('banor', 'm', 'banori', 'banorë', 'inhabitant'),
  N('bujqësi', 'f', 'bujqësia', undefined, 'agriculture'),
  N('pasuri', 'f', 'pasuria', 'pasuri', 'wealth'),
  N('shumicë', 'f', 'shumica', undefined, 'majority'),
  N('pakicë', 'f', 'pakica', 'pakica', 'minority'),
  N('rrezik', 'm', 'rreziku', 'rreziqe', 'danger, risk'),
  N('bubullimë', 'f', 'bubullima', 'bubullima', 'thunder'),
  N('vetëtimë', 'f', 'vetëtima', 'vetëtima', 'lightning'),
  N('nevojë', 'f', 'nevoja', 'nevoja', 'need'),
  N('sasi', 'f', 'sasia', 'sasi', 'quantity'),
  N('dokument', 'm', 'dokumenti', 'dokumente', 'document'),
  N('formular', 'm', 'formulari', 'formularë', 'form (to fill in)'),
  N('llogari', 'f', 'llogaria', 'llogari', 'account; calculation'),
  N('radhë', 'f', 'radha', 'radha', 'queue; turn'),
  N('email', 'm', 'emaili', 'emaile', 'email'),
  N('internet', 'm', 'interneti', undefined, 'the internet'),
  N('lidhje', 'f', 'lidhja', 'lidhje', 'connection, link'),
  N('njoftim', 'm', 'njoftimi', 'njoftime', 'notice, announcement'),
  N('bashki', 'f', 'bashkia', 'bashki', 'municipality, town hall'),
  N('popullsi', 'f', 'popullsia', 'popullsi', 'population'),
  N('gjeografi', 'f', 'gjeografia', undefined, 'geography'),
  N('shef', 'm', 'shefi', 'shefa', 'boss, chief'),
  N('intervistë', 'f', 'intervista', 'intervista', 'interview'),
  N('qëllim', 'm', 'qëllimi', 'qëllime', 'aim, purpose'),
  N('vizitë', 'f', 'vizita', 'vizita', 'visit; medical appointment'),
  N('pacient', 'm', 'pacienti', 'pacientë', 'patient'),
  N('mjekim', 'm', 'mjekimi', 'mjekime', 'treatment'),
  N('këshillë', 'f', 'këshilla', 'këshilla', 'advice'),
  N('lexim', 'm', 'leximi', undefined, 'reading'),
  N('ushtrim', 'm', 'ushtrimi', 'ushtrime', 'exercise'),
  N('fakultet', 'm', 'fakulteti', 'fakultete', 'faculty (of a university)'),
  N('studim', 'm', 'studimi', 'studime', 'study'),
  N('bregdet', 'm', 'bregdeti', 'bregdete', 'coast'),
  N('monument', 'm', 'monumenti', 'monumente', 'monument'),
  N('kala', 'f', 'kalaja', 'kala', 'castle, fortress', { forms: ['kalatë: nom acc pl def', 'kalanë: acc sg def', 'kalasë: gen dat abl sg def'] }),
  N('kështjellë', 'f', 'kështjella', 'kështjella', 'castle'),
  N('zonë', 'f', 'zona', 'zona', 'zone, area'),
  N('trashëgimi', 'f', 'trashëgimia', undefined, 'heritage'),
  N('periudhë', 'f', 'periudha', 'periudha', 'period'),
  N('rajon', 'm', 'rajoni', 'rajone', 'region'),
  N('mision', 'm', 'misioni', 'misione', 'mission'),
  N('misionar', 'm', 'misionari', 'misionarë', 'missionary'),
  N('vullnetar', 'm', 'vullnetari', 'vullnetarë', 'volunteer'),
  N('rol', 'm', 'roli', 'role', 'role'),
  N('ndjenjë', 'f', 'ndjenja', 'ndjenja', 'feeling'),
  N('vendim', 'm', 'vendimi', 'vendime', 'decision'),
  N('kapitull', 'm', 'kapitulli', 'kapituj', 'chapter'),
  N('varg', 'm', 'vargu', 'vargje', 'verse (of a poem or the Bible)'),
  N('çift', 'm', 'çifti', 'çifte', 'couple, pair'),
  N('Krishtlindje', 'f', 'Krishtlindja', undefined, 'Christmas'),
  N('Pashkë', 'f', 'Pashka', undefined, 'Easter'),
  N('vallë', 'f', 'vallja', 'valle', 'folk dance'),
  N('kufi', 'm', 'kufiri', 'kufij', 'border'),
  N('luginë', 'f', 'lugina', 'lugina', 'valley'),
  N('klimë', 'f', 'klima', 'klima', 'climate'),
  N('reshje', 'f', 'reshja', 'reshje', 'rainfall, precipitation'),
  N('vapë', 'f', 'vapa', 'vapa', 'heat (hot weather)'),
  N('gradë', 'f', 'grada', 'gradë', 'degree'),
  N('bimë', 'f', 'bima', 'bimë', 'plant'),
  N('burim', 'm', 'burimi', 'burime', 'spring, source'),
  N('përrua', 'm', 'përroi', 'përrenj', 'stream', { forms: ['përrenjtë: nom acc pl def'] }),
  N('sipërfaqe', 'f', 'sipërfaqja', 'sipërfaqe', 'surface, area'),
  N('lartësi', 'f', 'lartësia', 'lartësi', 'height'),
  N('gjatësi', 'f', 'gjatësia', 'gjatësi', 'length'),
  N('veri', 'm', 'veriu', undefined, 'north'),
  N('jug', 'm', 'jugu', undefined, 'south'),
  N('lindje', 'f', 'lindja', undefined, 'east; birth'),
  N('perëndim', 'm', 'perëndimi', undefined, 'west'),
  N('metër', 'm', 'metri', 'metra', 'metre'),
  N('kilometër', 'm', 'kilometri', 'kilometra', 'kilometre'),
  // a2-2
  N('kat', 'm', 'kati', 'kate', 'floor, storey'),
  N('banesë', 'f', 'banesa', 'banesa', 'home, flat'),
  N('qira', 'f', 'qiraja', 'qira', 'rent', { forms: ['qiratë: nom acc pl def', 'qiranë: acc sg def', 'qirasë: gen dat abl sg def'] }),
  N('apartament', 'm', 'apartamenti', 'apartamente', 'apartment'),
  N('dysheme', 'f', 'dyshemeja', 'dysheme', 'floor'),
  N('peshqir', 'm', 'peshqiri', 'peshqirë', 'towel'),
  N('sapun', 'm', 'sapuni', 'sapunë', 'soap'),
  N('frigorifer', 'm', 'frigoriferi', 'frigoriferë', 'refrigerator'),
  N('ballkon', 'm', 'ballkoni', 'ballkone', 'balcony'),
  N('lagje', 'f', 'lagjja', 'lagje', 'neighbourhood'),
  N('pronar', 'm', 'pronari', 'pronarë', 'owner'),
  N('rrymë', 'f', 'rryma', 'rryma', 'current; electricity'),
  N('ngrohje', 'f', 'ngrohja', undefined, 'heating'),
  N('taksi', 'f', 'taksia', 'taksi', 'taxi'),
  N('ecje', 'f', 'ecja', 'ecje', 'walk, hike'),
  N('udhëzues', 'm', 'udhëzuesi', 'udhëzues', 'guide'),
  N('peizazh', 'm', 'peizazhi', 'peizazhe', 'landscape'),
  N('fermer', 'm', 'fermeri', 'fermerë', 'farmer'),
  N('ekonomi', 'f', 'ekonomia', undefined, 'economy'),
  N('industri', 'f', 'industria', undefined, 'industry'),
  N('turizëm', 'm', 'turizmi', undefined, 'tourism'),
  N('tregti', 'f', 'tregtia', undefined, 'trade, commerce'),
  N('prodhim', 'm', 'prodhimi', 'prodhime', 'production; product'),
  N('arsye', 'f', 'arsyeja', 'arsye', 'reason', { forms: ['arsyet: nom acc pl def'] }),
  N('rëndësi', 'f', 'rëndësia', undefined, 'importance'),
  N('gjendje', 'f', 'gjendja', 'gjendje', 'state, condition'),
  N('kusht', 'm', 'kushti', 'kushte', 'condition'),
  N('ide', 'f', 'ideja', 'ide', 'idea'),
  N('plan', 'm', 'plani', 'plane', 'plan'),
  N('gabim', 'm', 'gabimi', 'gabime', 'mistake'),
  N('sukses', 'm', 'suksesi', undefined, 'success'),
  N('mbretëreshë', 'f', 'mbretëresha', 'mbretëresha', 'queen'),
  N('nektar', 'm', 'nektari', undefined, 'nectar'),
  N('larvë', 'f', 'larva', 'larva', 'larva'),
  N('thumb', 'm', 'thumbi', 'thumba', 'sting; thorn'),
  N('mashkull', 'm', 'mashkulli', 'meshkuj', 'male (animal)'),
  N('femër', 'f', 'femra', 'femra', 'female'),
  N('fasule', 'f', 'fasulja', 'fasule', 'beans'),
  N('limon', 'm', 'limoni', 'limonë', 'lemon'),
  N('vitaminë', 'f', 'vitamina', 'vitamina', 'vitamin'),
  N('substancë', 'f', 'substanca', 'substanca', 'substance'),
  N('energji', 'f', 'energjia', undefined, 'energy'),
  N('dëm', 'm', 'dëmi', 'dëme', 'harm, damage'),
  N('masë', 'f', 'masa', 'masa', 'measure; mass'),
  N('produkt', 'm', 'produkti', 'produkte', 'product'),
  N('çadër', 'f', 'çadra', 'çadra', 'umbrella'),
  N('murgeshë', 'f', 'murgesha', 'murgesha', 'nun'),
  N('urdhër', 'm', 'urdhri', 'urdhra', 'order (command; religious order)'),
  N('varfëri', 'f', 'varfëria', undefined, 'poverty'),
  N('shpërblim', 'm', 'shpërblimi', 'shpërblime', 'reward, prize'),
  N('aftësi', 'f', 'aftësia', 'aftësi', 'ability, skill'),
  N('kandidat', 'm', 'kandidati', 'kandidatë', 'candidate, applicant'),
  N('pamje', 'f', 'pamja', 'pamje', 'view, sight'),
  N('teatër', 'm', 'teatri', 'teatro', 'theatre'),
  N('kullë', 'f', 'kulla', 'kulla', 'tower'),
  N('pallat', 'm', 'pallati', 'pallate', 'apartment block, large building'),
  N('komunë', 'f', 'komuna', 'komuna', 'commune'),
  N('pikë', 'f', 'pika', 'pika', 'point; drop'),
  N('anë', 'f', 'ana', 'ana', 'side'),
  N('vendas', 'm', 'vendasi', 'vendas', 'local, native (person)'),
  N('territor', 'm', 'territori', 'territore', 'territory'),
  N('sundim', 'm', 'sundimi', 'sundime', 'rule (period of rule)'),
  N('pavarësi', 'f', 'pavarësia', undefined, 'independence'),
  N('lëvizje', 'f', 'lëvizja', 'lëvizje', 'movement'),
  N('zgjedhje', 'f', 'zgjedhja', 'zgjedhje', 'election; choice'),
  N('parti', 'f', 'partia', 'parti', 'political party'),
  N('kuvend', 'm', 'kuvendi', 'kuvende', 'assembly, parliament'),
  N('kushtetutë', 'f', 'kushtetuta', 'kushtetuta', 'constitution'),
  N('transport', 'm', 'transporti', undefined, 'transport'),
  N('institucion', 'm', 'institucioni', 'institucione', 'institution'),
  N('sektor', 'm', 'sektori', 'sektorë', 'sector'),
  N('zhvillim', 'm', 'zhvillimi', 'zhvillime', 'development'),
  N('ndërtim', 'm', 'ndërtimi', 'ndërtime', 'construction, building'),
  N('nivel', 'm', 'niveli', 'nivele', 'level'),
  N('formë', 'f', 'forma', 'forma', 'shape, form'),
  N('sistem', 'm', 'sistemi', 'sisteme', 'system'),
  N('krahinë', 'f', 'krahina', 'krahina', 'region, province'),
  N('rast', 'm', 'rasti', 'raste', 'case, occasion'),
];

const SQ_PLAN_ADJECTIVES: SqLexeme[] = [
  // a1-2
  NA('vjeç', 'years old (after a number)', { fem: 'vjeçe' }),
  // a2-1
  NA('kombëtar', 'national', { fem: 'kombëtare', plM: 'kombëtarë', plF: 'kombëtare' }),
  NA('kulturor', 'cultural', { fem: 'kulturore', plM: 'kulturorë', plF: 'kulturore' }),
  NA('historik', 'historical', { fem: 'historike', plM: 'historikë', plF: 'historike' }),
  NA('ndërkombëtar', 'international', { fem: 'ndërkombëtare', plM: 'ndërkombëtarë', plF: 'ndërkombëtare' }),
  NA('mesatar', 'average', { fem: 'mesatare', plM: 'mesatarë', plF: 'mesatare' }),
  NA('antik', 'ancient', { fem: 'antike', plM: 'antikë', plF: 'antike' }),
  NA('tradicional', 'traditional', { fem: 'tradicionale', plM: 'tradicionalë', plF: 'tradicionale' }),
  NA('malor', 'mountainous, of the mountains', { fem: 'malore', plM: 'malorë', plF: 'malore' }),
  // a2-2
  NA('ekonomik', 'economic', { fem: 'ekonomike', plM: 'ekonomikë', plF: 'ekonomike' }),
  NA('popullor', 'popular, of the people', { fem: 'popullore', plM: 'popullorë', plF: 'popullore' }),
  NA('tregtar', 'commercial, trade (adj.)', { fem: 'tregtare', plM: 'tregtarë', plF: 'tregtare' }),
  NA('industrial', 'industrial', { fem: 'industriale', plM: 'industrialë', plF: 'industriale' }),
  NA('natyror', 'natural', { fem: 'natyrore', plM: 'natyrorë', plF: 'natyrore' }),
  I('dëmshëm', 'harmful', { fem: 'dëmshme', plM: 'dëmshëm', plF: 'dëmshme' }),
  I('aftë', 'able, capable', { plF: 'afta' }),
  NA('turistik', 'tourist (adj.)', { fem: 'turistike', plM: 'turistikë', plF: 'turistike' }),
  NA('jugor', 'southern', { fem: 'jugore', plM: 'jugorë', plF: 'jugore' }),
  NA('verior', 'northern', { fem: 'veriore', plM: 'veriorë', plF: 'veriore' }),
  NA('detar', 'sea (adj.), maritime', { fem: 'detare', plM: 'detarë', plF: 'detare' }),
  NA('bregdetar', 'coastal', { fem: 'bregdetare', plM: 'bregdetarë', plF: 'bregdetare' }),
  NA('arkeologjik', 'archaeological', { fem: 'arkeologjike', plM: 'arkeologjikë', plF: 'arkeologjike' }),
  NA('mesdhetar', 'Mediterranean', { fem: 'mesdhetare', plM: 'mesdhetarë', plF: 'mesdhetare' }),
  NA('lindor', 'eastern', { fem: 'lindore', plM: 'lindorë', plF: 'lindore' }),
  NA('perëndimor', 'western', { fem: 'perëndimore', plM: 'perëndimorë', plF: 'perëndimore' }),
  NA('osman', 'Ottoman', { fem: 'osmane', plM: 'osmanë', plF: 'osmane' }),
  NA('ilir', 'Illyrian', { fem: 'ilire', plM: 'ilirë', plF: 'ilire' }),
  NA('bizantin', 'Byzantine', { fem: 'bizantine', plM: 'bizantinë', plF: 'bizantine' }),
  NA('turk', 'Turkish', { fem: 'turke', plM: 'turq', plF: 'turke' }),
  NA('mesjetar', 'medieval', { fem: 'mesjetare', plM: 'mesjetarë', plF: 'mesjetare' }),
  NA('qendror', 'central', { fem: 'qendrore', plM: 'qendrorë', plF: 'qendrore' }),
  NA('botëror', 'world (adj.), global', { fem: 'botërore', plM: 'botërorë', plF: 'botërore' }),
  NA('urban', 'urban', { fem: 'urbane', plM: 'urbanë', plF: 'urbane' }),
  NA('lokal', 'local', { fem: 'lokale', plM: 'lokalë', plF: 'lokale' }),
  NA('administrativ', 'administrative', { fem: 'administrative', plM: 'administrativë', plF: 'administrative' }),
  NA('karakteristik', 'characteristic', { fem: 'karakteristike', plM: 'karakteristikë', plF: 'karakteristike' }),
];

const SQ_PLAN_ADVERBS: SqLexeme[] = [
  // a1-2
  ADV('zakonisht', 'usually'),
  ADV('djathtas', 'on the right'),
  ADV('majtas', 'on the left'),
  // a2-1
  ADV('anglisht', 'in English'),
  // a2-2
  ADV('kryesisht', 'mainly'),
  ADV('aktualisht', 'currently'),
  ADV('ndërkohë', 'meanwhile'),
  ADV('megjithatë', 'nevertheless, however'),
];

const SQ_PLAN_VERBS: SqLexeme[] = [
  // a1-2
  V('zbres', 'cons', 'zbrita', 'zbritur', 'to go down, to get off', { pres23: 'zbret', forms: ['zbritni: 2 pl pres ind', 'zbrit: 2 sg imper'] }),
  // dhemb: only the third person is in everyday use (më dhemb koka); the first reading must not be the noun dhëmb (tooth)
  V('dhemb', 'cons', 'dhemba', 'dhembur', 'to hurt, to ache (më dhemb koka: my head hurts)'),
  oj('shëroj', 'to cure, to heal (shërohem: to get well)', { nonActive: true }),
  // ec: 1sg ec / eci, 2sg and 3sg ecën
  V('ec', 'cons', 'eca', 'ecur', 'to walk', { pres23: 'ecën', forms: ['ec: 1 sg pres ind', 'eci: 1 sg pres ind', 'ecni: 2 pl pres ind', 'ec: 2 sg imper'] }),
  oj('kaloj', 'to pass; to spend (time)'),
  // pjek: aorist poqa (Wiktionary); the plan states pjeka, which is kept as a variant. The stem changes to piq- before -ni, in the
  // imperative and in the non-active (piqem, piqet: buka piqet)
  V('pjek', 'cons', 'poqa', 'pjekur', 'to bake, to roast', { nonActive: true, forms: ['piqni: 2 pl pres ind', 'piq: 2 sg imper', ...aorA('poq'), ...aorA('pjek')] }),
  V('përziej', 'oj', 'përzjeva', 'përzier', 'to mix, to stir', { aorist3: 'përzjeu', nonActive: true }),
  // a2-1
  V('ngjit', 'cons', 'ngjita', 'ngjitur', 'to climb up, to go up (ngjitem: I climb)', { nonActive: true }),
  V('bërtas', 'cons', 'bërtita', 'bërtitur', 'to shout', { pres23: 'bërtet', forms: ['bërtitni: 2 pl pres ind', 'bërtit: 2 sg imper'] }),
  V('vërej', 'oj', 'vërejta', 'vërejtur', 'to notice'),
  V('fik', 'cons', 'fika', 'fikur', 'to switch off, to put out', { nonActive: true }),
  oj('regjistroj', 'to register, to record', { nonActive: true }),
  oj('pushtoj', 'to conquer, to occupy', { nonActive: true }),
  oj('themeloj', 'to found, to establish', { nonActive: true }),
  V('shtrij', 'oj', 'shtriva', 'shtrirë', 'to stretch out (shtrihet: it lies, it extends)', { aorist3: 'shtriu', nonActive: true }),
  V('përfshij', 'oj', 'përfshiva', 'përfshirë', 'to include', { aorist3: 'përfshiu', nonActive: true }),
  V('ndjej', 'oj', 'ndjeva', 'ndjerë', 'to feel (ndihem: I feel)', { aorist3: 'ndjeu', nonActive: true, forms: ['ndihem: 1 sg pres ind mid'] }),
  // ngas: aorist ngava, participle ngarë (Wiktionary); the plan states ngita / ngitur, kept as variants. The third person nget and
  // the imperative ngit follow vras (vret, vrit): not confirmed by any source
  V('ngas', 'cons', 'ngava', 'ngarë', 'to drive (a vehicle)', {
    pres23: 'nget', aorist3: 'ngau',
    forms: ['ngisni: 2 pl pres ind', 'ngit: 2 sg imper', 'ngava: 1 sg aor ind', 'ngave: 2 sg aor ind', 'ngau: 3 sg aor ind', 'ngamë: 1 pl aor ind', 'ngatë: 2 pl aor ind', 'nganë: 3 pl aor ind', ...aorA('ngit'), 'ngarë: ptcp', 'ngitur: ptcp'],
  }),
  // thërras: aorist thërrita, participle thërritur (Wiktionary); the plan states thirra / thirrur, kept as variants (thirr: 2 sg imper)
  V('thërras', 'cons', 'thërrita', 'thërritur', 'to call, to shout for', {
    pres23: 'thërret',
    forms: ['thërritni: 2 pl pres ind', 'thërrit: 2 sg imper', 'thirr: 2 sg imper', ...aorA('thërrit'), ...aorA('thirr'), 'thërritur: ptcp', 'thirrur: ptcp'],
  }),
  // a2-2
  oj('rezervoj', 'to reserve, to book', { nonActive: true }),
  oj('prodhoj', 'to produce', { nonActive: true }),
  oj('punësoj', 'to employ', { nonActive: true }),
];

/** The 262 words of the plan as one array, in the order nouns, adjectives, adverbs, verbs (the order of the rest of the word list). */
export const SQ_PLAN_LEXEMES: SqLexeme[] = [...SQ_PLAN_NOUNS, ...SQ_PLAN_ADJECTIVES, ...SQ_PLAN_ADVERBS, ...SQ_PLAN_VERBS];

// ───────────────────────── the b1-bridge (data/ladder/sq/authoring/b1.txt, 2026-10-08) ─────────────────────────
// Words that the 25 units of the b1-bridge teach and that the lists above did not have. Same status as all of the above:
// machine-drafted, checked against English Wiktionary's Albanian entries where it has the word, no native speaker has looked.

export const SQ_BRIDGE_NOUNS: SqLexeme[] = [  // b1-01
  N('listë', 'f', 'lista', 'lista', 'list'),
  N('shkumës', 'm', 'shkumësi', undefined, 'chalk'),
  N('figurë', 'f', 'figura', 'figura', 'picture, figure'),
  N('klub', 'm', 'klubi', 'klube', 'club'),
  N('durim', 'm', 'durimi', undefined, 'patience'),
  N('dërrasë', 'f', 'dërrasa', 'dërrasa', 'board; blackboard'),
  // b1-02
  N('copë', 'f', 'copa', 'copa', 'piece'),
  N('krenari', 'f', 'krenaria', undefined, 'pride'),
  N('kënaqësi', 'f', 'kënaqësia', undefined, 'pleasure'),
  N('shkëmbim', 'm', 'shkëmbimi', 'shkëmbime', 'exchange'),
  N('seriozitet', 'm', 'serioziteti', undefined, 'seriousness'),
  // b1-03
  N('ekran', 'm', 'ekrani', 'ekrane', 'screen'),
  // b1-04
  N('kursim', 'm', 'kursimi', 'kursime', 'saving (kursime: savings)'),
  N('borxh', 'm', 'borxhi', 'borxhe', 'debt'),
  N('çast', 'm', 'çasti', 'çaste', 'moment, instant'),
  N('prind', 'm', 'prindi', 'prindër', 'parent'),
  N('zhurmë', 'f', 'zhurma', 'zhurma', 'noise'),
  N('zile', 'f', 'zilja', 'zile', 'bell, doorbell'),
  // b1-05
  N('tas', 'm', 'tasi', 'tasa', 'bowl'),
  N('pagesë', 'f', 'pagesa', 'pagesa', 'payment'),
  N('turp', 'm', 'turpi', undefined, 'shame'),
  // b1-06
  N('njollë', 'f', 'njolla', 'njolla', 'stain, spot'),
  N('rregull', 'm', 'rregulli', 'rregulla', 'order; rule (në rregull: in order, all right)'),
  N('patentë', 'f', 'patenta', 'patenta', 'licence (patentë shoferi: driving licence)'),
  N('vozitje', 'f', 'vozitja', undefined, 'driving'),
  N('aksident', 'm', 'aksidenti', 'aksidente', 'accident'),
  N('respekt', 'm', 'respekti', undefined, 'respect'),
  // b1-07
  N('sallë', 'f', 'salla', 'salla', 'hall, large room (salla e pritjes: waiting room)'),
  N('plak', 'm', 'plaku', 'pleq', 'old man'),
  N('tension', 'm', 'tensioni', undefined, 'tension; blood pressure'),
  N('puls', 'm', 'pulsi', undefined, 'pulse'),
  N('doktoreshë', 'f', 'doktoresha', 'doktoresha', 'woman doctor'),
  N('lot', 'm', 'loti', 'lot', 'tear'),
  // b1-08
  N('shtresë', 'f', 'shtresa', 'shtresa', 'layer'),
  N('arrë', 'f', 'arra', 'arra', 'walnut', { forms: ['arre: gen dat abl sg indef'] }),
  N('kavanoz', 'm', 'kavanozi', 'kavanozë', 'jar'),
  // b1-09
  N('pellg', 'm', 'pellgu', 'pellgje', 'puddle; basin'),
  N('rrip', 'm', 'rripi', 'rripa', 'belt, strap, collar'),
  N('qafë', 'f', 'qafa', 'qafa', 'neck'),
  N('bisht', 'm', 'bishti', 'bishta', 'tail'),
  N('gjysmë', 'f', 'gjysma', 'gjysma', 'half'),
  N('batanije', 'f', 'batanija', 'batanije', 'blanket'),
  // b1-10
  N('fletë', 'f', 'fleta', 'fleta', 'sheet (of paper), leaf'),
  N('titull', 'm', 'titulli', 'tituj', 'title'),
  N('përshkrim', 'm', 'përshkrimi', 'përshkrime', 'description'),
  N('shenjë', 'f', 'shenja', 'shenja', 'sign, mark'),
  N('habi', 'f', 'habia', undefined, 'surprise, astonishment (për habi: to one\'s surprise)'),
  N('shirit', 'm', 'shiriti', 'shirita', 'ribbon, tape'),
  N('veterinar', 'm', 'veterinari', 'veterinarë', 'vet, veterinarian'),
  N('kurriz', 'm', 'kurrizi', 'kurriza', 'back (of the body)'),
  N('çip', 'm', 'çipi', 'çipa', 'chip'),
  N('aparat', 'm', 'aparati', 'aparate', 'device, apparatus'),
  // b1-11
  N('pazar', 'm', 'pazari', 'pazare', 'bazaar, market'),
  N('shaka', 'f', 'shakaja', 'shaka', 'joke'),
  // b1-12
  N('kek', 'm', 'keku', 'keqe', 'cake'),
  N('benzinë', 'f', 'benzina', undefined, 'petrol'),
  N('zëvendës', 'm', 'zëvendësi', 'zëvendës', 'substitute, deputy'),
  N('divan', 'm', 'divani', 'divane', 'sofa, couch'),
  N('shefe', 'f', 'shefja', 'shefe', 'woman boss, manager', { forms: ['shefen: acc sg def', 'shefes: gen dat abl sg def'] }),
  // b1-13
  N('gjeth', 'm', 'gjethi', 'gjethe', 'leaf'),
  N('kafene', 'f', 'kafeneja', 'kafene', 'café'),
  N('lëndinë', 'f', 'lëndina', 'lëndina', 'meadow, lawn'),
  // b1-14
  N('serenatë', 'f', 'serenata', 'serenata', 'serenade'),
  N('hekur', 'm', 'hekuri', undefined, 'iron'),
  N('rrugicë', 'f', 'rrugica', 'rrugica', 'alley, lane'),
  N('kukull', 'f', 'kukulla', 'kukulla', 'doll'),
  N('guxim', 'm', 'guximi', undefined, 'courage, daring'),
  // b1-11, b1-14, b1-15: names
  PN('Bardhi', 'm', 'Bardhi', 'Bardhi (a dog\'s name; also a man\'s name)'),
  PN('Agim', 'm', 'Agimi', 'Agim (man\'s name; also "dawn")'),
  PN('Teuta', 'f', 'Teuta', 'Teuta (woman\'s name)'),
  // b1-16
  N('shami', 'f', 'shamia', 'shami', 'cloth, kerchief'),
  N('rresht', 'm', 'rreshti', 'rreshta', 'row, line'),
  N('qoshe', 'f', 'qoshja', 'qoshe', 'corner'),
  N('arsye', 'f', 'arsyeja', 'arsye', 'reason', { forms: ['arsyen: acc sg def', 'arsyes: gen dat abl sg def'] }),
  N('turn', 'm', 'turni', 'turne', 'shift, turn'),
  // b1-17
  N('raft', 'm', 'rafti', 'rafte', 'shelf'),
  N('pluhur', 'm', 'pluhuri', undefined, 'dust'),
  N('leckë', 'f', 'lecka', 'lecka', 'rag, cloth'),
  N('barrë', 'f', 'barra', 'barra', 'burden, load'),
  N('shpatull', 'f', 'shpatulla', 'shpatulla', 'shoulder'),
  N('qetësi', 'f', 'qetësia', undefined, 'calm, quiet'),
  // b1-18
  N('kostum', 'm', 'kostumi', 'kostume', 'suit'),
  N('shall', 'm', 'shalli', 'shalle', 'shawl, scarf'),
  N('shportë', 'f', 'shporta', 'shporta', 'basket'),
  N('kthim', 'm', 'kthimi', 'kthime', 'return'),
  // b1-19
  N('errësirë', 'f', 'errësira', undefined, 'darkness'),
  N('ritëm', 'm', 'ritmi', 'ritme', 'rhythm'),
  // b1-20
  N('kilogram', 'm', 'kilogrami', 'kilogramë', 'kilogram'),
  N('rezultat', 'm', 'rezultati', 'rezultate', 'result'),
  N('dështim', 'm', 'dështimi', 'dështime', 'failure'),
  N('shëtitje', 'f', 'shëtitja', 'shëtitje', 'walk, stroll'),
  // b1-21
  N('redaktore', 'f', 'redaktorja', 'redaktore', 'woman editor', { forms: ['redaktoren: acc sg def', 'redaktores: gen dat abl sg def'] }),
  N('redaksi', 'f', 'redaksia', 'redaksi', 'editorial office, the editors'),
  N('lexues', 'm', 'lexuesi', 'lexues', 'reader'),
  N('material', 'm', 'materiali', 'materiale', 'material'),
  N('vëmendje', 'f', 'vëmendja', undefined, 'attention'),
  N('vështirësi', 'f', 'vështirësia', 'vështirësi', 'difficulty'),
  N('rend', 'm', 'rendi', 'rende', 'order, sequence'),
  // b1-22
  N('leje', 'f', 'leja', 'leje', 'permission; permit', { forms: ['lejen: acc sg def', 'lejes: gen dat abl sg def'] }),
  N('qëndrim', 'm', 'qëndrimi', 'qëndrime', 'stay; attitude'),
  N('sigurim', 'm', 'sigurimi', 'sigurime', 'insurance'),
  N('provë', 'f', 'prova', 'prova', 'test, trial; proof'),
  // b1-23
  N('stol', 'm', 'stoli', 'stola', 'bench'),
  N('ditar', 'm', 'ditari', 'ditarë', 'diary'),
  // b1-24
  N('degë', 'f', 'dega', 'degë', 'branch'),
  N('daulle', 'f', 'daullja', 'daulle', 'drum'),
  N('nuse', 'f', 'nusja', 'nuse', 'bride; daughter-in-law', { forms: ['nusen: acc sg def', 'nuses: gen dat abl sg def'] }),
  N('dhëndër', 'm', 'dhëndri', 'dhëndurë', 'bridegroom; son-in-law'),
  N('ceremoni', 'f', 'ceremonia', 'ceremoni', 'ceremony'),
  // b1-25
  N('shfaqje', 'f', 'shfaqja', 'shfaqje', 'show, performance', { forms: ['shfaqjen: acc sg def', 'shfaqjes: gen dat abl sg def'] }),
  N('vizatim', 'm', 'vizatimi', 'vizatime', 'drawing'),
  N('ndrojtje', 'f', 'ndrojtja', undefined, 'shyness'),
  N('publik', 'm', 'publiku', undefined, 'audience, public'),
  N('aksent', 'm', 'aksenti', 'aksente', 'accent'),
  N('fjalim', 'm', 'fjalimi', 'fjalime', 'speech'),
];

export const SQ_BRIDGE_ADJECTIVES: SqLexeme[] = [
  // b1-03
  I('serioz', 'serious', { fem: 'serioze', plM: 'seriozë', plF: 'serioze' }),
  // b1-04
  I('krenar', 'proud', { fem: 'krenare', plM: 'krenarë', plF: 'krenare' }),
  // b1-05
  I('përhershëm', 'permanent', { fem: 'përhershme', plM: 'përhershëm', plF: 'përhershme' }),
  // b1-06
  I('nevojshëm', 'necessary', { fem: 'nevojshme', plM: 'nevojshëm', plF: 'nevojshme' }),
  // b1-07
  I('mençur', 'wise, sensible', { fem: 'mençur', plM: 'mençur', plF: 'mençura' }),
  // b1-08
  NA('plot', 'full (plot me: full of)'),
  // b1-10
  I('gatshëm', 'ready, willing', { fem: 'gatshme', plM: 'gatshëm', plF: 'gatshme' }),
  NA('ngjitës', 'sticky, adhesive', { fem: 'ngjitëse', plM: 'ngjitës', plF: 'ngjitëse' }),
  I('panjohur', 'unknown, unfamiliar', { fem: 'panjohur', plM: 'panjohur', plF: 'panjohura' }),
  // b1-11
  I('verdhë', 'yellow', { fem: 'verdhë', plM: 'verdhë', plF: 'verdhë' }),
  // b1-15
  I('çuditshëm', 'strange, odd', { fem: 'çuditshme', plM: 'çuditshëm', plF: 'çuditshme' }),
  // b1-17
  I('ndershëm', 'honest', { fem: 'ndershme', plM: 'ndershëm', plF: 'ndershme' }),
  // b1-22
  I('rëndësishëm', 'important', { fem: 'rëndësishme', plM: 'rëndësishëm', plF: 'rëndësishme' }),
];

export const SQ_BRIDGE_ADVERBS: SqLexeme[] = [  // b1-01
  ADV('menjëherë', 'at once, immediately'),
  W('gjithçka', 'PRON', 'everything'),
  // b1-04
  ADV('kurrë', 'never, ever'),
  ADV('butë', 'gently, softly'),
  // b1-05
  ADV('as', 'not even; nor'),
  ADV('kaq', 'so (much), that (much)'),
  // b1-07
  ADV('rregullisht', 'regularly'),
  ADV('ngadalë', 'slowly'),
  ADV('përsëri', 'again'),
  ADV('mjaftueshëm', 'enough, sufficiently'),
  // b1-11
  ADV('kudo', 'everywhere'),
  ADV('fort', 'strongly, hard, tightly'),
  // b1-13
  ADV('prapa', 'behind, at the back'),
  // b1-17
  W('sikur', 'SCONJ', 'as if; if only'),
  // b1-18
  W('amen', 'INTJ', 'amen'),
  // b1-21
  ADV('plotësisht', 'completely, fully'),
  // b1-22
  ADV('falas', 'free of charge'),
  // b1-25
  ADV('direkt', 'directly'),
];

export const SQ_BRIDGE_VERBS: SqLexeme[] = [  // b1-02
  oj('shqiptoj', 'to pronounce', { nonActive: true }),
  oj('korrigjoj', 'to correct', { nonActive: true }),
  V('prek', 'cons', 'preka', 'prekur', 'to touch', { aorist3: 'preku', nonActive: true }),
  V('përsëris', 'cons', 'përsërita', 'përsëritur', 'to repeat', { pres23: 'përsërit', forms: ['përsërisni: 2 pl pres ind', 'përsërit: 2 sg imper'] }),
  V('leh', 'cons', 'leha', 'lehur', 'to bark', { aorist3: 'lehu' }),
  // b1-03
  oj('shqetësoj', 'to worry, to disturb (shqetësohem: to worry)', { nonActive: true }),
  // b1-04
  V('humb', 'cons', 'humba', 'humbur', 'to lose'),
  oj('gaboj', 'to make a mistake, to be wrong', { nonActive: true }),
  oj('frikësoj', 'to frighten (frikësohem: to be afraid)', { nonActive: true }),
  // b1-05
  oj('rrotulloj', 'to turn round, to stir', { nonActive: true }),
  oj('rregulloj', 'to fix, to repair, to arrange', { nonActive: true }),
  oj('turpëroj', 'to embarrass, to shame (turpërohem: to be embarrassed)', { nonActive: true }),
  V('lag', 'cons', 'laga', 'lagur', 'to wet'),
  V('pëshpëris', 'cons', 'pëshpërita', 'pëshpëritur', 'to whisper', { pres23: 'pëshpërit', forms: ['pëshpërisni: 2 pl pres ind', 'pëshpërit: 2 sg imper'] }),
  // b1-06
  oj('drejtoj', 'to lead, to direct, to steer', { nonActive: true }),
  // b1-07
  V('mat', 'cons', 'mata', 'matur', 'to measure', { nonActive: true }),
  oj('fitoj', 'to earn, to win, to gain'),
  // b1-08
  oj('copëtoj', 'to break into pieces, to cut up', { nonActive: true }),
  V('nxjerr', 'cons', 'nxora', 'nxjerrë', 'to take out, to draw out', { aorist3: 'nxori', pres23: 'nxjerr', forms: ['nxirni: 2 pl pres ind', 'nxirr: 2 sg imper'] }),
  // b1-09
  V('dridhem', 'cons', 'dridha', 'dridhur', 'to tremble, to shiver', { nonActive: 'only' }),
  oj('qetësoj', 'to calm (qetësohem: to calm down)', { nonActive: true }),
  V('përkul', 'cons', 'përkula', 'përkulur', 'to bend (përkulem: to bend down)', { nonActive: true }),
  // b1-10
  oj('printoj', 'to print'),
  oj('trishtoj', 'to sadden (trishtohem: to become sad)', { nonActive: true }),
  // b1-11
  oj('përqafoj', 'to hug, to embrace', { nonActive: true }),
  oj('mungoj', 'to be absent, to be missing'),
  // b1-13
  oj('nënvizoj', 'to underline'),
  // b1-16
  oj('peshoj', 'to weigh'),
  // b1-17
  oj('bisedoj', 'to talk, to converse'),
  // b1-18
  V('shkëlqej', 'oj', 'shkëlqeva', 'shkëlqyer', 'to shine, to sparkle'),
  // b1-20
  oj('dështoj', 'to fail'),
  // b1-21
  oj('njoftoj', 'to inform, to announce', { nonActive: true }),
  oj('planifikoj', 'to plan'),
  V('udhëheq', 'cons', 'udhëhoqa', 'udhëhequr', 'to lead, to guide'),
  // b1-22
  oj('rinovoj', 'to renew', { nonActive: true }),
  oj('kopjoj', 'to copy'),
  // b1-24
  oj('vallëzoj', 'to dance (a folk dance)'),
];

export const SQ_BRIDGE_LEXEMES: SqLexeme[] = [...SQ_BRIDGE_NOUNS, ...SQ_BRIDGE_ADJECTIVES, ...SQ_BRIDGE_ADVERBS, ...SQ_BRIDGE_VERBS];

// What morphology.ts reads: the plan's words, then the bridge's.
export const SQ_LADDER_NOUNS: SqLexeme[] = [...SQ_PLAN_NOUNS, ...SQ_BRIDGE_NOUNS];
export const SQ_LADDER_ADJECTIVES: SqLexeme[] = [...SQ_PLAN_ADJECTIVES, ...SQ_BRIDGE_ADJECTIVES];
export const SQ_LADDER_ADVERBS: SqLexeme[] = [...SQ_PLAN_ADVERBS, ...SQ_BRIDGE_ADVERBS];
export const SQ_LADDER_VERBS: SqLexeme[] = [...SQ_PLAN_VERBS, ...SQ_BRIDGE_VERBS];

/** The plan's 262 words as one array (the bridge's are SQ_BRIDGE_LEXEMES). */
export const SQ_LADDER_LEXEMES: SqLexeme[] = SQ_PLAN_LEXEMES;
