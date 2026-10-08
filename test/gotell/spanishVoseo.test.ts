/**
 * GoTell's Spanish is the course's Spanish: Honduran voseo. Every model wording and every concept row that addresses the listener
 * must use the vos forms (tenés, sos, querés, hablá, creés ...), never the tú forms (tienes, eres, quieres, habla, crees ...), and the
 * real adapter must read those vos forms as voseo, never as Spain's vosotros (docs/audits/COURSE-AUDIT-2026-10-07.md 4.5).
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { catalogGoals, catalogModel } from '../../src/gotell/productive/goals';
import { conceptMatches, conceptsForToken, lexemesFor } from '../../src/gotell/concepts';

const es = createAdapterRegistry().get('es');

/** The tú forms that must not appear in a Spanish model (second person singular, present; pronoun and its derivatives). */
const TU_FORMS = /\b(tú|tu|tus|ti|contigo|tienes|eres|quieres|puedes|sabes|crees|piensas|entiendes|vienes|haces|dices|dices|sientes|vives|escribes|prefieres|necesitas|hablas|miras|ves|oyes|conoces|perdonas|confías|compartes|cambias|llamas|lees)\b/iu;

/** Vos forms a learner is meant to meet and to produce. */
const VOS_SENTENCES = [
  'Vos tenés razón.', 'Vos sos mi amigo.', '¿Qué querés?', '¿Podés venir mañana?', 'Vos sabés la verdad.', '¿Dónde vivís?',
  'Vos decís que sí.', '¿Creés en Jesús?', 'Hablá más despacio.', 'Vení acá y mirá.', 'Contame tu historia.', '¿Entendés ahora?',
  'Vos escribís muy bien.', '¿Vos confiás en Dios?', 'Vos perdonás de corazón.', 'Salí de ahí y comé algo.',
];

describe('GoTell Spanish: the model wordings are in voseo', () => {
  const models = catalogGoals('es').map((g) => ({ id: g.id, text: catalogModel(g.id, 'es')!.text }));

  it('there are fifteen Spanish models, and none of them contains a tú form', () => {
    expect(models).toHaveLength(15);
    for (const m of models) expect({ id: m.id, tu: m.text.match(TU_FORMS)?.[0] }).toEqual({ id: m.id, tu: undefined });
  });

  it('the models that address the listener say vos, and the note says it is voseo', () => {
    const byId = Object.fromEntries(models.map((m) => [m.id, m.text]));
    expect(byId['goal:m.do-you-believe']).toBe('¿Creés en Jesús?');
    expect(byId['goal:t.share']).toBe('Quiero compartir esto con vos.');
    for (const id of ['goal:m.do-you-believe', 'goal:t.share']) expect(catalogModel(id, 'es')!.note).toMatch(/voseo/i);
  });

  it('the real adapter reads the listener-addressing models as voseo, not as vosotros', () => {
    for (const text of ['¿Creés en Jesús?']) {
      const tokens = es.tokenize(text);
      const keys = es.detectPatterns(tokens, es.analyze(tokens)).map((p) => p.key);
      expect({ text, voseo: keys.includes('voseo'), vosotros: keys.includes('vosotros') }).toEqual({ text, voseo: true, vosotros: false });
    }
  });
});

describe('GoTell Spanish: the concept rows know the vos forms', () => {
  it('a vos form reaches the same concept as its tú form', () => {
    const pairs: Array<[vos: string, tu: string, concept: string]> = [
      ['creés', 'crees', 'believe'], ['confiás', 'confías', 'trust'], ['sabés', 'sabes', 'know'], ['conocés', 'conoces', 'know'],
      ['entendés', 'entiendes', 'understand'], ['perdonás', 'perdonas', 'forgive'], ['compartís', 'compartes', 'share'],
      ['cambiás', 'cambias', 'change'], ['arrepentís', 'arrepientes', 'repent'],
    ];
    for (const [vos, tu, concept] of pairs) {
      expect({ form: vos, hit: conceptsForToken('es', vos).includes(concept as never) }).toEqual({ form: vos, hit: true });
      expect({ form: tu, hit: conceptsForToken('es', tu).includes(concept as never) }).toEqual({ form: tu, hit: true });
    }
    expect(conceptMatches('es', 'creés').map((m) => m.concept)).toContain('believe');
    expect(conceptMatches('es', 'confiás').map((m) => m.concept)).toContain('trust');
  });

  it('the preferred wordings the learner is offered (lexemes) are infinitives or neutral words, never a tú form', () => {
    for (const concept of ['young', 'family', 'jesus', 'know', 'understand', 'sin', 'guilt', 'repent', 'forgive', 'believe', 'trust', 'change', 'now', 'share'] as const) {
      for (const lexeme of lexemesFor('es', concept)) expect({ concept, lexeme, tu: lexeme.match(TU_FORMS)?.[0] }).toEqual({ concept, lexeme, tu: undefined });
    }
  });
});

describe('the Spanish adapter reads vos forms as voseo, never as vosotros', () => {
  it('every vos sentence is voseo and none is vosotros', () => {
    for (const text of VOS_SENTENCES) {
      const tokens = es.tokenize(text);
      const analyses = es.analyze(tokens);
      const keys = es.detectPatterns(tokens, analyses).map((p) => p.key);
      expect({ text, vosotros: keys.includes('vosotros') }).toEqual({ text, vosotros: false });
    }
  });

  it('the -ís forms that vosotros shares (vivís, decís, escribís, confiás is not one of them) lead with the voseo reading', () => {
    for (const text of ['¿Dónde vivís?', 'Vos decís que sí.', 'Vos escribís muy bien.', 'Mientras vos salís, yo espero.']) {
      const tokens = es.tokenize(text);
      const keys = es.detectPatterns(tokens, es.analyze(tokens)).map((p) => p.key);
      expect({ text, voseo: keys.includes('voseo') }).toEqual({ text, voseo: true });
    }
  });
});
