import { LITERARY_GHEG_PARTICIPLES } from '../../../../src/adapters/albanian/gheg';
import type { LocalSentenceTranslationReply, LocalSentenceTranslationRequest } from './localProtocol';
import { MAX_TRANSLATION_INPUT_LENGTH, type TranslationProvider } from './provider';
import { isLocalTranslationLanguage, localModelFor } from './models';

type LocalBridge = (request: LocalSentenceTranslationRequest) => Promise<LocalSentenceTranslationReply | undefined>;

/** Two attested spellings only; keep punctuation and unknown dialect forms unchanged. */
export function prepareAlbanianTranslation(text: string): { text: string; changes: string[] } {
  const changes: string[] = [];
  const prepared = text.normalize('NFC').replace(/[\p{L}\p{M}]+/gu, (word) => {
    const key = word.toLocaleLowerCase('sq');
    if (!Object.hasOwn(LITERARY_GHEG_PARTICIPLES, key)) return word;
    const standard = LITERARY_GHEG_PARTICIPLES[key];
    const replacement = word === word.toLocaleUpperCase('sq') ? standard.toLocaleUpperCase('sq')
      : /^\p{Lu}/u.test(word) ? standard[0].toLocaleUpperCase('sq') + standard.slice(1) : standard;
    changes.push(`${word} → ${replacement}`);
    return replacement;
  });
  return { text: prepared, changes: [...new Set(changes)] };
}

/** Offline model through the extension's privileged worker. No URL, token, storage, or network in the page. */
export function createLocalTranslationProvider(send: LocalBridge): TranslationProvider {
  return {
    id: 'local OPUS-MT',
    mode: 'local',
    async translate(input) {
      const language = input.sourceLanguage.languageId?.toLowerCase().split('-')[0];
      if (!isLocalTranslationLanguage(language) || input.targetLanguage.languageId?.toLowerCase().split('-')[0] !== 'en') throw new Error('Unsupported local translation language pair.');
      const model = localModelFor(language)!;
      if (!input.text.trim() || input.text.length > MAX_TRANSLATION_INPUT_LENGTH) throw new Error('Invalid sentence length.');
      const prepared = language === 'sq' ? prepareAlbanianTranslation(input.text) : { text: input.text.normalize('NFC'), changes: [] };
      const reply = await send({ text: prepared.text, sourceLanguage: language, targetLanguage: 'en', explicitlyRequested: true });
      if (!reply?.ok) throw new Error('Local translation is unavailable.');
      if (reply.model !== model.id || (reply.sourceLanguage !== undefined && reply.sourceLanguage !== language)
          || (reply.targetLanguage !== undefined && reply.targetLanguage !== 'en')
          || (reply.revision !== undefined && reply.revision !== model.revision)
          || (language !== 'sq' && (reply.sourceLanguage !== language || reply.targetLanguage !== 'en' || reply.revision !== model.revision))) throw new Error('The local model reply did not match the requested language.');
      return {
        kind: 'natural', text: reply.text,
        uncertaintyNotes: [
          `Local machine translation; model ${reply.model}${reply.revision ? ` at ${reply.revision}` : ''}, published by Helsinki-NLP under ${model.license}. Meaning, idiom, and grammar have not been reviewed by a native speaker.`,
          ...(language === 'sq' ? ['Gheg and historical Albanian translation quality is unverified. A fluent result may still be wrong.']
            : language === 'nb' || language === 'nn' ? [`Source is ${model.label}; this North Germanic model supports both written Norwegian standards. Dialect and historical accuracy are unverified; speech has no official Bokmål or Nynorsk standard.`]
              : [`Regional, dialectal, literary, and historical ${model.label} translation quality is unverified. A fluent result may still be wrong.`]),
          ...(input.sourceLanguage.dialectId ? [`The source variety is ${input.sourceLanguage.dialectId}; the model is not independently validated for that variety.`] : []),
          ...(prepared.changes.length ? [`Limited Standard spelling correspondences supplied to the model: ${prepared.changes.join('; ')}. The original sentence remains unchanged.`] : []),
        ],
      };
    },
  };
}

/** Backwards-compatible Albanian-only port for existing callers; production uses the multilingual provider. */
export function createLocalAlbanianTranslationProvider(send: LocalBridge): TranslationProvider {
  const provider = createLocalTranslationProvider(send);
  return { ...provider, id: 'Helsinki-NLP/opus-mt-sq-en (local)', async translate(input) {
    if (input.sourceLanguage.languageId?.toLowerCase().split('-')[0] !== 'sq') throw new Error('The local model supports Albanian to English only.');
    return provider.translate(input);
  } };
}
