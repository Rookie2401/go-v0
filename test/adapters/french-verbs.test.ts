/**
 * The French verb generator (MORPH package, docs/french/PLAN.md): paradigms of regular and irregular verbs, spelling changes of
 * the first group, defective verbs, compounds, auxiliaries. The expected forms are written from the standard conjugation tables;
 * machine-drafted, not checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { conjugateFrench } from '../../src/adapters/french/verbs';
import type { FrConjugation } from '../../src/adapters/french/types';

const forms = (c: FrConjugation, f: Record<string, string>): string[] =>
  c.forms.filter((x) => Object.entries(f).every(([k, v]) => x.morph[k] === v) && !(x as { note?: string }).note && !(x as { spelling?: string }).spelling).map((x) => x.form);
const fin = (c: FrConjugation, mood: string, tense: string | undefined, person: string, number: string) =>
  forms(c, { VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: person, Number: number });
const conj = (l: string): FrConjugation => { const c = conjugateFrench(l); if (!c) throw new Error(`no conjugation for ${l}`); return c; };
const present = (c: FrConjugation, p: string, n: string) => fin(c, 'Ind', 'Pres', p, n);
const ps = (c: FrConjugation, p: string, n: string) => fin(c, 'Ind', 'Past', p, n);
const fut = (c: FrConjugation, p: string, n: string) => fin(c, 'Ind', 'Fut', p, n);
const subP = (c: FrConjugation, p: string, n: string) => fin(c, 'Sub', 'Pres', p, n);
const subI = (c: FrConjugation, p: string, n: string) => fin(c, 'Sub', 'Imp', p, n);
/** The participe passé forms (the first is the masculine singular, or the only form of an invariable participle). */
const pp = (c: FrConjugation) => forms(c, { VerbForm: 'Part', Tense: 'Past' });

describe('regular verbs: the whole paradigm', () => {
  it('parler', () => {
    const c = conj('parler');
    expect(c.group).toBe('1');
    expect(c.aux).toBe('avoir');
    expect(c.listed).toBe(false);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => present(c, p, n)[0]))).toEqual(['parle', 'parlons', 'parles', 'parlez', 'parle', 'parlent']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => fin(c, 'Ind', 'Imp', p, n)[0]))).toEqual(['parlais', 'parlions', 'parlais', 'parliez', 'parlait', 'parlaient']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => ps(c, p, n)[0]))).toEqual(['parlai', 'parlâmes', 'parlas', 'parlâtes', 'parla', 'parlèrent']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => fut(c, p, n)[0]))).toEqual(['parlerai', 'parlerons', 'parleras', 'parlerez', 'parlera', 'parleront']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => fin(c, 'Cnd', 'Pres', p, n)[0]))).toEqual(['parlerais', 'parlerions', 'parlerais', 'parleriez', 'parlerait', 'parleraient']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => subP(c, p, n)[0]))).toEqual(['parle', 'parlions', 'parles', 'parliez', 'parle', 'parlent']);
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => subI(c, p, n)[0]))).toEqual(['parlasse', 'parlassions', 'parlasses', 'parlassiez', 'parlât', 'parlassent']);
    expect(forms(c, { VerbForm: 'Inf' })).toEqual(['parler']);
    expect(forms(c, { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['parlant']);
    expect(forms(c, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['parlé', 'parlée', 'parlés', 'parlées']);
  });

  it('the imperative: -er verbs lose the -s of the 2s, with the long form noted for en and y', () => {
    const c = conj('parler');
    expect(fin(c, 'Imp', undefined, '2', 'Sing')).toEqual(['parle']);
    expect(fin(c, 'Imp', undefined, '1', 'Plur')).toEqual(['parlons']);
    expect(fin(c, 'Imp', undefined, '2', 'Plur')).toEqual(['parlez']);
    const long = c.forms.filter((f) => f.morph.Mood === 'Imp' && (f as { note?: string }).note);
    expect(long.map((f) => f.form)).toEqual(['parles']);
    const aller = conj('aller');
    expect(fin(aller, 'Imp', undefined, '2', 'Sing')).toEqual(['va']);
    expect(aller.forms.filter((f) => (f as { note?: string }).note).map((f) => f.form)).toEqual(['vas']);
    // a verb whose 2s keeps its -s has no long form
    expect(conj('prendre').forms.some((f) => (f as { note?: string }).note)).toBe(false);
    expect(fin(conj('finir'), 'Imp', undefined, '2', 'Sing')).toEqual(['finis']);
  });

  it('finir (second group) and vendre (third group, -re)', () => {
    const f = conj('finir');
    expect(f.group).toBe('2');
    expect(present(f, '3', 'Sing')).toEqual(['finit']);
    expect(present(f, '1', 'Plur')).toEqual(['finissons']);
    expect(present(f, '3', 'Plur')).toEqual(['finissent']);
    expect(ps(f, '3', 'Sing')).toEqual(['finit']);
    expect(ps(f, '1', 'Plur')).toEqual(['finîmes']);
    expect(fut(f, '1', 'Sing')).toEqual(['finirai']);
    expect(subP(f, '3', 'Plur')).toEqual(['finissent']);
    expect(subI(f, '3', 'Sing')).toEqual(['finît']);
    expect(forms(f, { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['finissant']);
    expect(forms(f, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['fini', 'finie', 'finis', 'finies']);
    const v = conj('vendre');
    expect(v.group).toBe('3');
    expect(present(v, '1', 'Sing')).toEqual(['vends']);
    expect(present(v, '3', 'Sing')).toEqual(['vend']);
    expect(present(v, '1', 'Plur')).toEqual(['vendons']);
    expect(ps(v, '3', 'Sing')).toEqual(['vendit']);
    expect(fut(v, '1', 'Sing')).toEqual(['vendrai']);
    expect(subP(v, '3', 'Sing')).toEqual(['vende']);
    expect(forms(v, { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Sing' })).toEqual(['vendue']);
    for (const l of ['perdre', 'rendre', 'attendre', 'entendre', 'répondre', 'descendre', 'défendre', 'fondre', 'mordre', 'tordre']) {
      const c = conj(l);
      expect(present(c, '3', 'Sing')).toEqual([l.slice(0, -2)]);
      expect(fut(c, '1', 'Sing')).toEqual([l.slice(0, -1) + 'ai']);
      expect(pp(c)[0]).toBe(l.slice(0, -2) + 'u');
    }
  });
});

describe('first group: spelling changes', () => {
  it('manger and placer', () => {
    const m = conj('manger');
    expect(present(m, '1', 'Plur')).toEqual(['mangeons']);
    expect(fin(m, 'Ind', 'Imp', '1', 'Sing')).toEqual(['mangeais']);
    expect(fin(m, 'Ind', 'Imp', '1', 'Plur')).toEqual(['mangions']);
    expect(ps(m, '3', 'Sing')).toEqual(['mangea']);
    expect(ps(m, '3', 'Plur')).toEqual(['mangèrent']);
    expect(subI(m, '3', 'Sing')).toEqual(['mangeât']);
    expect(forms(m, { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['mangeant']);
    expect(pp(m)[0]).toBe('mangé');
    const p = conj('placer');
    expect(present(p, '1', 'Plur')).toEqual(['plaçons']);
    expect(fin(p, 'Ind', 'Imp', '3', 'Sing')).toEqual(['plaçait']);
    expect(ps(p, '3', 'Sing')).toEqual(['plaça']);
    expect(fin(p, 'Imp', undefined, '1', 'Plur')).toEqual(['plaçons']);
    expect(forms(p, { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['plaçant']);
    expect(present(p, '2', 'Plur')).toEqual(['placez']);
  });

  it('appeler and jeter double the consonant; acheter, geler, peler take the grave accent', () => {
    const a = conj('appeler');
    expect(present(a, '1', 'Sing')).toEqual(['appelle']);
    expect(present(a, '3', 'Plur')).toEqual(['appellent']);
    expect(present(a, '1', 'Plur')).toEqual(['appelons']);
    expect(fut(a, '1', 'Sing')).toEqual(['appellerai']);
    expect(fin(a, 'Cnd', 'Pres', '3', 'Sing')).toEqual(['appellerait']);
    expect(subP(a, '3', 'Sing')).toEqual(['appelle']);
    expect(subP(a, '1', 'Plur')).toEqual(['appelions']);
    expect(fin(a, 'Ind', 'Imp', '1', 'Sing')).toEqual(['appelais']);
    expect(pp(a)[0]).toBe('appelé');
    const j = conj('jeter');
    expect(present(j, '3', 'Sing')).toEqual(['jette']);
    expect(fut(j, '3', 'Plur')).toEqual(['jetteront']);
    expect(present(j, '2', 'Plur')).toEqual(['jetez']);
    expect(conj('rappeler').forms.some((f) => f.form === 'rappelle')).toBe(true);
    expect(conj('rejeter').forms.some((f) => f.form === 'rejette')).toBe(true);
    const h = conj('acheter');
    expect(present(h, '1', 'Sing')).toEqual(['achète']);
    expect(present(h, '1', 'Plur')).toEqual(['achetons']);
    expect(fut(h, '1', 'Sing')).toEqual(['achèterai']);
    expect(fin(h, 'Cnd', 'Pres', '1', 'Sing')).toEqual(['achèterais']);
    expect(subP(h, '3', 'Plur')).toEqual(['achètent']);
    expect(fin(h, 'Imp', undefined, '2', 'Sing')).toEqual(['achète']);
    for (const [l, p3] of [['geler', 'gèle'], ['peler', 'pèle'], ['modeler', 'modèle'], ['marteler', 'martèle'], ['harceler', 'harcèle'], ['déceler', 'décèle'], ['crocheter', 'crochète'], ['haleter', 'halète'], ['racheter', 'rachète']]) {
      expect(present(conj(l), '3', 'Sing')).toEqual([p3]);
    }
    // other -eler / -eter verbs double
    for (const [l, p3] of [['épeler', 'épelle'], ['renouveler', 'renouvelle'], ['étiqueter', 'étiquette'], ['feuilleter', 'feuillette'], ['ruisseler', 'ruisselle'], ['projeter', 'projette'], ['chanceler', 'chancelle']]) {
      expect(present(conj(l), '3', 'Sing')).toEqual([p3]);
    }
  });

  it('lever, mener, semer, peser take è; céder, espérer, préférer keep é before the future endings', () => {
    for (const [l, p1, f1] of [['lever', 'lève', 'lèverai'], ['mener', 'mène', 'mènerai'], ['semer', 'sème', 'sèmerai'], ['peser', 'pèse', 'pèserai'], ['enlever', 'enlève', 'enlèverai'], ['amener', 'amène', 'amènerai']]) {
      const c = conj(l);
      expect(present(c, '1', 'Sing')).toEqual([p1]);
      expect(fut(c, '1', 'Sing')).toEqual([f1]);
      expect(present(c, '1', 'Plur')).toEqual([l.slice(0, -2) + 'ons']);
    }
    const c = conj('céder');
    expect(present(c, '1', 'Sing')).toEqual(['cède']);
    expect(present(c, '3', 'Plur')).toEqual(['cèdent']);
    expect(present(c, '1', 'Plur')).toEqual(['cédons']);
    expect(fut(c, '1', 'Sing')).toEqual(['céderai']);
    expect(fin(c, 'Cnd', 'Pres', '3', 'Sing')).toEqual(['céderait']);
    expect(subP(c, '2', 'Sing')).toEqual(['cèdes']);
    expect(fin(c, 'Imp', undefined, '2', 'Sing')).toEqual(['cède']);
    // the 1990 spelling is a second, marked form
    const reform = c.forms.filter((f) => (f as { spelling?: string }).spelling === 'reform1990').map((f) => f.form);
    expect(reform).toContain('cèderai');
    expect(reform).not.toContain('cède');
    expect(present(conj('espérer'), '3', 'Sing')).toEqual(['espère']);
    expect(fut(conj('préférer'), '1', 'Sing')).toEqual(['préférerai']);
    expect(present(conj('protéger'), '1', 'Plur')).toEqual(['protégeons']);
    expect(present(conj('protéger'), '3', 'Sing')).toEqual(['protège']);
    expect(present(conj('régler'), '3', 'Sing')).toEqual(['règle']);
    expect(present(conj('répéter'), '1', 'Sing')).toEqual(['répète']);
    // -exer and -ener: not mistaken for the grave class
    expect(present(conj('sexer'), '3', 'Sing')).toEqual(['sexe']);
    expect(present(conj('annexer'), '3', 'Sing')).toEqual(['annexe']);
  });

  it('employer, essuyer, nettoyer: y becomes i before a silent e; payer has both', () => {
    const e = conj('employer');
    expect(present(e, '1', 'Sing')).toEqual(['emploie']);
    expect(present(e, '3', 'Plur')).toEqual(['emploient']);
    expect(present(e, '1', 'Plur')).toEqual(['employons']);
    expect(fut(e, '1', 'Sing')).toEqual(['emploierai']);
    expect(fin(e, 'Ind', 'Imp', '1', 'Plur')).toEqual(['employions']);
    expect(subP(e, '1', 'Plur')).toEqual(['employions']);
    expect(present(conj('essuyer'), '3', 'Sing')).toEqual(['essuie']);
    expect(fut(conj('nettoyer'), '1', 'Sing')).toEqual(['nettoierai']);
    const p = conj('payer');
    expect(present(p, '1', 'Sing')).toEqual(['paie', 'paye']);
    expect(present(p, '3', 'Plur')).toEqual(['paient', 'payent']);
    expect(present(p, '1', 'Plur')).toEqual(['payons']);
    expect(fut(p, '1', 'Sing')).toEqual(['paierai', 'payerai']);
    expect(present(conj('essayer'), '1', 'Sing')).toEqual(['essaie', 'essaye']);
    // -eyer keeps the y
    expect(present(conj('grasseyer'), '3', 'Sing')).toEqual(['grasseye']);
  });

  it('envoyer: enverrai; aller is irregular', () => {
    const e = conj('envoyer');
    expect(present(e, '1', 'Sing')).toEqual(['envoie']);
    expect(present(e, '1', 'Plur')).toEqual(['envoyons']);
    expect(fut(e, '1', 'Sing')).toEqual(['enverrai']);
    expect(fin(e, 'Cnd', 'Pres', '2', 'Plur')).toEqual(['enverriez']);
    expect(fut(conj('renvoyer'), '3', 'Sing')).toEqual(['renverra']);
    const a = conj('aller');
    expect(a.listed).toBe(true);
    expect(a.aux).toBe('être');
    expect(['1', '2', '3'].flatMap((p) => ['Sing', 'Plur'].map((n) => present(a, p, n)[0]))).toEqual(['vais', 'allons', 'vas', 'allez', 'va', 'vont']);
    expect(fut(a, '1', 'Sing')).toEqual(['irai']);
    expect(subP(a, '3', 'Sing')).toEqual(['aille']);
    expect(subP(a, '1', 'Plur')).toEqual(['allions']);
    expect(subI(a, '3', 'Sing')).toEqual(['allât']);
    expect(conj("s'en aller").aux).toBe('être');
    expect(present(conj("s'en aller"), '1', 'Sing')).toEqual(['vais']);
  });

  it('-ier, -uer, -éer, -guer verbs are regular', () => {
    expect(fin(conj('étudier'), 'Ind', 'Imp', '1', 'Plur')).toEqual(['étudiions']);
    expect(present(conj('étudier'), '3', 'Sing')).toEqual(['étudie']);
    expect(present(conj('créer'), '3', 'Sing')).toEqual(['crée']);
    expect(forms(conj('créer'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['créé', 'créée', 'créés', 'créées']);
    expect(present(conj('fatiguer'), '1', 'Plur')).toEqual(['fatiguons']);
    expect(present(conj('tuer'), '3', 'Plur')).toEqual(['tuent']);
  });
});

/** [lemma, [present 1s, 3s, 1p, 3p], passé simple 3s, futur 1s, subjonctif présent 3s, subjonctif imparfait 3s, participe passé] */
const IRREGULAR: Array<[string, [string, string, string, string], string, string, string, string, string]> = [
  ['être', ['suis', 'est', 'sommes', 'sont'], 'fut', 'serai', 'soit', 'fût', 'été'],
  ['avoir', ['ai', 'a', 'avons', 'ont'], 'eut', 'aurai', 'ait', 'eût', 'eu'],
  ['aller', ['vais', 'va', 'allons', 'vont'], 'alla', 'irai', 'aille', 'allât', 'allé'],
  ['faire', ['fais', 'fait', 'faisons', 'font'], 'fit', 'ferai', 'fasse', 'fît', 'fait'],
  ['dire', ['dis', 'dit', 'disons', 'disent'], 'dit', 'dirai', 'dise', 'dît', 'dit'],
  ['pouvoir', ['peux', 'peut', 'pouvons', 'peuvent'], 'put', 'pourrai', 'puisse', 'pût', 'pu'],
  ['vouloir', ['veux', 'veut', 'voulons', 'veulent'], 'voulut', 'voudrai', 'veuille', 'voulût', 'voulu'],
  ['savoir', ['sais', 'sait', 'savons', 'savent'], 'sut', 'saurai', 'sache', 'sût', 'su'],
  ['devoir', ['dois', 'doit', 'devons', 'doivent'], 'dut', 'devrai', 'doive', 'dût', 'dû'],
  ['venir', ['viens', 'vient', 'venons', 'viennent'], 'vint', 'viendrai', 'vienne', 'vînt', 'venu'],
  ['tenir', ['tiens', 'tient', 'tenons', 'tiennent'], 'tint', 'tiendrai', 'tienne', 'tînt', 'tenu'],
  ['prendre', ['prends', 'prend', 'prenons', 'prennent'], 'prit', 'prendrai', 'prenne', 'prît', 'pris'],
  ['mettre', ['mets', 'met', 'mettons', 'mettent'], 'mit', 'mettrai', 'mette', 'mît', 'mis'],
  ['voir', ['vois', 'voit', 'voyons', 'voient'], 'vit', 'verrai', 'voie', 'vît', 'vu'],
  ['croire', ['crois', 'croit', 'croyons', 'croient'], 'crut', 'croirai', 'croie', 'crût', 'cru'],
  ['recevoir', ['reçois', 'reçoit', 'recevons', 'reçoivent'], 'reçut', 'recevrai', 'reçoive', 'reçût', 'reçu'],
  ['apercevoir', ['aperçois', 'aperçoit', 'apercevons', 'aperçoivent'], 'aperçut', 'apercevrai', 'aperçoive', 'aperçût', 'aperçu'],
  ['concevoir', ['conçois', 'conçoit', 'concevons', 'conçoivent'], 'conçut', 'concevrai', 'conçoive', 'conçût', 'conçu'],
  ['décevoir', ['déçois', 'déçoit', 'décevons', 'déçoivent'], 'déçut', 'décevrai', 'déçoive', 'déçût', 'déçu'],
  ['percevoir', ['perçois', 'perçoit', 'percevons', 'perçoivent'], 'perçut', 'percevrai', 'perçoive', 'perçût', 'perçu'],
  ['connaître', ['connais', 'connaît', 'connaissons', 'connaissent'], 'connut', 'connaîtrai', 'connaisse', 'connût', 'connu'],
  ['paraître', ['parais', 'paraît', 'paraissons', 'paraissent'], 'parut', 'paraîtrai', 'paraisse', 'parût', 'paru'],
  ['naître', ['nais', 'naît', 'naissons', 'naissent'], 'naquit', 'naîtrai', 'naisse', 'naquît', 'né'],
  ['partir', ['pars', 'part', 'partons', 'partent'], 'partit', 'partirai', 'parte', 'partît', 'parti'],
  ['sortir', ['sors', 'sort', 'sortons', 'sortent'], 'sortit', 'sortirai', 'sorte', 'sortît', 'sorti'],
  ['dormir', ['dors', 'dort', 'dormons', 'dorment'], 'dormit', 'dormirai', 'dorme', 'dormît', 'dormi'],
  ['servir', ['sers', 'sert', 'servons', 'servent'], 'servit', 'servirai', 'serve', 'servît', 'servi'],
  ['sentir', ['sens', 'sent', 'sentons', 'sentent'], 'sentit', 'sentirai', 'sente', 'sentît', 'senti'],
  ['mentir', ['mens', 'ment', 'mentons', 'mentent'], 'mentit', 'mentirai', 'mente', 'mentît', 'menti'],
  ['ouvrir', ['ouvre', 'ouvre', 'ouvrons', 'ouvrent'], 'ouvrit', 'ouvrirai', 'ouvre', 'ouvrît', 'ouvert'],
  ['offrir', ['offre', 'offre', 'offrons', 'offrent'], 'offrit', 'offrirai', 'offre', 'offrît', 'offert'],
  ['souffrir', ['souffre', 'souffre', 'souffrons', 'souffrent'], 'souffrit', 'souffrirai', 'souffre', 'souffrît', 'souffert'],
  ['couvrir', ['couvre', 'couvre', 'couvrons', 'couvrent'], 'couvrit', 'couvrirai', 'couvre', 'couvrît', 'couvert'],
  ['cueillir', ['cueille', 'cueille', 'cueillons', 'cueillent'], 'cueillit', 'cueillerai', 'cueille', 'cueillît', 'cueilli'],
  ['courir', ['cours', 'court', 'courons', 'courent'], 'courut', 'courrai', 'coure', 'courût', 'couru'],
  ['mourir', ['meurs', 'meurt', 'mourons', 'meurent'], 'mourut', 'mourrai', 'meure', 'mourût', 'mort'],
  ['vivre', ['vis', 'vit', 'vivons', 'vivent'], 'vécut', 'vivrai', 'vive', 'vécût', 'vécu'],
  ['suivre', ['suis', 'suit', 'suivons', 'suivent'], 'suivit', 'suivrai', 'suive', 'suivît', 'suivi'],
  ['écrire', ['écris', 'écrit', 'écrivons', 'écrivent'], 'écrivit', 'écrirai', 'écrive', 'écrivît', 'écrit'],
  ['lire', ['lis', 'lit', 'lisons', 'lisent'], 'lut', 'lirai', 'lise', 'lût', 'lu'],
  ['boire', ['bois', 'boit', 'buvons', 'boivent'], 'but', 'boirai', 'boive', 'bût', 'bu'],
  ['plaire', ['plais', 'plaît', 'plaisons', 'plaisent'], 'plut', 'plairai', 'plaise', 'plût', 'plu'],
  ['taire', ['tais', 'tait', 'taisons', 'taisent'], 'tut', 'tairai', 'taise', 'tût', 'tu'],
  ['craindre', ['crains', 'craint', 'craignons', 'craignent'], 'craignit', 'craindrai', 'craigne', 'craignît', 'craint'],
  ['plaindre', ['plains', 'plaint', 'plaignons', 'plaignent'], 'plaignit', 'plaindrai', 'plaigne', 'plaignît', 'plaint'],
  ['peindre', ['peins', 'peint', 'peignons', 'peignent'], 'peignit', 'peindrai', 'peigne', 'peignît', 'peint'],
  ['atteindre', ['atteins', 'atteint', 'atteignons', 'atteignent'], 'atteignit', 'atteindrai', 'atteigne', 'atteignît', 'atteint'],
  ['éteindre', ['éteins', 'éteint', 'éteignons', 'éteignent'], 'éteignit', 'éteindrai', 'éteigne', 'éteignît', 'éteint'],
  ['joindre', ['joins', 'joint', 'joignons', 'joignent'], 'joignit', 'joindrai', 'joigne', 'joignît', 'joint'],
  ['conduire', ['conduis', 'conduit', 'conduisons', 'conduisent'], 'conduisit', 'conduirai', 'conduise', 'conduisît', 'conduit'],
  ['produire', ['produis', 'produit', 'produisons', 'produisent'], 'produisit', 'produirai', 'produise', 'produisît', 'produit'],
  ['construire', ['construis', 'construit', 'construisons', 'construisent'], 'construisit', 'construirai', 'construise', 'construisît', 'construit'],
  ['détruire', ['détruis', 'détruit', 'détruisons', 'détruisent'], 'détruisit', 'détruirai', 'détruise', 'détruisît', 'détruit'],
  ['traduire', ['traduis', 'traduit', 'traduisons', 'traduisent'], 'traduisit', 'traduirai', 'traduise', 'traduisît', 'traduit'],
  ['cuire', ['cuis', 'cuit', 'cuisons', 'cuisent'], 'cuisit', 'cuirai', 'cuise', 'cuisît', 'cuit'],
  ['nuire', ['nuis', 'nuit', 'nuisons', 'nuisent'], 'nuisit', 'nuirai', 'nuise', 'nuisît', 'nui'],
  ['rire', ['ris', 'rit', 'rions', 'rient'], 'rit', 'rirai', 'rie', 'rît', 'ri'],
  ['sourire', ['souris', 'sourit', 'sourions', 'sourient'], 'sourit', 'sourirai', 'sourie', 'sourît', 'souri'],
  ['valoir', ['vaux', 'vaut', 'valons', 'valent'], 'valut', 'vaudrai', 'vaille', 'valût', 'valu'],
  ['battre', ['bats', 'bat', 'battons', 'battent'], 'battit', 'battrai', 'batte', 'battît', 'battu'],
  ['vaincre', ['vaincs', 'vainc', 'vainquons', 'vainquent'], 'vainquit', 'vaincrai', 'vainque', 'vainquît', 'vaincu'],
  ['convaincre', ['convaincs', 'convainc', 'convainquons', 'convainquent'], 'convainquit', 'convaincrai', 'convainque', 'convainquît', 'convaincu'],
  ['résoudre', ['résous', 'résout', 'résolvons', 'résolvent'], 'résolut', 'résoudrai', 'résolve', 'résolût', 'résolu'],
  ['coudre', ['couds', 'coud', 'cousons', 'cousent'], 'cousit', 'coudrai', 'couse', 'cousît', 'cousu'],
  ['moudre', ['mouds', 'moud', 'moulons', 'moulent'], 'moulut', 'moudrai', 'moule', 'moulût', 'moulu'],
  ['conclure', ['conclus', 'conclut', 'concluons', 'concluent'], 'conclut', 'conclurai', 'conclue', 'conclût', 'conclu'],
  ['exclure', ['exclus', 'exclut', 'excluons', 'excluent'], 'exclut', 'exclurai', 'exclue', 'exclût', 'exclu'],
  ['inclure', ['inclus', 'inclut', 'incluons', 'incluent'], 'inclut', 'inclurai', 'inclue', 'inclût', 'inclus'],
  ['fuir', ['fuis', 'fuit', 'fuyons', 'fuient'], 'fuit', 'fuirai', 'fuie', 'fuît', 'fui'],
  ['haïr', ['hais', 'hait', 'haïssons', 'haïssent'], 'haït', 'haïrai', 'haïsse', 'haït', 'haï'],
  ['acquérir', ['acquiers', 'acquiert', 'acquérons', 'acquièrent'], 'acquit', 'acquerrai', 'acquière', 'acquît', 'acquis'],
  ['conquérir', ['conquiers', 'conquiert', 'conquérons', 'conquièrent'], 'conquit', 'conquerrai', 'conquière', 'conquît', 'conquis'],
  ['bouillir', ['bous', 'bout', 'bouillons', 'bouillent'], 'bouillit', 'bouillirai', 'bouille', 'bouillît', 'bouilli'],
  ['vêtir', ['vêts', 'vêt', 'vêtons', 'vêtent'], 'vêtit', 'vêtirai', 'vête', 'vêtît', 'vêtu'],
  ['croître', ['croîs', 'croît', 'croissons', 'croissent'], 'crût', 'croîtrai', 'croisse', 'crût', 'crû'],
  ['rompre', ['romps', 'rompt', 'rompons', 'rompent'], 'rompit', 'romprai', 'rompe', 'rompît', 'rompu'],
  ['interrompre', ['interromps', 'interrompt', 'interrompons', 'interrompent'], 'interrompit', 'interromprai', 'interrompe', 'interrompît', 'interrompu'],
  ['suffire', ['suffis', 'suffit', 'suffisons', 'suffisent'], 'suffit', 'suffirai', 'suffise', 'suffît', 'suffi'],
  ['mouvoir', ['meus', 'meut', 'mouvons', 'meuvent'], 'mut', 'mouvrai', 'meuve', 'mût', 'mû'],
  ['maudire', ['maudis', 'maudit', 'maudissons', 'maudissent'], 'maudit', 'maudirai', 'maudisse', 'maudît', 'maudit'],
  ['pourvoir', ['pourvois', 'pourvoit', 'pourvoyons', 'pourvoient'], 'pourvut', 'pourvoirai', 'pourvoie', 'pourvût', 'pourvu'],
  // compounds
  ['revenir', ['reviens', 'revient', 'revenons', 'reviennent'], 'revint', 'reviendrai', 'revienne', 'revînt', 'revenu'],
  ['devenir', ['deviens', 'devient', 'devenons', 'deviennent'], 'devint', 'deviendrai', 'devienne', 'devînt', 'devenu'],
  ['obtenir', ['obtiens', 'obtient', 'obtenons', 'obtiennent'], 'obtint', 'obtiendrai', 'obtienne', 'obtînt', 'obtenu'],
  ['comprendre', ['comprends', 'comprend', 'comprenons', 'comprennent'], 'comprit', 'comprendrai', 'comprenne', 'comprît', 'compris'],
  ['permettre', ['permets', 'permet', 'permettons', 'permettent'], 'permit', 'permettrai', 'permette', 'permît', 'permis'],
  ['revoir', ['revois', 'revoit', 'revoyons', 'revoient'], 'revit', 'reverrai', 'revoie', 'revît', 'revu'],
  ['entrevoir', ['entrevois', 'entrevoit', 'entrevoyons', 'entrevoient'], 'entrevit', 'entreverrai', 'entrevoie', 'entrevît', 'entrevu'],
  ['prévoir', ['prévois', 'prévoit', 'prévoyons', 'prévoient'], 'prévit', 'prévoirai', 'prévoie', 'prévît', 'prévu'],
  ['reconnaître', ['reconnais', 'reconnaît', 'reconnaissons', 'reconnaissent'], 'reconnut', 'reconnaîtrai', 'reconnaisse', 'reconnût', 'reconnu'],
  ['apparaître', ['apparais', 'apparaît', 'apparaissons', 'apparaissent'], 'apparut', 'apparaîtrai', 'apparaisse', 'apparût', 'apparu'],
  ['décrire', ['décris', 'décrit', 'décrivons', 'décrivent'], 'décrivit', 'décrirai', 'décrive', 'décrivît', 'décrit'],
  ['relire', ['relis', 'relit', 'relisons', 'relisent'], 'relut', 'relirai', 'relise', 'relût', 'relu'],
  ['élire', ['élis', 'élit', 'élisons', 'élisent'], 'élut', 'élirai', 'élise', 'élût', 'élu'],
  ['satisfaire', ['satisfais', 'satisfait', 'satisfaisons', 'satisfont'], 'satisfit', 'satisferai', 'satisfasse', 'satisfît', 'satisfait'],
  ['défaire', ['défais', 'défait', 'défaisons', 'défont'], 'défit', 'déferai', 'défasse', 'défît', 'défait'],
  ['contredire', ['contredis', 'contredit', 'contredisons', 'contredisent'], 'contredit', 'contredirai', 'contredise', 'contredît', 'contredit'],
  ['interdire', ['interdis', 'interdit', 'interdisons', 'interdisent'], 'interdit', 'interdirai', 'interdise', 'interdît', 'interdit'],
  ['prédire', ['prédis', 'prédit', 'prédisons', 'prédisent'], 'prédit', 'prédirai', 'prédise', 'prédît', 'prédit'],
  ['redire', ['redis', 'redit', 'redisons', 'redisent'], 'redit', 'redirai', 'redise', 'redît', 'redit'],
  ['recourir', ['recours', 'recourt', 'recourons', 'recourent'], 'recourut', 'recourrai', 'recoure', 'recourût', 'recouru'],
  ['survivre', ['survis', 'survit', 'survivons', 'survivent'], 'survécut', 'survivrai', 'survive', 'survécût', 'survécu'],
  ['poursuivre', ['poursuis', 'poursuit', 'poursuivons', 'poursuivent'], 'poursuivit', 'poursuivrai', 'poursuive', 'poursuivît', 'poursuivi'],
  ['combattre', ['combats', 'combat', 'combattons', 'combattent'], 'combattit', 'combattrai', 'combatte', 'combattît', 'combattu'],
  ['accueillir', ['accueille', 'accueille', 'accueillons', 'accueillent'], 'accueillit', 'accueillerai', 'accueille', 'accueillît', 'accueilli'],
  ['découvrir', ['découvre', 'découvre', 'découvrons', 'découvrent'], 'découvrit', 'découvrirai', 'découvre', 'découvrît', 'découvert'],
  ['endormir', ['endors', 'endort', 'endormons', 'endorment'], 'endormit', 'endormirai', 'endorme', 'endormît', 'endormi'],
  ['rejoindre', ['rejoins', 'rejoint', 'rejoignons', 'rejoignent'], 'rejoignit', 'rejoindrai', 'rejoigne', 'rejoignît', 'rejoint'],
  ['émouvoir', ['émeus', 'émeut', 'émouvons', 'émeuvent'], 'émut', 'émouvrai', 'émeuve', 'émût', 'ému'],
  ['promouvoir', ['promeus', 'promeut', 'promouvons', 'promeuvent'], 'promut', 'promouvrai', 'promeuve', 'promût', 'promu'],
  ['prévaloir', ['prévaux', 'prévaut', 'prévalons', 'prévalent'], 'prévalut', 'prévaudrai', 'prévale', 'prévalût', 'prévalu'],
  ['déchoir', ['déchois', 'déchoit', 'déchoyons', 'déchoient'], 'déchut', 'déchoirai', 'déchoie', 'déchût', 'déchu'],
];

describe('irregular verbs and their compounds', () => {
  for (const [lemma, [p1, p3, p1p, p3p], ps3, f1, sub3, subi3, part] of IRREGULAR) {
    it(lemma, () => {
      const c = conj(lemma);
      expect(c.listed, `${lemma} listed`).toBe(true);
      expect(present(c, '1', 'Sing'), 'present 1s').toContain(p1);
      expect(present(c, '3', 'Sing'), 'present 3s').toContain(p3);
      expect(present(c, '1', 'Plur'), 'present 1p').toContain(p1p);
      expect(present(c, '3', 'Plur'), 'present 3p').toContain(p3p);
      expect(ps(c, '3', 'Sing'), 'passé simple 3s').toContain(ps3);
      expect(fut(c, '1', 'Sing'), 'futur 1s').toContain(f1);
      expect(subP(c, '3', 'Sing'), 'subjonctif présent 3s').toContain(sub3);
      expect(subI(c, '3', 'Sing'), 'subjonctif imparfait 3s').toContain(subi3);
      expect(pp(c), 'participe passé').toContain(part);
    });
  }

  it('every verb of the table has an infinitive, a present participle (but defectives), the participe passé in four forms or one', () => {
    for (const [lemma] of IRREGULAR) {
      const c = conj(lemma);
      expect(forms(c, { VerbForm: 'Inf' })).toEqual([lemma]);
      const past = forms(c, { VerbForm: 'Part', Tense: 'Past' });
      expect([1, 4]).toContain(new Set(past).size === 1 ? 1 : past.length >= 4 ? 4 : past.length);
      expect(forms(c, { VerbForm: 'Part', Tense: 'Pres' }).length, `${lemma} participe présent`).toBeGreaterThan(c.defective ? -1 : 0);
    }
  });

  it('participe passé agreement: pris, dû, mû, né, été, pu', () => {
    expect(forms(conj('prendre'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['pris', 'prise', 'pris', 'prises']);
    expect(forms(conj('devoir'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['dû', 'due', 'dus', 'dues']);
    expect(forms(conj('mouvoir'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['mû', 'mue', 'mus', 'mues']);
    expect(forms(conj('naître'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['né', 'née', 'nés', 'nées']);
    expect(forms(conj('être'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['été']);
    expect(forms(conj('pouvoir'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['pu']);
    expect(forms(conj('rire'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['ri']);
    expect(forms(conj('suffire'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['suffi']);
    expect(forms(conj('croître'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['crû', 'crue', 'crus', 'crues']);
    expect(forms(conj('accroître'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['accru', 'accrue', 'accrus', 'accrues']);
    expect(forms(conj('inclure'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['inclus', 'incluse', 'inclus', 'incluses']);
    expect(forms(conj('écrire'), { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' })).toEqual(['écrites']);
    expect(forms(conj('absoudre'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['absous', 'absoute', 'absous', 'absoutes']);
    expect(forms(conj('émouvoir'), { VerbForm: 'Part', Tense: 'Past' })).toEqual(['ému', 'émue', 'émus', 'émues']);
  });

  it('prefixes: redites against contredisez, prévoirai against verrai, pourvus, convaincre', () => {
    expect(present(conj('redire'), '2', 'Plur')).toEqual(['redites']);
    expect(present(conj('dire'), '2', 'Plur')).toEqual(['dites']);
    expect(present(conj('contredire'), '2', 'Plur')).toEqual(['contredisez']);
    expect(present(conj('interdire'), '2', 'Plur')).toEqual(['interdisez']);
    expect(present(conj('prédire'), '2', 'Plur')).toEqual(['prédisez']);
    expect(present(conj('maudire'), '2', 'Plur')).toEqual(['maudissez']);
    expect(present(conj('satisfaire'), '2', 'Plur')).toEqual(['satisfaites']);
    expect(fut(conj('voir'), '1', 'Sing')).toEqual(['verrai']);
    expect(fut(conj('prévoir'), '1', 'Sing')).toEqual(['prévoirai']);
    expect(fin(conj('prévoir'), 'Cnd', 'Pres', '1', 'Sing')).toEqual(['prévoirais']);
    expect(ps(conj('pourvoir'), '1', 'Sing')).toEqual(['pourvus']);
    expect(fut(conj('pourvoir'), '1', 'Sing')).toEqual(['pourvoirai']);
    expect(present(conj('vaincre'), '3', 'Sing')).toEqual(['vainc']);
    expect(present(conj('vaincre'), '1', 'Plur')).toEqual(['vainquons']);
    expect(ps(conj('mourir'), '1', 'Sing')).toEqual(['mourus']);
  });

  it('passé simple 1p / 2p and subjonctif imparfait 3s carry their circumflex', () => {
    expect(ps(conj('venir'), '1', 'Plur')).toEqual(['vînmes']);
    expect(ps(conj('venir'), '2', 'Plur')).toEqual(['vîntes']);
    expect(ps(conj('venir'), '3', 'Plur')).toEqual(['vinrent']);
    expect(ps(conj('être'), '1', 'Plur')).toEqual(['fûmes']);
    expect(ps(conj('avoir'), '1', 'Plur')).toEqual(['eûmes']);
    expect(subI(conj('être'), '1', 'Sing')).toEqual(['fusse']);
    expect(subI(conj('avoir'), '3', 'Sing')).toEqual(['eût']);
    expect(subI(conj('parler'), '3', 'Sing')).toEqual(['parlât']);
    expect(subI(conj('finir'), '3', 'Sing')).toEqual(['finît']);
    expect(subI(conj('haïr'), '3', 'Sing')).toEqual(['haït']);
    expect(ps(conj('haïr'), '1', 'Plur')).toEqual(['haïmes']);
    expect(forms(conj('haïr'), { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['haïssant']);
  });

  it('alternatives: pouvoir (peux / puis), vouloir (veux / veuille imperative), asseoir (assieds / assois)', () => {
    expect(present(conj('pouvoir'), '1', 'Sing')).toEqual(['peux', 'puis']);
    expect(fin(conj('vouloir'), 'Imp', undefined, '2', 'Sing')).toEqual(['veux', 'veuille']);
    expect(fin(conj('vouloir'), 'Imp', undefined, '2', 'Plur')).toEqual(['voulez', 'veuillez']);
    const a = conj('asseoir');
    expect(present(a, '1', 'Sing')).toEqual(['assieds', 'assois']);
    expect(present(a, '3', 'Sing')).toEqual(['assied', 'assoit']);
    expect(present(a, '1', 'Plur')).toEqual(['asseyons', 'assoyons']);
    expect(fut(a, '1', 'Sing')).toEqual(['assiérai', 'assoirai']);
    expect(ps(a, '3', 'Sing')).toEqual(['assit']);
    expect(forms(a, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['assis', 'assise', 'assis', 'assises']);
    expect(present(conj('rasseoir'), '3', 'Sing')).toEqual(['rassied', 'rassoit']);
    expect(present(conj('surseoir'), '3', 'Sing')).toEqual(['sursoit']);
  });

  it('defective verbs: falloir, pleuvoir, clore, gésir, déchoir, absoudre, distraire, luire', () => {
    const f = conj('falloir');
    expect(f.defective).toBeTruthy();
    expect(present(f, '3', 'Sing')).toEqual(['faut']);
    expect(present(f, '1', 'Sing')).toEqual([]);
    expect(present(f, '3', 'Plur')).toEqual([]);
    expect(fin(f, 'Ind', 'Imp', '3', 'Sing')).toEqual(['fallait']);
    expect(ps(f, '3', 'Sing')).toEqual(['fallut']);
    expect(fut(f, '3', 'Sing')).toEqual(['faudra']);
    expect(fin(f, 'Cnd', 'Pres', '3', 'Sing')).toEqual(['faudrait']);
    expect(subP(f, '3', 'Sing')).toEqual(['faille']);
    expect(subI(f, '3', 'Sing')).toEqual(['fallût']);
    expect(forms(f, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['fallu']);
    expect(forms(f, { Mood: 'Imp' })).toEqual([]);
    const p = conj('pleuvoir');
    expect(present(p, '3', 'Sing')).toEqual(['pleut']);
    expect(present(p, '3', 'Plur')).toEqual(['pleuvent']);
    expect(present(p, '1', 'Sing')).toEqual([]);
    expect(fut(p, '3', 'Sing')).toEqual(['pleuvra']);
    expect(forms(p, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['plu']);
    const c = conj('clore');
    expect(present(c, '3', 'Sing')).toEqual(['clôt']);
    expect(fin(c, 'Ind', 'Imp', '3', 'Sing')).toEqual([]);
    expect(ps(c, '3', 'Sing')).toEqual([]);
    const g = conj('gésir');
    expect(present(g, '3', 'Sing')).toEqual(['gît']);
    expect(fin(g, 'Ind', 'Imp', '3', 'Sing')).toEqual(['gisait']);
    expect(forms(g, { VerbForm: 'Part', Tense: 'Pres' })).toEqual(['gisant']);
    expect(fin(conj('déchoir'), 'Ind', 'Imp', '3', 'Sing')).toEqual([]);
    expect(ps(conj('absoudre'), '3', 'Sing')).toEqual([]);
    expect(ps(conj('distraire'), '3', 'Sing')).toEqual([]);
    expect(present(conj('distraire'), '1', 'Plur')).toEqual(['distrayons']);
    expect(ps(conj('luire'), '3', 'Sing')).toEqual([]);
    expect(present(conj('extraire'), '3', 'Plur')).toEqual(['extraient']);
    expect(present(conj('soustraire'), '3', 'Sing')).toEqual(['soustrait']);
    expect(present(conj('abstraire'), '1', 'Sing')).toEqual(['abstrais']);
  });
});

describe('-ir verbs: second group against third group', () => {
  it('an -ir verb no table lists is second-group; the listed third-group verbs are not', () => {
    for (const l of ['finir', 'choisir', 'réussir', 'grandir', 'bâtir', 'remplir', 'obéir', 'unir']) {
      const c = conj(l);
      expect(c.group, l).toBe('2');
      expect(c.listed, l).toBe(false);
      expect(present(c, '1', 'Plur'), l).toEqual([l.slice(0, -2) + 'issons']);
    }
    for (const l of ['partir', 'sortir', 'dormir', 'sentir', 'servir', 'mentir', 'ouvrir', 'offrir', 'souffrir', 'couvrir', 'cueillir', 'venir', 'tenir', 'courir', 'mourir', 'acquérir', 'fuir', 'bouillir', 'vêtir', 'haïr']) {
      const c = conj(l);
      expect(c.group, l).toBe('3');
      expect(c.listed, l).toBe(true);
      expect(present(c, '1', 'Plur'), l).not.toEqual([l.slice(0, -2) + 'issons']);
    }
    expect(present(conj('haïr'), '1', 'Plur')).toEqual(['haïssons']); // haïr keeps -iss- and its diaeresis, but is listed
    expect(present(conj('haïr'), '3', 'Sing')).toEqual(['hait']);
  });

  it('a third-group -er is not invented; non-verbs give nothing', () => {
    expect(conjugateFrench('table')).toBeUndefined();
    expect(conjugateFrench('xyz')).toBeUndefined();
    expect(conjugateFrench('chat')).toBeUndefined();
    expect(conjugateFrench('')).toBeUndefined();
  });
});

describe('auxiliary, group, model', () => {
  it('aux', () => {
    for (const l of ['aller', 'venir', 'devenir', 'revenir', 'parvenir', 'intervenir', 'survenir', 'arriver', 'partir', 'repartir', 'rester', 'tomber', 'naître', 'mourir', 'décéder']) expect(conj(l).aux, l).toBe('être');
    for (const l of ['monter', 'descendre', 'sortir', 'rentrer', 'retourner', 'passer', 'entrer']) expect(conj(l).aux, l).toBe('both');
    for (const l of ['parler', 'finir', 'avoir', 'être', 'prévenir', 'convenir', 'tenir', 'faire', 'prendre', 'manger']) expect(conj(l).aux, l).toBe('avoir');
    expect(conj('apparaître').aux).toBe('both');
  });

  it('model and group', () => {
    expect(conj('comprendre').model).toBe('conjugated like prendre');
    expect(conj('prendre').model).toBeUndefined();
    expect(conj('revenir').model).toBe('conjugated like venir');
    expect(conj('conduire').listed).toBe(true);
    expect(conj('parler').model).toBeUndefined();
    expect(conj('manger').group).toBe('1');
    expect(conj('vendre').group).toBe('3');
    expect(conj('être').group).toBe('3');
  });

  it('a pronominal verb is conjugated as its base, with être', () => {
    const c = conj('se souvenir');
    expect(c.aux).toBe('être');
    expect(present(c, '1', 'Sing')).toEqual(['souviens']);
    expect(fut(conj("s'enfuir"), '1', 'Sing')).toEqual(['enfuirai']);
    expect(present(conj('se laver'), '3', 'Plur')).toEqual(['lavent']);
  });
});

describe('1990 spellings and variants of use are marked, never the only form', () => {
  it('connait, paraitre, plait, épèle', () => {
    const c = conj('connaître');
    expect(present(c, '3', 'Sing')).toEqual(['connaît']);
    const reform = c.forms.filter((f) => (f as { spelling?: string }).spelling === 'reform1990').map((f) => f.form);
    expect(reform).toContain('connait');
    expect(reform).toContain('connaitrai');
    expect(conj('paraitre').forms.some((f) => f.form === 'parait')).toBe(true);
    expect(conj('plaire').forms.some((f) => f.form === 'plait' && (f as { spelling?: string }).spelling === 'reform1990')).toBe(true);
    const e = conj('épeler');
    expect(present(e, '3', 'Sing')).toEqual(['épelle']);
    expect(e.forms.some((f) => f.form === 'épèle' && (f as { spelling?: string }).spelling === 'reform1990')).toBe(true);
    // appeler and jeter keep the doubling: no reform form
    expect(conj('appeler').forms.some((f) => (f as { spelling?: string }).spelling)).toBe(false);
    expect(conj('jeter').forms.some((f) => (f as { spelling?: string }).spelling)).toBe(false);
  });
});

describe('invariants over a wide sample of lemmas', () => {
  const sample = ['parler', 'finir', 'vendre', 'manger', 'placer', 'appeler', 'acheter', 'céder', 'employer', 'payer', 'envoyer', ...IRREGULAR.map((r) => r[0]), 'être', 'avoir', 'aller', 'falloir', 'pleuvoir'];
  it('every form is a non-empty lower-case word with a valid cell, and no cell repeats a form', () => {
    for (const l of new Set(sample)) {
      const c = conj(l);
      const seen = new Set<string>();
      for (const f of c.forms) {
        expect(f.form, `${l}: ${JSON.stringify(f)}`).toMatch(/^[a-zàâäçéèêëîïôöùûüœæ]+$/);
        expect(['Fin', 'Inf', 'Part']).toContain(f.morph.VerbForm);
        const key = `${f.form}|${JSON.stringify(f.morph)}|${(f as { note?: string }).note ?? ''}`;
        expect(seen.has(key), `${l}: duplicate ${key}`).toBe(false);
        seen.add(key);
        if (f.morph.VerbForm === 'Fin') {
          expect(['Ind', 'Sub', 'Imp', 'Cnd']).toContain(f.morph.Mood);
          if (f.morph.Mood === 'Imp') expect(f.morph.Tense).toBeUndefined();
          else expect(['Pres', 'Imp', 'Past', 'Fut']).toContain(f.morph.Tense);
          expect(['1', '2', '3']).toContain(f.morph.Person);
          expect(['Sing', 'Plur']).toContain(f.morph.Number);
        }
      }
    }
  });
});
