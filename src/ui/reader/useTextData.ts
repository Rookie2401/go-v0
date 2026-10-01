/** Loads everything the Reader needs for one text from the store (+ per-sentence support from GoLearn). */
import { useEffect, useState } from 'react';
import type {
  ContentNote, ContentSource, Corpus, EnglishRescue, Paragraph, Phrase, PhraseOccurrence, Sentence, SentenceSupport, Text, TextSection, Token,
} from '../../core';
import { useApp } from '../context';

export interface TextData {
  text: Text;
  source?: ContentSource;
  corpus?: Corpus;
  sections: TextSection[];
  paragraphs: Paragraph[];
  sentences: Sentence[];
  tokensBySentence: Map<string, Token[]>;
  rescues: Map<string, EnglishRescue>;
  phraseOccurrences: PhraseOccurrence[];
  phrases: Map<string, Phrase>;
  support: Map<string, SentenceSupport>;
  /** Notes attached to this text (all kinds, any review state: the reader decides which to show). */
  notes: ContentNote[];
}

export type TextDataState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; data: TextData };

export function useTextData(textId: string): TextDataState {
  const { store, golearn, userId } = useApp();
  const [state, setState] = useState<TextDataState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    (async () => {
      const text = await store.texts.get(textId);
      if (!text) { if (live) setState({ status: 'missing' }); return; }
      const [source, corpus, sections, paragraphs, sentencesRaw, tokens, rescueRows, occs, noteRows] = await Promise.all([
        store.sources.get(text.sourceId),
        store.corpora.get(text.corpusId),
        store.sections.where('textId', textId),
        store.paragraphs.where('textId', textId),
        store.sentences.where('textId', textId),
        store.tokens.where('textId', textId),
        store.rescues.where('textId', textId),
        store.phraseOccurrences.where('textId', textId),
        // Notes are optional context: a store without the table, or a failing read, leaves the text readable.
        Promise.resolve().then(() => store.notes.where('textId', textId)).catch((): ContentNote[] => []),
      ]);
      // Live sentences only, in the order of the current content version (retired sentences are history: they keep
      // their ids for encounters and audio, but are not part of the text any more). Never derive order from an id.
      const sentences = sentencesRaw.filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
      const tokensBySentence = new Map<string, Token[]>();
      for (const t of tokens.sort((a, b) => a.index - b.index)) {
        const list = tokensBySentence.get(t.sentenceId) ?? [];
        list.push(t);
        tokensBySentence.set(t.sentenceId, list);
      }
      const phraseIds = [...new Set(occs.map((o) => o.phraseId))];
      const phraseRows = (await store.phrases.getMany(phraseIds)).filter((p): p is Phrase => !!p);
      // Highlight / explanation hints are a nicety: a failing lookup for one sentence must not block reading.
      const supportRows = await Promise.all(
        sentences.map((s) => golearn.sentenceSupport(userId, s.id).catch(() => undefined)),
      );
      const support = new Map<string, SentenceSupport>();
      supportRows.forEach((r, i) => { if (r) support.set(sentences[i].id, r); });
      if (!live) return;
      setState({
        status: 'ready',
        data: {
          text, source, corpus,
          sections: sections.sort((a, b) => a.index - b.index),
          paragraphs: paragraphs.sort((a, b) => a.index - b.index),
          sentences,
          tokensBySentence,
          rescues: new Map(rescueRows.map((r) => [r.sentenceId, r])),
          phraseOccurrences: occs,
          phrases: new Map(phraseRows.map((p) => [p.id, p])),
          support,
          notes: noteRows,
        },
      });
    })().catch((e: unknown) => { if (live) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [store, golearn, userId, textId]);

  return state;
}
