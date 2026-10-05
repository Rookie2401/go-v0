/**
 * Stage 0 scenes as ordinary corpus documents, so they become Texts with sentences and tokens and every reading,
 * gloss, rescue and decoding act is tracked by GoLearn like any other text. They are AI-drafted and unreviewed, so the
 * importer keeps them unpublished: outside Stage 0 they appear only in preview mode, labelled. Sentence ids are stable:
 * the line id is the author key (text:<lang>:stage0-<scene>/s<lineId>).
 */
import { ids } from '../core';
import type { LanguageCode, Stage0Scene } from '../core';
import type { CorpusDocument } from '../ingest';
import type { Stage0World } from './content';
import { characterName } from './content';

export const STAGE0_CORPUS = (lang: LanguageCode) => `stage0-${lang}`;
export const sceneDocId = (scene: Pick<Stage0Scene, 'id'>) => `stage0-${scene.id}`;
export const sceneTextId = (lang: LanguageCode, scene: Pick<Stage0Scene, 'id'>) => ids.text(lang, sceneDocId(scene));
export const lineSentenceId = (lang: LanguageCode, scene: Pick<Stage0Scene, 'id'>, lineId: string) => ids.sentence(sceneTextId(lang, scene), lineId);

export function sceneDocument(scene: Stage0Scene, world?: Stage0World): CorpusDocument {
  const lang = scene.lang;
  const reviewed = scene.provenance.review.status === 'reviewed' && !!scene.provenance.review.reviewer;
  const speakers = Object.fromEntries([...new Set(scene.lines.map((l) => l.speaker).filter((s): s is string => !!s))].map((id) => [id, characterName(world, id, lang)]));
  return {
    schemaVersion: 2,
    id: sceneDocId(scene),
    lang,
    title: scene.title.target ?? scene.title.en,
    contentType: 'story',
    corpus: { id: STAGE0_CORPUS(lang), kind: 'comprehensible-input', title: `Stage 0 — ${lang}` },
    source: {
      id: `src:stage0:${scene.id}`,
      title: `Stage 0 scene ${scene.id} (course-authored)`,
      author: scene.provenance.authoring === 'ai-drafted' ? 'Go course authors (drafted by an AI model)' : 'Go course authors',
      attribution: `Course-authored Stage 0 material. ${scene.provenance.drafter}.`,
      provenance: scene.provenance.authoring === 'ai-drafted'
        ? 'Drafted by an AI model for Stage 0; not yet reviewed by a native speaker. The English lines are the drafter\'s own.'
        : 'Written by the course authors.',
      rights: 'owner-authored',
      licenseNote: 'Owned by the course authors.',
      authorship: scene.provenance.authoring === 'ai-drafted' ? 'generated' : 'human',
    },
    review: reviewed
      ? { status: 'reviewed', reviewedBy: scene.provenance.review.reviewer!, notes: scene.provenance.review.notes ?? '' }
      : { status: 'unreviewed', notes: 'Stage 0 draft; awaiting native-speaker review.' },
    difficulty: 'A0',
    topics: ['stage0'],
    editorialTags: scene.provenance.authoring === 'ai-drafted' ? ['stage0', 'machine-drafted', 'needs-native-review'] : ['stage0'],
    prepTargets: [],
    generated: scene.provenance.authoring === 'ai-drafted',
    english: { source: 'drafted with the Stage 0 scene; not reviewed' },
    streams: ['stage0'],
    ...(Object.keys(speakers).length ? { speakers } : {}),
    sections: [{ title: scene.title.target ?? scene.title.en, paragraphs: [{ sentences: scene.lines.map((l) => ({ id: l.id, text: l.text, english: l.en, ...(l.speaker ? { speaker: l.speaker } : {}) })) }] }],
  } as CorpusDocument;
}
