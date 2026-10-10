/**
 * Experimental packs: a manifest for a language whose analyser is wired into the parser and the pack runtime, at a
 * deliberately minimal level. An experimental pack is installable (`status: 'installable'`, `level: 'experimental'`):
 * the installer checks its dictionary and runs its validation cases through the real analyser, and the extension
 * parser reads selections with it. It is NOT production-ready and says so everywhere: seed-only lemmatisation, an
 * unreviewed machine-drafted word list, validation cases that are single words in short sentences, a minimal
 * orientation tutorial (when the spec names one), no recordings.
 *
 * It is built from the same spec as a planned pack so that the grammar tables, voices and honesty notes stay in one
 * place; it only adds what now exists (validation cases) and rewrites what the provenance says. The adapter version is
 * written as a constant, not imported (see planned.ts); test/language-packs/registry.test.ts compares it with the adapter.
 */
import type { PackManifest, ValidationCase } from '../manifest';
import { plannedManifest, type PlannedSpec } from './planned';

export interface ExperimentalSpec extends PlannedSpec {
  /** Real selections, each as the adapter really reads it (never what a person would hope). */
  validation: ValidationCase[];
  /** The thin parts, one plain sentence each, shown after "Thin:". */
  thin: string[];
  /** True when the adapter gives written pronunciation notes for a word (checked by test/language-packs/capabilities.test.ts). */
  pronunciationNotes: boolean;
  /** The minimal orientation tutorial of the pack, when one exists (tutorial/<lang>.ts); absent = the planned manifest's estimate stands and the provenance says there is none. */
  tutorial?: { ref: string; estimatedMinutes: number };
}

export function experimentalManifest(s: ExperimentalSpec): PackManifest {
  const planned = plannedManifest(s);
  const lang = s.languageId;
  const dict = planned.lexical.dictionary;
  return {
    ...planned,
    validation: structuredClone(s.validation),
    status: 'installable',
    level: 'experimental',
    pronunciation: { ...planned.pronunciation, notesAvailable: s.pronunciationNotes },
    ...(s.tutorial ? { tutorial: { ref: s.tutorial.ref, estimatedMinutes: s.tutorial.estimatedMinutes, skippable: true as const } } : {}),
    rights: {
      ...planned.rights,
      licences: [...planned.rights.licences, ...(s.tutorial ? [{ resource: `Orientation ${s.tutorial.ref} and its practice sentences`, licence: 'Owner-authored, AI-drafted; not reviewed by a native speaker' }] : [])],
      provenance: [
        `Experimental, installable at a deliberately minimal level and not production-ready. The analyser adapter-${lang}@${s.version} is wired into the parser and the pack runtime: ${s.adapterSummary}`,
        dict
          ? `The dictionary (kaikki-${lang}, ${dict.entries.toLocaleString('en')} entries, CC BY-SA 4.0, Wiktionary via kaikki.org) is declared by this pack and checked by the installer; every gloss taken from it is shown with that attribution.`
          : 'There is no dictionary for this language in the repository: meanings come from the pack’s own word list only, and the installer has no dictionary to check (it runs the validation cases and says so).',
        `Thin: ${s.thin.join(' ')}`,
        `Nothing in this pack has been reviewed by a native speaker. The ${s.validation.length} validation cases are single words in short sentences, written as the analyser really reads them. ${s.tutorial ? `The orientation (${s.tutorial.ref}) is minimal and AI-drafted for this pack and is not reviewed: how to select a word, what the card shows, one practice lookup, the writing system and what this pack cannot do. Its practice words were checked only by machine (the analyser reads them).` : `The orientation tutorial (tutorial/${lang}) does not exist; its length is an estimate.`}`,
        'The voices named are the remote voices expected to be offered, each only with the learner’s consent and key. What GoListen really holds for this language is stated by the capability report (capabilities.ts), not claimed here.',
        ...(s.extraProvenance ?? []),
      ],
    },
  };
}
