/**
 * The verbs whose whole paradigm is written out: sein, haben, werden, wissen, tun and the six modal verbs. Each
 * list of six runs ich, du, er/sie/es, wir, ihr, sie. `alt` adds further forms of one slot (older or less common).
 */
import type { Form } from './morph-util';

type Six = [string, string, string, string, string, string];

export interface Paradigm {
  inf: string;
  pres: Six;
  pret: Six;
  subj1: Six;
  subj2: Six;
  /** Imperative singular and plural; modal verbs have none. */
  imp?: [string, string];
  part: string;
  presPart?: string;
  alt?: Record<string, Form[]>;
}

const older = (form: string): Form => ({ form, older: true });
const plain = (...list: string[]): Form[] => list.map((form) => ({ form }));

export const IRREGULAR: Record<string, Paradigm> = {
  sein: {
    inf: 'sein',
    pres: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
    pret: ['war', 'warst', 'war', 'waren', 'wart', 'waren'],
    subj1: ['sei', 'seiest', 'sei', 'seien', 'seiet', 'seien'],
    subj2: ['wäre', 'wärest', 'wäre', 'wären', 'wäret', 'wären'],
    imp: ['sei', 'seid'],
    part: 'gewesen',
    presPart: 'seiend',
    alt: { 'subj1.2s': plain('seist'), 'subj2.2s': plain('wärst'), 'subj2.2p': plain('wärt') },
  },
  haben: {
    inf: 'haben',
    pres: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
    pret: ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'],
    subj1: ['habe', 'habest', 'habe', 'haben', 'habet', 'haben'],
    subj2: ['hätte', 'hättest', 'hätte', 'hätten', 'hättet', 'hätten'],
    imp: ['hab', 'habt'],
    part: 'gehabt',
    presPart: 'habend',
    alt: { 'imp.2s': plain('habe') },
  },
  werden: {
    inf: 'werden',
    pres: ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'],
    pret: ['wurde', 'wurdest', 'wurde', 'wurden', 'wurdet', 'wurden'],
    subj1: ['werde', 'werdest', 'werde', 'werden', 'werdet', 'werden'],
    subj2: ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'],
    imp: ['werde', 'werdet'],
    part: 'geworden',
    presPart: 'werdend',
    // worden is the participle of the passive auxiliary (ist gebaut worden); ward is the older preterite (Luther Bible)
    alt: { 'part.past': plain('worden'), 'pret.1s': [older('ward')], 'pret.3s': [older('ward')] },
  },
  wissen: {
    inf: 'wissen',
    pres: ['weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'],
    pret: ['wusste', 'wusstest', 'wusste', 'wussten', 'wusstet', 'wussten'],
    subj1: ['wisse', 'wissest', 'wisse', 'wissen', 'wisset', 'wissen'],
    subj2: ['wüsste', 'wüsstest', 'wüsste', 'wüssten', 'wüsstet', 'wüssten'],
    imp: ['wisse', 'wisst'],
    part: 'gewusst',
    presPart: 'wissend',
  },
  tun: {
    inf: 'tun',
    pres: ['tue', 'tust', 'tut', 'tun', 'tut', 'tun'],
    pret: ['tat', 'tatst', 'tat', 'taten', 'tatet', 'taten'],
    subj1: ['tue', 'tuest', 'tue', 'tuen', 'tuet', 'tuen'],
    subj2: ['täte', 'tätest', 'täte', 'täten', 'tätet', 'täten'],
    imp: ['tu', 'tut'],
    part: 'getan',
    presPart: 'tuend',
    alt: { 'pret.2s': plain('tatest'), 'imp.2s': plain('tue') },
  },
  können: {
    inf: 'können',
    pres: ['kann', 'kannst', 'kann', 'können', 'könnt', 'können'],
    pret: ['konnte', 'konntest', 'konnte', 'konnten', 'konntet', 'konnten'],
    subj1: ['könne', 'könnest', 'könne', 'können', 'könnet', 'können'],
    subj2: ['könnte', 'könntest', 'könnte', 'könnten', 'könntet', 'könnten'],
    part: 'gekonnt',
  },
  müssen: {
    inf: 'müssen',
    pres: ['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'],
    pret: ['musste', 'musstest', 'musste', 'mussten', 'musstet', 'mussten'],
    subj1: ['müsse', 'müssest', 'müsse', 'müssen', 'müsset', 'müssen'],
    subj2: ['müsste', 'müsstest', 'müsste', 'müssten', 'müsstet', 'müssten'],
    part: 'gemusst',
  },
  dürfen: {
    inf: 'dürfen',
    pres: ['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'],
    pret: ['durfte', 'durftest', 'durfte', 'durften', 'durftet', 'durften'],
    subj1: ['dürfe', 'dürfest', 'dürfe', 'dürfen', 'dürfet', 'dürfen'],
    subj2: ['dürfte', 'dürftest', 'dürfte', 'dürften', 'dürftet', 'dürften'],
    part: 'gedurft',
  },
  sollen: {
    inf: 'sollen',
    pres: ['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'],
    pret: ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'],
    subj1: ['solle', 'sollest', 'solle', 'sollen', 'sollet', 'sollen'],
    subj2: ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'],
    part: 'gesollt',
  },
  wollen: {
    inf: 'wollen',
    pres: ['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'],
    pret: ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'],
    subj1: ['wolle', 'wollest', 'wolle', 'wollen', 'wollet', 'wollen'],
    subj2: ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'],
    part: 'gewollt',
  },
  mögen: {
    inf: 'mögen',
    pres: ['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'],
    pret: ['mochte', 'mochtest', 'mochte', 'mochten', 'mochtet', 'mochten'],
    subj1: ['möge', 'mögest', 'möge', 'mögen', 'möget', 'mögen'],
    subj2: ['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'],
    part: 'gemocht',
  },
};

/** Verbs that serve as auxiliaries or modals: their participles are not offered as adjectives (das gekonnte …). */
export const NO_PARTICIPLE_ADJECTIVE = new Set(['sein', 'haben', 'werden', 'können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen']);
