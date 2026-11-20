/**
 * French verb generator, part 2: the irregular verbs and the verbs that follow a model (MORPH package, docs/french/PLAN.md).
 * MACHINE-DRAFTED from the standard conjugation tables, not checked by a native speaker. A verb that is not certain is left
 * out (ouïr, seoir, frire, bruire, faillir, saillir in the sense "to jut", paître, échoir: not here).
 *
 * Each family is a `Fam`: the `tail` of the lemma that carries the irregularity, the prefixes that may stand before it, and
 * the written forms as a small notation (all stems and forms are written without the prefix; the prefix is put in front):
 *   pres   six forms "je tu il nous vous ils", alternatives with "/", "-" = no such form
 *   impf   the imparfait stem(s)            ("buv": buvais …)
 *   ps     "class:stem" (a: -ai -as -a; i: -is -it; u: -us -ut; in: -ins -int, as in vins) or six forms; absent = no passé simple
 *   fut    the futur stem(s) up to the -r  ("boir": boirai …); the conditionnel follows
 *   sub    "strong|weak" stems of the subjonctif présent (puiss; veuill|voul) or "=" and six forms (sois …)
 *   pp     the masculine singular participle ("fait"), "!x" when invariable (!pu), "ms|fs|mp|fp" when irregular
 *   prp    the participe présent, "-" = none
 *   impr   "2s 1p 2p" when not the present's own, "-" = no imperative
 * A prefix may change a few of them (`variants`): redites against contredisez, prévoirai against verrai, ému against mû.
 */
import { cndFrom, futFrom, imperativeFromPresent, impfFrom, psFrom, subFrom, type PsClass, type S6, type VerbSpec } from './verb-regular';

export interface Irr {
  pres: string;
  impf?: string;
  ps?: string;
  fut?: string;
  sub?: string;
  pp?: string;
  prp?: string;
  impr?: string;
  aux?: 'être' | 'both';
  only?: Array<'3s' | '3p'>;
  variants?: Record<string, Partial<Irr>>;
}

export interface Fam {
  /** The end of the lemma that carries the irregularity: 'prendre', 'cevoir', 'ire' (conduire: the prefix is condu-). */
  tail: string;
  /** The verb the paradigm is "conjugated like" (a real infinitive). */
  model: string;
  irr: Irr;
  /** Prefixes attested for the family. */
  prefixes: string[];
  /** When set, any prefix this pattern accepts also belongs to the family (venir: convenir, circonvenir …). */
  any?: RegExp;
}

const dash = (t: string): boolean => t === '-' || t === '';
const alts = (tok: string, pre: string): string[] => (dash(tok) ? [] : tok.split('/').map((x) => pre + x));
const six = (s: string, pre: string): S6 => {
  const toks = s.trim().split(/\s+/);
  if (toks.length !== 6) throw new Error(`verb-irregular: "${s}" does not have six forms`);
  return toks.map((t) => alts(t, pre));
};

/** The spec of one family member: `prefix` goes in front of every form and stem. */
export function expandIrr(lemma: string, irr: Irr, prefix: string): VerbSpec {
  const pre = prefix;
  const pres = six(irr.pres, pre);
  const stems = (t: string | undefined): string[] => (t ? t.split('/').filter((x) => !dash(x)).map((x) => pre + x) : []);
  const spec: VerbSpec = { lemma, pres, impf: irr.impf ? impfFrom(stems(irr.impf)) : [[], [], [], [], [], []] };
  if (irr.ps) {
    const m = /^(a|i|u|in):(.*)$/.exec(irr.ps);
    spec.ps = m ? psFrom(m[1] as PsClass, m[2].split('/').map((x) => pre + x)) : six(irr.ps, pre);
  }
  if (irr.fut) {
    spec.fut = futFrom(stems(irr.fut));
    spec.cnd = cndFrom(stems(irr.fut));
  }
  if (irr.sub) {
    if (irr.sub.startsWith('=')) spec.sub = six(irr.sub.slice(1), pre);
    else {
      const [strong, weak] = irr.sub.split('|');
      spec.sub = subFrom(stems(strong), stems(weak ?? strong));
    }
  }
  if (irr.pp) {
    if (irr.pp.startsWith('!')) { spec.pp = [pre + irr.pp.slice(1)]; spec.ppInvariable = true; }
    else if (irr.pp.includes('|')) {
      const f = irr.pp.split('|').map((x) => pre + x);
      spec.ppForms = [f[0], f[1], f[2], f[3]];
      spec.pp = [f[0]];
    } else spec.pp = stems(irr.pp);
  }
  if (irr.prp && !dash(irr.prp)) spec.prp = stems(irr.prp);
  if (irr.only) spec.only = irr.only;
  if (irr.impr === '-') return spec;
  if (irr.impr) {
    const t = irr.impr.trim().split(/\s+/);
    spec.impr = [alts(t[0], pre), alts(t[1], pre), alts(t[2], pre)];
    // vas-y, parles-en: a 2s imperative that is the present 2s without its -s also has the long form before en and y
    const long = spec.pres[1].filter((f) => spec.impr![0].some((g) => g + 's' === f));
    if (long.length && spec.impr[0].every((g) => long.includes(g + 's'))) spec.imprLong = long;
  } else Object.assign(spec, imperativeFromPresent(spec.pres));
  return spec;
}

/** The family members' paradigms with their prefix variants applied. */
export function irrFor(irr: Irr, prefix: string): Irr {
  const v = irr.variants?.[prefix];
  return v ? { ...irr, ...v } : irr;
}

const ANY = /^[a-zàâäçéèêëîïôöùûüœæ]+$/;

export const FAMILIES: Fam[] = [
  // --- être, avoir, aller ---
  { tail: 'être', model: 'être', prefixes: [''], irr: { pres: 'suis es est sommes êtes sont', impf: 'ét', ps: 'fus fus fut fûmes fûtes furent', fut: 'ser', sub: '=sois sois soit soyons soyez soient', pp: '!été', prp: 'étant', impr: 'sois soyons soyez' } },
  { tail: 'avoir', model: 'avoir', prefixes: [''], irr: { pres: 'ai as a avons avez ont', impf: 'av', ps: 'eus eus eut eûmes eûtes eurent', fut: 'aur', sub: '=aie aies ait ayons ayez aient', pp: 'eu', prp: 'ayant', impr: 'aie ayons ayez' } },
  { tail: 'aller', model: 'aller', prefixes: [''], irr: { pres: 'vais vas va allons allez vont', impf: 'all', ps: 'a:all', fut: 'ir', sub: 'aill|all', pp: 'allé', prp: 'allant', impr: 'va allons allez', aux: 'être' } },
  // --- faire, dire and compounds ---
  { tail: 'faire', model: 'faire', prefixes: ['', 'dé', 're', 'contre', 'satis', 'sur'], any: ANY, irr: { pres: 'fais fais fait faisons faites font', impf: 'fais', ps: 'i:f', fut: 'fer', sub: 'fass', pp: 'fait', prp: 'faisant', impr: 'fais faisons faites' } },
  { tail: 'maudire', model: 'maudire', prefixes: [''], irr: { pres: 'maudis maudis maudit maudissons maudissez maudissent', impf: 'maudiss', ps: 'i:maud', fut: 'maudir', sub: 'maudiss', pp: 'maudit', prp: 'maudissant', impr: 'maudis maudissons maudissez' } },
  {
    tail: 'dire', model: 'dire', prefixes: ['', 're', 'contre', 'dé', 'inter', 'mé', 'pré'],
    irr: {
      pres: 'dis dis dit disons dites disent', impf: 'dis', ps: 'i:d', fut: 'dir', sub: 'dis', pp: 'dit', prp: 'disant', impr: 'dis disons dites',
      // only dire and redire have -dites; contredire, dédire, interdire, médire, prédire have -disez
      variants: Object.fromEntries(['contre', 'dé', 'inter', 'mé', 'pré'].map((p) => [p, { pres: 'dis dis dit disons disez disent', impr: 'dis disons disez' }])),
    },
  },
  // --- pouvoir, vouloir, savoir, devoir, valoir, falloir, pleuvoir, mouvoir ---
  { tail: 'pouvoir', model: 'pouvoir', prefixes: ['', 're'], irr: { pres: 'peux/puis peux peut pouvons pouvez peuvent', impf: 'pouv', ps: 'u:p', fut: 'pourr', sub: 'puiss', pp: '!pu', prp: 'pouvant', impr: '-' } },
  { tail: 'vouloir', model: 'vouloir', prefixes: ['', 're'], irr: { pres: 'veux veux veut voulons voulez veulent', impf: 'voul', ps: 'u:voul', fut: 'voudr', sub: 'veuill|voul', pp: 'voulu', prp: 'voulant', impr: 'veux/veuille voulons/veuillons voulez/veuillez' } },
  { tail: 'savoir', model: 'savoir', prefixes: [''], irr: { pres: 'sais sais sait savons savez savent', impf: 'sav', ps: 'u:s', fut: 'saur', sub: 'sach', pp: 'su', prp: 'sachant', impr: 'sache sachons sachez' } },
  {
    tail: 'devoir', model: 'devoir', prefixes: ['', 're'],
    irr: { pres: 'dois dois doit devons devez doivent', impf: 'dev', ps: 'u:d', fut: 'devr', sub: 'doiv|dev', pp: 'dû|due|dus|dues', prp: 'devant', impr: 'dois devons devez', variants: { re: { pp: 'dû|due|dus|dues' } } },
  },
  {
    tail: 'valoir', model: 'valoir', prefixes: ['', 'équi', 'pré'],
    irr: { pres: 'vaux vaux vaut valons valez valent', impf: 'val', ps: 'u:val', fut: 'vaudr', sub: 'vaill|val', pp: 'valu', prp: 'valant', impr: 'vaux valons valez', variants: { pré: { sub: 'val' } } },
  },
  { tail: 'falloir', model: 'falloir', prefixes: [''], irr: { pres: '- - faut - - -', impf: 'fall', ps: 'u:fall', fut: 'faudr', sub: 'faill', pp: '!fallu', prp: '-', impr: '-', only: ['3s'] } },
  { tail: 'pleuvoir', model: 'pleuvoir', prefixes: [''], irr: { pres: '- - pleut - - pleuvent', impf: 'pleuv', ps: 'u:pl', fut: 'pleuvr', sub: 'pleuv', pp: '!plu', prp: 'pleuvant', impr: '-', only: ['3s', '3p'] } },
  {
    tail: 'mouvoir', model: 'mouvoir', prefixes: ['', 'é', 'pro'],
    irr: {
      pres: 'meus meus meut mouvons mouvez meuvent', impf: 'mouv', ps: 'u:m', fut: 'mouvr', sub: 'meuv|mouv', pp: 'mû|mue|mus|mues', prp: 'mouvant', impr: 'meus mouvons mouvez',
      variants: { é: { pp: 'mu' }, pro: { pp: 'mu' } },
    },
  },
  { tail: 'cevoir', model: 'recevoir', prefixes: ['re', 'aper', 'con', 'dé', 'per', 'entraper', 'précon'], any: ANY, irr: { pres: 'çois çois çoit cevons cevez çoivent', impf: 'cev', ps: 'u:ç', fut: 'cevr', sub: 'çoiv|cev', pp: 'çu', prp: 'cevant', impr: 'çois cevons cevez' } },
  // --- voir and compounds ---
  { tail: 'pourvoir', model: 'pourvoir', prefixes: [''], irr: { pres: 'pourvois pourvois pourvoit pourvoyons pourvoyez pourvoient', impf: 'pourvoy', ps: 'u:pourv', fut: 'pourvoir', sub: 'pourvoi|pourvoy', pp: 'pourvu', prp: 'pourvoyant', impr: 'pourvois pourvoyons pourvoyez' } },
  {
    tail: 'voir', model: 'voir', prefixes: ['', 're', 'entre', 'pré'],
    irr: { pres: 'vois vois voit voyons voyez voient', impf: 'voy', ps: 'i:v', fut: 'verr', sub: 'voi|voy', pp: 'vu', prp: 'voyant', impr: 'vois voyons voyez', variants: { pré: { fut: 'voir' } } },
  },
  {
    tail: 'asseoir', model: 'asseoir', prefixes: ['', 'r'],
    irr: {
      pres: 'assieds/assois assieds/assois assied/assoit asseyons/assoyons asseyez/assoyez asseyent/assoient', impf: 'assey/assoy', ps: 'i:ass', fut: 'assiér/assoir',
      sub: 'assey/assoi|assey/assoy', pp: 'assis', prp: 'asseyant/assoyant', impr: 'assieds/assois asseyons/assoyons asseyez/assoyez',
    },
  },
  { tail: 'surseoir', model: 'surseoir', prefixes: [''], irr: { pres: 'sursois sursois sursoit sursoyons sursoyez sursoient', impf: 'sursoy', ps: 'i:surs', fut: 'surseoir', sub: 'sursoi|sursoy', pp: 'sursis', prp: 'sursoyant', impr: 'sursois sursoyons sursoyez' } },
  { tail: 'déchoir', model: 'déchoir', prefixes: [''], irr: { pres: 'déchois déchois déchoit déchoyons déchoyez déchoient', ps: 'u:déch', fut: 'déchoir/décherr', sub: 'déchoi|déchoy', pp: 'déchu', prp: '-', impr: '-', aux: 'both' } },
  // --- croire, boire, connaître, naître, croître, plaire, taire, traire, clore ---
  { tail: 'croire', model: 'croire', prefixes: [''], irr: { pres: 'crois crois croit croyons croyez croient', impf: 'croy', ps: 'u:cr', fut: 'croir', sub: 'croi|croy', pp: 'cru', prp: 'croyant', impr: 'crois croyons croyez' } },
  { tail: 'boire', model: 'boire', prefixes: [''], irr: { pres: 'bois bois boit buvons buvez boivent', impf: 'buv', ps: 'u:b', fut: 'boir', sub: 'boiv|buv', pp: 'bu', prp: 'buvant', impr: 'bois buvons buvez' } },
  { tail: 'naître', model: 'naître', prefixes: ['', 're'], irr: { pres: 'nais nais naît naissons naissez naissent', impf: 'naiss', ps: 'i:naqu', fut: 'naîtr', sub: 'naiss', pp: 'né', prp: 'naissant', impr: 'nais naissons naissez', aux: 'être' } },
  { tail: 'aître', model: 'connaître', prefixes: [], any: /^[a-zàâäçéèêëîïôöùûüœæ]*(?:nn|r)$/, irr: { pres: 'ais ais aît aissons aissez aissent', impf: 'aiss', ps: 'u:', fut: 'aîtr', sub: 'aiss', pp: 'u', prp: 'aissant', impr: 'ais aissons aissez' } },
  {
    tail: 'croître', model: 'croître', prefixes: ['', 'ac', 'dé'],
    irr: {
      pres: 'croîs croîs croît croissons croissez croissent', impf: 'croiss', ps: 'crûs crûs crût crûmes crûtes crûrent', fut: 'croîtr', sub: 'croiss', pp: 'crû|crue|crus|crues', prp: 'croissant', impr: 'croîs croissons croissez',
      variants: { ac: { ps: 'u:cr', pp: 'cru' }, dé: { ps: 'u:cr', pp: 'cru' } },
    },
  },
  { tail: 'plaire', model: 'plaire', prefixes: ['', 'dé', 'com'], irr: { pres: 'plais plais plaît plaisons plaisez plaisent', impf: 'plais', ps: 'u:pl', fut: 'plair', sub: 'plais', pp: '!plu', prp: 'plaisant', impr: 'plais plaisons plaisez' } },
  { tail: 'taire', model: 'taire', prefixes: [''], irr: { pres: 'tais tais tait taisons taisez taisent', impf: 'tais', ps: 'u:t', fut: 'tair', sub: 'tais', pp: 'tu', prp: 'taisant', impr: 'tais taisons taisez' } },
  { tail: 'traire', model: 'traire', prefixes: ['', 'dis', 'ex', 'sous', 'abs', 'at', 're'], irr: { pres: 'trais trais trait trayons trayez traient', impf: 'tray', fut: 'trair', sub: 'trai|tray', pp: 'trait', prp: 'trayant', impr: 'trais trayons trayez' } },
  { tail: 'clore', model: 'clore', prefixes: ['', 'en'], irr: { pres: 'clos clos clôt closons closez closent', fut: 'clor', sub: 'clos', pp: 'clos', prp: 'closant', impr: 'clos closons closez' } },
  { tail: 'gésir', model: 'gésir', prefixes: [''], irr: { pres: 'gis gis gît gisons gisez gisent', impf: 'gis', prp: 'gisant', impr: '-' } },
  // --- -indre, -uire, -crire, lire, rire, vivre, suivre, vaincre, rompre, battre, mettre, prendre, coudre, moudre, résoudre ---
  { tail: 'indre', model: 'craindre', prefixes: ['o'], any: /^[a-zàâäçéèêëîïôöùûüœæ]+[aeo]$/, irr: { pres: 'ins ins int ignons ignez ignent', impf: 'ign', ps: 'i:ign', fut: 'indr', sub: 'ign', pp: 'int', prp: 'ignant', impr: 'ins ignons ignez' } },
  { tail: 'nuire', model: 'nuire', prefixes: [''], irr: { pres: 'nuis nuis nuit nuisons nuisez nuisent', impf: 'nuis', ps: 'i:nuis', fut: 'nuir', sub: 'nuis', pp: '!nui', prp: 'nuisant', impr: 'nuis nuisons nuisez' } },
  { tail: 'luire', model: 'luire', prefixes: ['', 're'], irr: { pres: 'luis luis luit luisons luisez luisent', impf: 'luis', fut: 'luir', sub: 'luis', pp: '!lui', prp: 'luisant', impr: 'luis luisons luisez' } },
  { tail: 'ire', model: 'conduire', prefixes: [], any: /^[a-zàâäçéèêëîïôöùûüœæ]*(?:d|tr|c)u$/, irr: { pres: 'is is it isons isez isent', impf: 'is', ps: 'i:is', fut: 'ir', sub: 'is', pp: 'it', prp: 'isant', impr: 'is isons isez' } },
  { tail: 'suffire', model: 'suffire', prefixes: [''], irr: { pres: 'suffis suffis suffit suffisons suffisez suffisent', impf: 'suffis', ps: 'i:suff', fut: 'suffir', sub: 'suffis', pp: '!suffi', prp: 'suffisant', impr: 'suffis suffisons suffisez' } },
  { tail: 'crire', model: 'écrire', prefixes: ['é', 'dé', 'ré', 'réé', 'ins', 'pres', 'pros', 'sous', 'trans', 'circons'], any: /^[a-zàâäçéèêëîïôöùûüœæ]+$/, irr: { pres: 'cris cris crit crivons crivez crivent', impf: 'criv', ps: 'i:criv', fut: 'crir', sub: 'criv', pp: 'crit', prp: 'crivant', impr: 'cris crivons crivez' } },
  { tail: 'lire', model: 'lire', prefixes: ['', 'é', 're', 'réé'], irr: { pres: 'lis lis lit lisons lisez lisent', impf: 'lis', ps: 'u:l', fut: 'lir', sub: 'lis', pp: 'lu', prp: 'lisant', impr: 'lis lisons lisez' } },
  { tail: 'rire', model: 'rire', prefixes: ['', 'sou'], irr: { pres: 'ris ris rit rions riez rient', impf: 'ri', ps: 'i:r', fut: 'rir', sub: 'ri', pp: '!ri', prp: 'riant', impr: 'ris rions riez' } },
  { tail: 'vivre', model: 'vivre', prefixes: ['', 're', 'sur'], irr: { pres: 'vis vis vit vivons vivez vivent', impf: 'viv', ps: 'u:véc', fut: 'vivr', sub: 'viv', pp: 'vécu', prp: 'vivant', impr: 'vis vivons vivez' } },
  { tail: 'suivre', model: 'suivre', prefixes: ['', 'pour', 'en'], irr: { pres: 'suis suis suit suivons suivez suivent', impf: 'suiv', ps: 'i:suiv', fut: 'suivr', sub: 'suiv', pp: 'suivi', prp: 'suivant', impr: 'suis suivons suivez' } },
  { tail: 'vaincre', model: 'vaincre', prefixes: ['', 'con'], irr: { pres: 'vaincs vaincs vainc vainquons vainquez vainquent', impf: 'vainqu', ps: 'i:vainqu', fut: 'vaincr', sub: 'vainqu', pp: 'vaincu', prp: 'vainquant', impr: 'vaincs vainquons vainquez' } },
  { tail: 'rompre', model: 'rompre', prefixes: ['', 'cor', 'inter'], irr: { pres: 'romps romps rompt rompons rompez rompent', impf: 'romp', ps: 'i:romp', fut: 'rompr', sub: 'romp', pp: 'rompu', prp: 'rompant', impr: 'romps rompons rompez' } },
  { tail: 'battre', model: 'battre', prefixes: ['', 'a', 'com', 'dé', 'é', 'ra', 're'], any: ANY, irr: { pres: 'bats bats bat battons battez battent', impf: 'batt', ps: 'i:batt', fut: 'battr', sub: 'batt', pp: 'battu', prp: 'battant', impr: 'bats battons battez' } },
  { tail: 'mettre', model: 'mettre', prefixes: ['', 'ad', 'com', 'compro', 'dé', 'é', 'entre', 'om', 'per', 'pro', 're', 'sou', 'trans', 'retrans'], any: ANY, irr: { pres: 'mets mets met mettons mettez mettent', impf: 'mett', ps: 'i:m', fut: 'mettr', sub: 'mett', pp: 'mis', prp: 'mettant', impr: 'mets mettons mettez' } },
  { tail: 'prendre', model: 'prendre', prefixes: ['', 'ap', 'com', 'sur', 're', 'entre', 'mé', 'dé', 'é', 'ré', 'désap', 'réap', 'rap'], any: ANY, irr: { pres: 'prends prends prend prenons prenez prennent', impf: 'pren', ps: 'i:pr', fut: 'prendr', sub: 'prenn|pren', pp: 'pris', prp: 'prenant', impr: 'prends prenons prenez' } },
  { tail: 'coudre', model: 'coudre', prefixes: ['', 'dé', 're'], irr: { pres: 'couds couds coud cousons cousez cousent', impf: 'cous', ps: 'i:cous', fut: 'coudr', sub: 'cous', pp: 'cousu', prp: 'cousant', impr: 'couds cousons cousez' } },
  { tail: 'moudre', model: 'moudre', prefixes: ['', 'é', 're'], irr: { pres: 'mouds mouds moud moulons moulez moulent', impf: 'moul', ps: 'u:moul', fut: 'moudr', sub: 'moul', pp: 'moulu', prp: 'moulant', impr: 'mouds moulons moulez' } },
  { tail: 'résoudre', model: 'résoudre', prefixes: [''], irr: { pres: 'résous résous résout résolvons résolvez résolvent', impf: 'résolv', ps: 'u:résol', fut: 'résoudr', sub: 'résolv', pp: 'résolu', prp: 'résolvant', impr: 'résous résolvons résolvez' } },
  { tail: 'absoudre', model: 'absoudre', prefixes: [''], irr: { pres: 'absous absous absout absolvons absolvez absolvent', impf: 'absolv', fut: 'absoudr', sub: 'absolv', pp: 'absous|absoute|absous|absoutes', prp: 'absolvant', impr: 'absous absolvons absolvez' } },
  { tail: 'dissoudre', model: 'dissoudre', prefixes: [''], irr: { pres: 'dissous dissous dissout dissolvons dissolvez dissolvent', impf: 'dissolv', fut: 'dissoudr', sub: 'dissolv', pp: 'dissous|dissoute|dissous|dissoutes', prp: 'dissolvant', impr: 'dissous dissolvons dissolvez' } },
  {
    tail: 'clure', model: 'conclure', prefixes: ['con', 'ex', 'in', 'oc'],
    irr: { pres: 'clus clus clut cluons cluez cluent', impf: 'clu', ps: 'u:cl', fut: 'clur', sub: 'clu', pp: 'clu', prp: 'cluant', impr: 'clus cluons cluez', variants: { in: { pp: 'clus' }, oc: { pp: 'clus' } } },
  },
  // --- -ir verbs of the third group ---
  { tail: 'fuir', model: 'fuir', prefixes: ['', 'en'], irr: { pres: 'fuis fuis fuit fuyons fuyez fuient', impf: 'fuy', ps: 'i:fu', fut: 'fuir', sub: 'fui|fuy', pp: 'fui', prp: 'fuyant', impr: 'fuis fuyons fuyez' } },
  { tail: 'haïr', model: 'haïr', prefixes: [''], irr: { pres: 'hais hais hait haïssons haïssez haïssent', impf: 'haïss', ps: 'haïs haïs haït haïmes haïtes haïrent', fut: 'haïr', sub: 'haïss', pp: 'haï', prp: 'haïssant', impr: 'hais haïssons haïssez' } },
  { tail: 'quérir', model: 'acquérir', prefixes: ['ac', 'con', 're', 'recon', 'en'], irr: { pres: 'quiers quiers quiert quérons quérez quièrent', impf: 'quér', ps: 'i:qu', fut: 'querr', sub: 'quièr|quér', pp: 'quis', prp: 'quérant', impr: 'quiers quérons quérez' } },
  { tail: 'cueillir', model: 'cueillir', prefixes: ['', 'ac', 're'], irr: { pres: 'cueille cueilles cueille cueillons cueillez cueillent', impf: 'cueill', ps: 'i:cueill', fut: 'cueiller', sub: 'cueill', pp: 'cueilli', prp: 'cueillant' } },
  { tail: 'saillir', model: 'assaillir', prefixes: ['as', 'tres'], irr: { pres: 'saille sailles saille saillons saillez saillent', impf: 'saill', ps: 'i:saill', fut: 'saillir', sub: 'saill', pp: 'sailli', prp: 'saillant' } },
  { tail: 'bouillir', model: 'bouillir', prefixes: ['', 're'], irr: { pres: 'bous bous bout bouillons bouillez bouillent', impf: 'bouill', ps: 'i:bouill', fut: 'bouillir', sub: 'bouill', pp: 'bouilli', prp: 'bouillant', impr: 'bous bouillons bouillez' } },
  { tail: 'vêtir', model: 'vêtir', prefixes: ['', 'dé', 're', 'sur'], irr: { pres: 'vêts vêts vêt vêtons vêtez vêtent', impf: 'vêt', ps: 'i:vêt', fut: 'vêtir', sub: 'vêt', pp: 'vêtu', prp: 'vêtant', impr: 'vêts vêtons vêtez' } },
  { tail: 'courir', model: 'courir', prefixes: ['', 'ac', 'con', 'dis', 'en', 'par', 're', 'se'], any: ANY, irr: { pres: 'cours cours court courons courez courent', impf: 'cour', ps: 'u:cour', fut: 'courr', sub: 'cour', pp: 'couru', prp: 'courant', impr: 'cours courons courez' } },
  { tail: 'mourir', model: 'mourir', prefixes: [''], irr: { pres: 'meurs meurs meurt mourons mourez meurent', impf: 'mour', ps: 'u:mour', fut: 'mourr', sub: 'meur|mour', pp: 'mort', prp: 'mourant', impr: 'meurs mourons mourez', aux: 'être' } },
  { tail: 'partir', model: 'partir', prefixes: ['', 're'], irr: { pres: 'pars pars part partons partez partent', impf: 'part', ps: 'i:part', fut: 'partir', sub: 'part', pp: 'parti', prp: 'partant', impr: 'pars partons partez', aux: 'être' } },
  { tail: 'sortir', model: 'sortir', prefixes: [''], irr: { pres: 'sors sors sort sortons sortez sortent', impf: 'sort', ps: 'i:sort', fut: 'sortir', sub: 'sort', pp: 'sorti', prp: 'sortant', impr: 'sors sortons sortez', aux: 'both' } },
  { tail: 'sentir', model: 'sentir', prefixes: ['', 'con', 'pres', 'res', 'as'], irr: { pres: 'sens sens sent sentons sentez sentent', impf: 'sent', ps: 'i:sent', fut: 'sentir', sub: 'sent', pp: 'senti', prp: 'sentant', impr: 'sens sentons sentez' } },
  { tail: 'repentir', model: 'repentir', prefixes: [''], irr: { pres: 'repens repens repent repentons repentez repentent', impf: 'repent', ps: 'i:repent', fut: 'repentir', sub: 'repent', pp: 'repenti', prp: 'repentant', impr: 'repens repentons repentez' } },
  { tail: 'mentir', model: 'mentir', prefixes: ['', 'dé'], irr: { pres: 'mens mens ment mentons mentez mentent', impf: 'ment', ps: 'i:ment', fut: 'mentir', sub: 'ment', pp: '!menti', prp: 'mentant', impr: 'mens mentons mentez', variants: { dé: { pp: 'menti' } } } },
  { tail: 'dormir', model: 'dormir', prefixes: ['', 'en', 'ren'], irr: { pres: 'dors dors dort dormons dormez dorment', impf: 'dorm', ps: 'i:dorm', fut: 'dormir', sub: 'dorm', pp: '!dormi', prp: 'dormant', impr: 'dors dormons dormez', variants: { en: { pp: 'dormi' }, ren: { pp: 'dormi' } } } },
  { tail: 'servir', model: 'servir', prefixes: ['', 'des', 'res'], irr: { pres: 'sers sers sert servons servez servent', impf: 'serv', ps: 'i:serv', fut: 'servir', sub: 'serv', pp: 'servi', prp: 'servant', impr: 'sers servons servez' } },
  { tail: 'rir', model: 'ouvrir', prefixes: [], any: /^[a-zàâäçéèêëîïôöùûüœæ]+[vf]$/, irr: { pres: 're res re rons rez rent', impf: 'r', ps: 'i:r', fut: 'rir', sub: 'r', pp: 'ert', prp: 'rant', impr: 're rons rez' } },
  // --- venir, tenir ---
  {
    tail: 'venir', model: 'venir', prefixes: ['', 'de', 're', 'par', 'inter', 'sur', 'pro', 'rede', 'pré', 'con', 'contre', 'circon', 'sub', 'dis', 'sou'], any: ANY,
    irr: {
      pres: 'viens viens vient venons venez viennent', impf: 'ven', ps: 'in:v', fut: 'viendr', sub: 'vienn|ven', pp: 'venu', prp: 'venant', impr: 'viens venons venez', aux: 'être',
      // these take avoir (prévenir, convenir …)
      variants: Object.fromEntries(['pré', 'con', 'contre', 'circon', 'sub', 'dis'].map((p) => [p, { aux: undefined }])) as Record<string, Partial<Irr>>,
    },
  },
  { tail: 'tenir', model: 'tenir', prefixes: ['', 'ab', 'appar', 'con', 'dé', 'entre', 'main', 'ob', 're', 'sou'], any: ANY, irr: { pres: 'tiens tiens tient tenons tenez tiennent', impf: 'ten', ps: 'in:t', fut: 'tiendr', sub: 'tienn|ten', pp: 'tenu', prp: 'tenant', impr: 'tiens tenons tenez' } },
];

/** The family a lemma belongs to and its prefix, or undefined. `strict`: only attested prefixes (for guessing among unknown lemmas). */
export function familyOf(lemma: string, strict = false): { fam: Fam; prefix: string } | undefined {
  for (const fam of FAMILIES) {
    if (!lemma.endsWith(fam.tail)) continue;
    const prefix = lemma.slice(0, lemma.length - fam.tail.length);
    if (fam.prefixes.includes(prefix)) return { fam, prefix };
    // a family defined by its ending alone (every verb in -aindre, -eindre, -oindre, -uire, -crire, -vrir, -frir, -aître, -cevoir) needs no attested prefix
    if ((!strict || RULE_TAILS.has(fam.tail)) && fam.any && fam.any.test(prefix) && (prefix !== '' || fam.prefixes.includes(''))) return { fam, prefix };
  }
  return undefined;
}

const RULE_TAILS: ReadonlySet<string> = new Set(['aître', 'indre', 'ire', 'rir']);

/** Verbs whose perfect tenses are made with être, and those that take either (être without an object, avoir with one). */
export const ETRE_VERBS: ReadonlySet<string> = new Set([
  'aller', 'arriver', 'partir', 'repartir', 'rester', 'tomber', 'retomber', 'décéder', 'naître', 'renaître', 'mourir', 'venir', 'devenir', 'revenir', 'redevenir',
  'parvenir', 'intervenir', 'survenir', 'provenir', 'souvenir', 'advenir',
]);
export const BOTH_VERBS: ReadonlySet<string> = new Set([
  'monter', 'remonter', 'descendre', 'redescendre', 'sortir', 'rentrer', 'entrer', 'retourner', 'passer', 'repasser', 'demeurer', 'apparaître', 'disparaître', 'déchoir',
]);
