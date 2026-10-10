import { LITERARY_GHEG_PARTICIPLES } from '../../../../src/adapters/albanian/gheg';
import type { LocalSentenceTranslationReply, LocalSentenceTranslationRequest } from './localProtocol';
import { MAX_TRANSLATION_INPUT_LENGTH, type TranslationProvider } from './provider';

type LocalBridge = (request: LocalSentenceTranslationRequest) => Promise<LocalSentenceTranslationReply | undefined>;

/** Two attested spellings only; keep punctuation and unknown dialect forms unchanged. */
export function prepareAlbanianTranslation(text: string): { text: string; changes: string[] } {
  const changes: string[] = [];
  const prepared = text.normalize('NFC').replace(/[\p{L}\p{M}]+/gu, (word) => {
    const standard = LITERARY_GHEG_PARTICIPLES[word.toLocaleLowerCase('sq')];
    if (!standard) return word;
    const replacement = word === word.toLocaleUpperCase('sq') ? standard.toLocaleUpperCase('sq')
      : /^\p{Lu}/u.test(word) ? standard[0].toLocaleUpperCase('sq') + standard.slice(1) : standard;
    changes.push(`${word} → ${replacement}`);
    return replacement;
  });
  return { text: prepared, changes: [...new Set(changes)] };
}

/** Offline model through the extension's privileged worker. No URL, token, storage, or network in the page. */
export function createLocalAlbanianTranslationProvider(send: LocalBridge): TranslationProvider {
  return {
    id: 'Helsinki-NLP/opus-mt-sq-en (local)',
    mode: 'local',
    async translate(input) {
      if (input.sourceLanguage.languageId?.split('-')[0] !== 'sq' || input.targetLanguage.languageId?.split('-')[0] !== 'en') {
        throw new Error('The local model supports Albanian to English only.');
      }
      if (!input.text.trim() || input.text.length > MAX_TRANSLATION_INPUT_LENGTH) throw new Error('Invalid sentence length.');
      const prepared = prepareAlbanianTranslation(input.text);
      const reply = await send({ text: prepared.text, sourceLanguage: 'sq', targetLanguage: 'en', explicitlyRequested: true });
      if (!reply?.ok) throw new Error('Local translation is unavailable.');
      return {
        kind: 'natural', text: reply.text,
        uncertaintyNotes: [
          `Local machine translation; model ${reply.model}${reply.revision ? ` at ${reply.revision}` : ''}. Meaning, idiom, and grammar have not been reviewed by a native speaker.`,
          'Gheg and historical Albanian translation quality is unverified. A fluent result may still be wrong.',
          ...(prepared.changes.length ? [`Limited Standard spelling correspondences supplied to the model: ${prepared.changes.join('; ')}. The original sentence remains unchanged.`] : []),
        ],
      };
    },
  };
}
