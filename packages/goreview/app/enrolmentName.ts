/**
 * The name a learner sees for one of their languages (the home's kicker, the Account page's language tiles): the language, and its variety when
 * the pack reads more than one and this is not the only one the learner has of it. "Hebrew" alone; "Biblical Hebrew" beside "Modern Hebrew";
 * "Spanish (Spain)". Norwegian's two standards are languages of their own and are named by their language ids (nb, nn).
 */
import type { Enrolment } from '../../repository-contract/src';
import { packFor } from '../../language-packs/src/registry';
import { languageName } from './format';

type Named = Pick<Enrolment, 'enrolmentId' | 'languageId'> & Partial<Pick<Enrolment, 'varietyId'>>;

/** The variety's own label, without a bracketed remark ("Modern Hebrew (default)" → "Modern Hebrew"); undefined for a pack of one variety. */
export function varietyLabel(languageId: string, varietyId: string | undefined): string | undefined {
  const pack = packFor(languageId);
  if (!pack || !varietyId) return undefined;
  const analysed = pack.varieties.filter((v) => v.analysed);
  const v = pack.varieties.find((x) => x.varietyId === varietyId);
  if (!v || v.writtenStandard || analysed.length < 2) return undefined;
  return v.label.replace(/\s*\([^)]*\)\s*$/u, '').trim() || undefined;
}

export function enrolmentName(e: Named, all: readonly Named[] = [e]): string {
  const name = languageName(e.languageId);
  const label = varietyLabel(e.languageId, e.varietyId);
  // the variety is named where it tells two of the learner's languages apart, and always for a variety that is a language of its own kind
  // (Biblical Hebrew, Koine Greek), never for the pack's general default alone
  const pack = packFor(e.languageId);
  const isDefault = !!pack && pack.varietyId === e.varietyId;
  const twin = all.some((x) => x.enrolmentId !== e.enrolmentId && x.languageId === e.languageId);
  if (!label || (isDefault && !twin)) return name;
  return label.toLowerCase().includes(name.toLowerCase()) ? label : `${name} (${label})`;
}
