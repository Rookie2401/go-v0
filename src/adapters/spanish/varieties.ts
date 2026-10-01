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
  'es-hist': { code: 'es-hist', label: 'older Spanish', kind: 'historical', note: 'Spelling or grammar from before the modern standard; the text is kept as written.' },
  voseo: { code: 'voseo', label: 'voseo (vos)', kind: 'feature', note: 'Vos with its own verb forms (vos tenés, vos hablás): everyday speech in Honduras and much of Central America.' },
  vosotros: { code: 'vosotros', label: 'vosotros (Spain)', kind: 'feature', note: 'The informal plural of Spain (vosotros tenéis); in Latin America ustedes is used instead.' },
};

/** Codes the adapter tags words with, for tests and tools that must not accept an unknown tag. */
export const ES_VARIETY_CODES: readonly string[] = Object.keys(ES_VARIETIES);

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
