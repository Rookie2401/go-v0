/** Exact owner-authored language-pack material allowed for account phrase/sentence pronunciation. */
// Import data-only entrypoints. The package barrel also exports analyzers, dictionaries and
// runtime installers; loading that graph in the Repository handler needlessly inflates startup.
import { packFor } from '../../language-packs/src/registry';
import { tutorialFor } from '../../language-packs/src/tutorial';

const canonical = (text: string): string => text.normalize('NFC').trim();

function localeMatches(languageId: string, locale: string): boolean {
  const primary = locale.toLowerCase().split('-')[0];
  if (languageId === 'la') return primary === 'it'; // Azure Italian voice is the documented Latin stand-in.
  if (languageId === 'nb' || languageId === 'nn') return primary === 'nb';
  return primary === languageId;
}

function tutorialExamples(languageId: string): string[] {
  const tutorial = tutorialFor(languageId);
  return (tutorial?.steps ?? []).flatMap((step) => (step.examples ?? []).map((example) => example.surface));
}

function authoredSentences(languageId: string): string[] {
  const manifest = packFor(languageId);
  if (!manifest || manifest.status !== 'installable') return [];
  const tutorial = tutorialFor(languageId);
  return [
    ...manifest.validation.flatMap((item) => item.sentence ? [item.sentence] : []),
    ...(tutorial?.steps ?? []).flatMap((step) => [
      ...(step.passage?.sentences ?? []).map((sentence) => sentence.text),
      ...(step.practice ? [step.practice.sentence] : []),
      ...(step.examples ?? []).filter((example) => /\s/u.test(example.surface) && /[.!?…]$/u.test(example.surface.trim())).map((example) => example.surface),
    ]),
  ];
}

/**
 * Words may be spoken in isolation. A longer phrase or sentence must be exact text in the
 * published pack/tutorial materials; caller claims about a source never add to this allowlist.
 */
export function isPermittedAccountSpeechText(input: {
  languageId: string;
  locale: string;
  kind: string;
  text: string;
}): boolean {
  const { languageId, locale, kind, text } = input;
  if (!localeMatches(languageId, locale)) return false;
  if (/[<>\u0000-\u001f\u007f]/u.test(text)) return false;
  const normalized = canonical(text);
  if (!normalized || normalized.length > 5_000) return false;
  if (kind === 'word') return normalized.length <= 120 && !/\s/u.test(text);
  if (kind === 'phrase') return tutorialExamples(languageId).some((candidate) => canonical(candidate) === normalized);
  if (kind === 'sentence') return authoredSentences(languageId).some((candidate) => canonical(candidate) === normalized);
  return false;
}
