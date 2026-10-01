/**
 * The varieties of Spanish the adapter can label (see core/variety.ts for how a course uses them). The active target
 * of the Honduran course is es-HN inside es-CA and es-419; voseo is an active feature of it. A form of Spain
 * (es-ES, vosotros) or of older Spanish (es-hist) is recognised and labelled, never suppressed.
 */
import type { Variety } from '../../core';

export const ES_VARIETIES: Readonly<Record<string, Variety>> = {
  'es-419': { code: 'es-419', label: 'Latin America (general)', kind: 'supranational', note: 'Ordinary usage across Latin America; the wider region Honduras belongs to.' },
  'es-CA': { code: 'es-CA', label: 'Central America', kind: 'regional', parent: 'es-419', note: 'Usage shared by the Central American countries, Honduras among them.' },
  'es-HN': { code: 'es-HN', label: 'Honduras', kind: 'national', parent: 'es-CA' },
  'es-MX': { code: 'es-MX', label: 'Mexico', kind: 'national', parent: 'es-419' },
  'es-CAR': { code: 'es-CAR', label: 'Caribbean', kind: 'regional', parent: 'es-419', note: 'The Spanish of the islands and the Caribbean coasts.' },
  'es-AND': { code: 'es-AND', label: 'Andean', kind: 'regional', parent: 'es-419', note: 'The Spanish of the Andes and the Pacific coast of South America.' },
  'es-AR': { code: 'es-AR', label: 'Río de la Plata', kind: 'regional', parent: 'es-419', note: 'The Spanish of Argentina and Uruguay.' },
  'es-ES': { code: 'es-ES', label: 'Spain', kind: 'national', note: 'The Spanish of Spain: worth recognising, not your default.' },
  // regions of Spain a dictionary labels on their own
  'es-ES-CN': { code: 'es-ES-CN', label: 'Canary Islands', kind: 'regional', parent: 'es-ES' },
  'es-ES-AN': { code: 'es-ES-AN', label: 'Andalusia', kind: 'regional', parent: 'es-ES' },
  // national varieties: a dictionary label for one country is never widened to the region around it
  'es-SV': { code: 'es-SV', label: 'El Salvador', kind: 'national', parent: 'es-CA' },
  'es-NI': { code: 'es-NI', label: 'Nicaragua', kind: 'national', parent: 'es-CA' },
  'es-GT': { code: 'es-GT', label: 'Guatemala', kind: 'national', parent: 'es-CA' },
  'es-CR': { code: 'es-CR', label: 'Costa Rica', kind: 'national', parent: 'es-CA' },
  'es-PA': { code: 'es-PA', label: 'Panama', kind: 'national', parent: 'es-CA' },
  'es-CU': { code: 'es-CU', label: 'Cuba', kind: 'national', parent: 'es-CAR' },
  'es-PR': { code: 'es-PR', label: 'Puerto Rico', kind: 'national', parent: 'es-CAR' },
  'es-DO': { code: 'es-DO', label: 'Dominican Republic', kind: 'national', parent: 'es-CAR' },
  'es-CO': { code: 'es-CO', label: 'Colombia', kind: 'national', parent: 'es-419' },
  'es-VE': { code: 'es-VE', label: 'Venezuela', kind: 'national', parent: 'es-419' },
  'es-CL': { code: 'es-CL', label: 'Chile', kind: 'national', parent: 'es-419' },
  'es-PY': { code: 'es-PY', label: 'Paraguay', kind: 'national', parent: 'es-419' },
  'es-PE': { code: 'es-PE', label: 'Peru', kind: 'national', parent: 'es-AND' },
  'es-BO': { code: 'es-BO', label: 'Bolivia', kind: 'national', parent: 'es-AND' },
  'es-EC': { code: 'es-EC', label: 'Ecuador', kind: 'national', parent: 'es-AND' },
  // es-AR above is the whole Río de la Plata region; Argentina and Uruguay alone get their own codes inside it
  'es-ARG': { code: 'es-ARG', label: 'Argentina', kind: 'national', parent: 'es-AR' },
  'es-UY': { code: 'es-UY', label: 'Uruguay', kind: 'national', parent: 'es-AR' },
  'es-SA': { code: 'es-SA', label: 'South America', kind: 'regional', parent: 'es-419', note: 'Usage a dictionary labels as South American without naming a country.' },
  'es-PH': { code: 'es-PH', label: 'Philippines', kind: 'national' },
  'es-US': { code: 'es-US', label: 'United States', kind: 'national' },
  'es-hist': { code: 'es-hist', label: 'older Spanish', kind: 'historical', note: 'Spelling or grammar from before the modern standard; the text is kept as written.' },
  voseo: { code: 'voseo', label: 'voseo (vos)', kind: 'feature', note: 'Vos with its own verb forms (vos tenés, vos hablás): everyday speech in Honduras and much of Central America.' },
  vosotros: { code: 'vosotros', label: 'vosotros (Spain)', kind: 'feature', note: 'The informal plural of Spain (vosotros tenéis); in Latin America ustedes is used instead.' },
};

/** Codes the adapter tags words with, for tests and tools that must not accept an unknown tag. */
export const ES_VARIETY_CODES: readonly string[] = Object.keys(ES_VARIETIES);

/**
 * A dictionary's region and usage labels → the variety code each one says, no wider (lower-case keys; look a label up
 * lower-cased). A label not listed here (a usage label such as "obsolete", an unknown region) is not a variety: nothing is guessed.
 */
export const ES_LABEL_VARIETIES: Readonly<Record<string, string>> = {
  honduras: 'es-HN', 'central-america': 'es-CA', 'latin-america': 'es-419', spain: 'es-ES', mexico: 'es-MX', caribbean: 'es-CAR',
  'with-voseo': 'voseo',
  'el-salvador': 'es-SV', nicaragua: 'es-NI', guatemala: 'es-GT', 'costa-rica': 'es-CR', panama: 'es-PA',
  cuba: 'es-CU', 'puerto-rico': 'es-PR', 'dominican-republic': 'es-DO',
  colombia: 'es-CO', venezuela: 'es-VE', chile: 'es-CL', paraguay: 'es-PY',
  peru: 'es-PE', bolivia: 'es-BO', ecuador: 'es-EC',
  rioplatense: 'es-AR', argentina: 'es-ARG', uruguay: 'es-UY',
  'canary-islands': 'es-ES-CN', andalusia: 'es-ES-AN', 'south-america': 'es-SA', philippines: 'es-PH', us: 'es-US',
};

/** One meaning and the words that say it in different places; a form without a variety is general Spanish (documentation, and the "both ways" tests). */
export interface RegionalPair { concept: string; forms: ReadonlyArray<{ lemma: string; variety?: string }> }

export const REGIONAL_PAIRS: readonly RegionalPair[] = [
  { concept: 'computer', forms: [{ lemma: 'computadora', variety: 'es-419' }, { lemma: 'ordenador', variety: 'es-ES' }] },
  { concept: 'car', forms: [{ lemma: 'carro', variety: 'es-419' }, { lemma: 'coche' }] },
  { concept: 'juice', forms: [{ lemma: 'jugo', variety: 'es-419' }, { lemma: 'zumo', variety: 'es-ES' }] },
  { concept: 'mobile phone', forms: [{ lemma: 'celular', variety: 'es-419' }, { lemma: 'móvil', variety: 'es-ES' }] },
  { concept: 'potato', forms: [{ lemma: 'papa', variety: 'es-419' }, { lemma: 'patata', variety: 'es-ES' }] },
  { concept: 'glasses', forms: [{ lemma: 'lentes', variety: 'es-419' }, { lemma: 'gafas' }] },
  { concept: 'peach', forms: [{ lemma: 'durazno', variety: 'es-419' }, { lemma: 'melocotón' }] },
  { concept: 'bean', forms: [{ lemma: 'frijol', variety: 'es-419' }, { lemma: 'alubia' }, { lemma: 'habichuela', variety: 'es-CAR' }] },
  { concept: 'peanut', forms: [{ lemma: 'cacahuate', variety: 'es-MX' }, { lemma: 'cacahuete' }] },
  { concept: 'drinking straw', forms: [{ lemma: 'popote', variety: 'es-MX' }, { lemma: 'pajita' }] },
  { concept: 'angry', forms: [{ lemma: 'enojado', variety: 'es-419' }, { lemma: 'enfadado' }] },
  { concept: 'to park', forms: [{ lemma: 'estacionar', variety: 'es-419' }, { lemma: 'aparcar' }] },
  { concept: 'to drive', forms: [{ lemma: 'manejar', variety: 'es-419' }, { lemma: 'conducir' }] },
  { concept: 'to anger', forms: [{ lemma: 'enojar', variety: 'es-419' }, { lemma: 'enfadar' }] },
];
