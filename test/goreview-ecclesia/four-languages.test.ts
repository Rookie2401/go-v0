/** The same contract exercised in Hebrew, Aramaic, Greek and Latin: ids, encounters, facts, candidates, a plan and a familiarity estimate per language. */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { writtenRecognition } from '../../packages/goreview/src/exercises/written-recognition';
import { mapEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { factsProviderFor, inMemoryLexicon } from '../../packages/goreview-ecclesia/src/facts';
import { cardsForPassage } from '../../packages/goreview-ecclesia/src/cards';
import { unitIdsOf } from '../../packages/goreview-ecclesia/src/identity';
import { knowledgeStandings } from '../../packages/goreview-ecclesia/src/profile';
import { passageFamiliarity } from '../../packages/goreview-ecclesia/src/familiarity';
import { frequencyFromPassages } from '../../packages/goreview-ecclesia/src/frequency';
import { composeSession } from '../../packages/goreview-ecclesia/src/session';
import { FIXTURES } from './fixtures/four-languages';

const T = (m: number): string => new Date(Date.parse('2026-11-04T08:00:00.000Z') + m * 60_000).toISOString();

describe.each(FIXTURES.map((f) => [f.profile.label, f] as const))('%s', (_label, fx) => {
  const { profile, passage } = fx;
  const identity = { learnerId: 'L4', enrolmentId: `E-${profile.id}`, deviceId: 'D' };
  const first = passage.verses[0]!;
  const content = first.tokens.find((t) => ['NOUN', 'VERB'].includes(t.pos) && fx.lexemes.find((l) => l.lemma === t.lemma)?.glosses.length)!;

  it('gives every token stable ids in the profile language', () => {
    for (const v of passage.verses) for (const t of v.tokens) {
      const ids = unitIdsOf(profile, t);
      expect(ids.lexeme).toMatch(new RegExp(`^lemma:${profile.repository.languageId}:[^:\\s]+:${t.pos}$`, 'u'));
      expect(ids.form).toMatch(new RegExp(`^form:${profile.repository.languageId}:[^:\\s]+$`, 'u'));
      expect(unitIdsOf(profile, { ...t, index: 99 })).toEqual(ids);
    }
  });

  it('records a reading as valid events with the profile edition and variety, text-free', () => {
    const events = mapEncounters([
      { kind: 'passage-viewed', encounterId: `${profile.id}:1`, at: T(0), passage: passage.ref, verses: passage.verses },
      { kind: 'word-selected', encounterId: `${profile.id}:2`, at: T(1), passage: passage.ref, verse: first.verse, token: content },
      { kind: 'definition-revealed', encounterId: `${profile.id}:3`, at: T(1), passage: passage.ref, verse: first.verse, token: content },
      { kind: 'passage-completed', encounterId: `${profile.id}:4`, at: T(3), passage: passage.ref, verses: passage.verses, helpUsed: false },
    ], { profile, identity }).flatMap((m) => m.events);
    expect(events.length).toBe(passage.verses.length * 2 + 2);
    for (const e of events) {
      expect(validateEvent(e), e.id).toEqual([]);
      expect(e.languageId).toBe(profile.repository.languageId);
      expect(e.varietyId).toBe(profile.repository.varietyId);
      expect(e.subject.sourceRef).toMatchObject({ kind: 'scripture', translationId: profile.textId, book: passage.ref.book, chapter: passage.ref.chapter });
    }
    const text = passage.verses.flatMap((v) => v.tokens.slice(0, 4).map((t) => t.surface)).join(' ');
    expect(JSON.stringify(events)).not.toContain(text);
    const standings = knowledgeStandings(events, { learnerId: identity.learnerId, languageId: profile.repository.languageId });
    const ids = unitIdsOf(profile, content);
    expect(standings.get(ids.lexeme)!.level).toBe('recognized');
    expect(standings.get(ids.lexeme)!.lookups).toBe(1);
  });

  it('builds exercise facts from the fixture lexicon and a recognition exercise for a glossed word', async () => {
    const facts = factsProviderFor(profile, inMemoryLexicon(fx.lexemes, fx.forms));
    const ids = unitIdsOf(profile, content);
    const f = await facts.factsFor(ids.lexeme, profile.repository.languageId, profile.repository.varietyId);
    expect(f).toBeDefined();
    expect(f!.unit.languageId).toBe(profile.repository.languageId);
    expect(f!.glossAttribution).toBe(fx.attribution);
    const target = { unitId: ids.lexeme, unitKind: 'lexeme', languageId: profile.repository.languageId, varietyId: profile.repository.varietyId, dimension: 'written-recognition' as const };
    const ex = await writtenRecognition.build(target, f!, { now: T(0), random: () => 0.4, pool: facts.pool() });
    expect('unavailable' in ex).toBe(false);
    if (!('unavailable' in ex)) { expect(ex.validation.ok).toBe(true); expect(ex.answerKey.accepted.length).toBeGreaterThan(0); }
    const form = await facts.factsFor(ids.form, profile.repository.languageId);
    expect(form!.relations[0]).toMatchObject({ relation: 'form-of', toId: ids.lexeme });
  });

  it('a reading with lookups composes a plan of new recognition cards through the shared intake and planner', () => {
    const picks = passage.verses.flatMap((v) => v.tokens.filter((t) => ['NOUN', 'VERB'].includes(t.pos)).slice(0, 2).map((t) => ({ verse: v.verse, token: t }))).slice(0, 3);
    const events = mapEncounters([
      { kind: 'passage-viewed', encounterId: `${profile.id}:p`, at: T(0), passage: passage.ref, verses: passage.verses },
      ...picks.flatMap((p, i) => [
        { kind: 'word-selected' as const, encounterId: `${profile.id}:s${i}`, at: T(1 + i), passage: passage.ref, verse: p.verse, token: p.token },
        { kind: 'definition-revealed' as const, encounterId: `${profile.id}:d${i}`, at: T(1 + i), passage: passage.ref, verse: p.verse, token: p.token },
      ]),
      { kind: 'passage-completed', encounterId: `${profile.id}:c`, at: T(5), passage: passage.ref, verses: passage.verses, helpUsed: true },
    ], { profile, identity }).flatMap((m) => m.events);
    const s = composeSession({ profile, identity, events, now: T(10), readingContext: passage, random: () => 0.3 });
    expect(s.preferences.languageId).toBe(profile.repository.languageId);
    expect(s.preferences.includeListening).toBe(false);
    expect(s.admitted.length).toBeGreaterThan(0);
    expect(s.plan.items.length).toBeGreaterThan(0);
    expect(s.plan.items.every((p) => p.isNew && p.item.languageId === profile.repository.languageId)).toBe(true);
    expect(cardsForPassage(profile, passage).map((c) => c.cardId)).toEqual(expect.arrayContaining(s.plan.items.map((p) => p.item.itemId)));
  });

  it('estimates familiarity over the passage with a corpus built from the passage itself', () => {
    const frequency = frequencyFromPassages(profile, [passage], `${profile.id}-fixture`);
    const f = passageFamiliarity({ profile, passage, standings: new Map(), frequency });
    expect(f.language).toBe(profile.id);
    expect(f.tokens).toBe(passage.verses.reduce((n, v) => n + v.tokens.length, 0));
    expect(f.knownTokens).toBe(0);
    expect(f.familiarity).toBe(0);
    expect(f.provisional).toBe(true);
    expect(f.unknownLexemes.length).toBe(new Set(passage.verses.flatMap((v) => v.tokens.map((t) => unitIdsOf(profile, t).lexeme))).size);
    expect(f.unknownLexemes[0]!.frequencyRank).toBe(1);
  });
});
