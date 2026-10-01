/**
 * The reader's Previous / Next bar. Found in the browser: the first chapter of "Camino 1" offered a later chapter as
 * "Previous" and a chapter of another book as "Next", because every text of the corpus was ordered by title.
 * Chapters of a work follow chapter order and never leave the work; texts outside any work keep the title order.
 */
import { describe, expect, it } from 'vitest';
import type { Text } from '../../src/core';
import { siblingOrder } from '../../src/ui/reader/Reader';

const text = (id: string, title: string, extra: Partial<Text> = {}): Text => ({
  id, corpusId: 'ci-es', lang: 'es', kind: 'story', title, sourceId: `src:${id}`, importedAt: '2026-10-01T00:00:00.000Z',
  tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: [],
  schemaVersion: 2, generated: true, transformations: [], contentVersion: 1, ...extra,
} as Text);

const chapter = (work: string, index: number, title: string) => text(`${work}-${index}`, title, { workId: `work:${work}`, chapter: { index, title } });

const rows: Text[] = [
  chapter('camino-2', 8, 'La abuela cuenta'),
  chapter('camino-1', 3, 'Juan y Ana'),
  chapter('camino-1', 1, 'Juan y el libro'),
  chapter('camino-1', 2, 'La casa de Ana'),
  text('story-01', 'Mi historia'),
  text('dialogue-01', 'Una conversación'),
  text('bible', '1 Juan 1', { kind: 'scripture' }),
  text('de-1', 'Ein Text', { lang: 'de' }),
];

describe('reader previous / next order', () => {
  it('follows chapter order inside a work, whatever the titles sort to', () => {
    const first = rows.find((t) => t.id === 'camino-1-1')!;
    expect(siblingOrder(first, rows).map((t) => t.title)).toEqual(['Juan y el libro', 'La casa de Ana', 'Juan y Ana']);
  });

  it('never crosses into another work', () => {
    const last = rows.find((t) => t.id === 'camino-1-3')!;
    const list = siblingOrder(last, rows);
    expect(list[list.length - 1]!.id).toBe('camino-1-3');
    expect(list.some((t) => t.workId !== 'work:camino-1')).toBe(false);
  });

  it('keeps title order for texts outside any work, without chapters, Scripture or other languages mixed in', () => {
    const story = rows.find((t) => t.id === 'story-01')!;
    expect(siblingOrder(story, rows).map((t) => t.id)).toEqual(['story-01', 'dialogue-01']);
  });

  it('keeps Scripture with Scripture', () => {
    const bible = rows.find((t) => t.id === 'bible')!;
    expect(siblingOrder(bible, rows).map((t) => t.id)).toEqual(['bible']);
  });
});
