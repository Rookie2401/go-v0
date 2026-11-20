/**
 * Verbal aspect as the card can show it: which aspect a reading has, which partners the dictionary names, and one or two sentences
 * about what that aspect does in THIS form.
 *
 * MACHINE-DRAFTED from standard grammar descriptions of Russian; not reviewed by a native speaker. Nothing is claimed that the data
 * does not state: the aspect is the dictionary's (`morph.Aspect`), the partners are the ones the dictionary's head line names
 * (`notes.partners`), and no pair is ever inferred from the spelling. The notes avoid the slogan "perfective = finished, imperfective
 * = unfinished", which is wrong for many uses (a habitual imperfective past is no more "unfinished" than a perfective one).
 */
import type { AnalysisCandidate } from '../../core';

export type RuAspect = 'Imp' | 'Perf' | 'Both';

/** The aspect of a verb reading: 'Imp', 'Perf', 'Both' (biaspectual, e.g. использовать), or undefined when the reading has none. */
export function ruAspectOf(c: AnalysisCandidate): RuAspect | undefined {
  const v = c.morph.Aspect;
  if (!v) return undefined;
  const parts = v.split(',');
  if (parts.includes('Imp') && parts.includes('Perf')) return 'Both';
  return parts[0] === 'Perf' ? 'Perf' : parts[0] === 'Imp' ? 'Imp' : undefined;
}

/** The headwords (with their stress marks) the dictionary names as the other aspect of this verb; empty when it names none. */
export function ruAspectPartners(c: AnalysisCandidate): string[] {
  const p = c.notes?.partners;
  const list = Array.isArray(p) ? p : typeof p === 'string' ? p.split(',') : [];
  return list.map((x) => x.trim()).filter(Boolean);
}

/** "the dictionary names X as its perfective partner" (never a claim the source does not make). */
export function ruAspectPartnerSentence(c: AnalysisCandidate): string | undefined {
  const partners = ruAspectPartners(c);
  const aspect = ruAspectOf(c);
  if (!partners.length || !aspect || aspect === 'Both') return undefined;
  const other = aspect === 'Imp' ? 'perfective' : 'imperfective';
  return `The dictionary names ${partners.join(', ')} as its ${other} partner${partners.length > 1 ? 's' : ''}.`;
}

export interface RuAspectContext {
  /** The lemma of the verb this reading depends on, when it is an infinitive after one (начать, кончить, продолжать, бросить). */
  afterLemma?: string;
}

/** Verbs after which only the imperfective infinitive is used: the activity is named, not a single act. */
const PHASAL = new Set(['стать', 'начать', 'начинать', 'кончить', 'кончать', 'закончить', 'заканчивать', 'продолжать', 'продолжить', 'перестать', 'переставать', 'бросить', 'бросать']);

/**
 * One or two sentences about what the aspect does in this form, or undefined for a reading that is no verb or has no aspect.
 * The sentence is fitted to the form (past, non-past, imperative, infinitive, participle, adverbial participle), not a slogan.
 */
export function ruAspectNote(c: AnalysisCandidate, ctx: RuAspectContext = {}): string | undefined {
  if (c.pos !== 'VERB' && c.pos !== 'AUX') return undefined;
  const aspect = ruAspectOf(c);
  if (!aspect) return undefined;
  const m = c.morph;
  const forms = (m.VerbForm ?? '').split(',');
  const tense = m.Tense;
  const partner = ruAspectPartnerSentence(c);
  const withPartner = (text: string): string => (partner ? `${text} ${partner}` : text);

  if (aspect === 'Both') return 'This verb is used in both aspects: the same form can present a single event or a process, and the sentence decides which.';

  if (forms.includes('Fin') && m.Mood === 'Imp') {
    return withPartner(aspect === 'Perf'
      ? 'A perfective imperative asks for one concrete act to be done (Прочитай эту страницу: read this page).'
      : 'An imperfective imperative asks for a process or a repeated act, or gives a general permission or invitation (Читай каждый день; Проходите, садитесь).');
  }
  if (forms.includes('Fin') && tense === 'Past') {
    return withPartner(aspect === 'Perf'
      ? 'A perfective past presents one completed event as a whole, often with its result, or as one step in a sequence of events.'
      : 'An imperfective past presents a process, a repeated or habitual action, or only the plain fact that it took place.');
  }
  if (forms.includes('Fin') && aspect === 'Perf') {
    return withPartner('A perfective verb has no present tense: this present-shaped form means the future (it will be done once, as a whole).');
  }
  if (forms.includes('Fin') && tense === 'Pres') {
    return withPartner('An imperfective present describes what is going on now, or what happens regularly. Its future is made with буду + the infinitive (буду читать).');
  }
  if (forms.includes('Inf')) {
    if (ctx.afterLemma && PHASAL.has(ctx.afterLemma)) {
      return withPartner(aspect === 'Imp'
        ? `After ${ctx.afterLemma} the infinitive is imperfective: it names the activity itself, not a single completed act.`
        : `A perfective infinitive is unusual after ${ctx.afterLemma}: verbs of beginning, ending and continuing take the imperfective.`);
    }
    return withPartner(aspect === 'Perf'
      ? 'A perfective infinitive stands for one act as a whole (Я хочу прочитать эту книгу). The future of a perfective verb is its present-shaped form, with no буду.'
      : 'An imperfective infinitive names the activity or a repeated act. It is the form after буду for the future (буду читать), and the only one after verbs of beginning, ending and continuing (начать читать).');
  }
  if (forms.includes('Conv')) {
    return withPartner(aspect === 'Perf'
      ? 'A perfective adverbial participle names an act completed before the main action, by the same subject (Прочитав письмо, он ушёл).'
      : 'An imperfective adverbial participle names an act going on at the same time as the main action, by the same subject (Читая письмо, он улыбался).');
  }
  if (forms.includes('Part')) {
    return withPartner(aspect === 'Perf'
      ? 'A participle from a perfective verb stands for a completed act and its result (прочитанная книга: a book that has been read).'
      : 'A participle from an imperfective verb stands for an act in progress or a repeated one (читающий человек: a person who is reading).');
  }
  return withPartner(aspect === 'Perf' ? 'This is a perfective verb: it presents an act as a single whole.' : 'This is an imperfective verb: it presents an act as a process, a repetition or a plain fact.');
}
