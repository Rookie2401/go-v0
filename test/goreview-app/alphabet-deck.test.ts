// @vitest-environment jsdom
/**
 * The Alphabet saved deck (the owner, 2026-11-14: "In the saved decks for every language, create and add an alphabet vocab deck"): one
 * card a letter, in every language that has a pack, beside Class Essentials and working as it does.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { registry, resolveBuilder } from '../../packages/goreview/src';
import { itemIdFor } from '../../packages/goreview/src/scheduler/deck';
import type { GoEvent } from '../../packages/repository-contract/src';
import { PACKS } from '../../packages/language-packs/src/registry';
import { ALPHABET_LANGUAGES, alphabetCards, alphabetDeckFor, alphabetFacts, alphabetLanguageOf, isAlphabetUnit } from '../../packages/goreview/app/alphabetDeck';
import { HI_LETTERS, TH_LETTERS } from '../../packages/goreview/app/alphabetLetters.thhi';
import { classCards, classDeckFor, classFacts, isClassUnit } from '../../packages/goreview/app/classEssentials';
import { decksKey, listSavedDecks, type SavedDeck } from '../../packages/goreview/app/deckModel';
import { unitLabel } from '../../packages/goreview/app/format';
import { rowsFor } from '../../scripts/alphabet-letters.lib.mts';
import { destroyRigs, dueCard, FakeService, ids, makeRig, queued, reopen, seed, until, type Rig, readyCards } from './helpers';
import { SQ_PROFILE } from '../../src/alphabet/sprint/profiles/sq';
import { scriptKnowledge } from '../../src/alphabet/sprint/knowledge';
import { planSprint } from '../../src/alphabet/sprint/plan';

const FIRST_VISIT = 'Start with a few letters and read your first word.';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const stored = async (rig: Rig, lang = 'sq'): Promise<SavedDeck[]> => {
  const key = decksKey('L1', lang);
  return ((await rig.area.get(key))[key] as { decks?: SavedDeck[] } | undefined)?.decks ?? [];
};
const glyphs = (lang: string): string[] => alphabetCards(lang).map((c) => c.glyph);

describe('Alphabet: the cards', () => {
  it('every language that has a pack has its alphabet, with the letters it should have', () => {
    expect([...ALPHABET_LANGUAGES].sort()).toEqual(Object.keys(PACKS).sort());
    const count: Record<string, number> = { es: 30, sq: 36, de: 30, nb: 29, nn: 29, la: 25, el: 24, he: 27, arc: 27, th: 77, hi: 71 };
    for (const lang of Object.keys(PACKS)) {
      const cards = alphabetCards(lang);
      expect(cards, lang).toHaveLength(count[lang]);
      expect(new Set(cards.map((c) => c.unitId)).size, lang).toBe(cards.length);
      expect(cards.every((c) => c.glyph.trim().length > 0 && c.back.trim().length > 0), lang).toBe(true);
      expect(cards.every((c) => isClassUnit(c.unitId) && isAlphabetUnit(c.unitId) && c.unitId.startsWith(`class:${lang}-alphabet:`)), lang).toBe(true);
      expect(cards.every((c) => unitLabel(c.unitId) === c.glyph), lang).toBe(true); // the screens show the letter itself
    }
    expect(alphabetCards('en')).toEqual([]);
    expect(alphabetCards('sq-AL')).toHaveLength(36);          // a variety belongs to its language
    expect(alphabetCards('el-koi')).toHaveLength(24);
    expect(alphabetCards('no')).toHaveLength(29);             // the Norwegian code some enrolments use
    expect(alphabetLanguageOf('grc')).toBe('el');
  });

  it('is in alphabet order, with each language\'s own letters', () => {
    expect(glyphs('sq').slice(0, 8)).toEqual(['A a', 'B b', 'C c', 'Ç ç', 'D d', 'Dh dh', 'E e', 'Ë ë']);
    expect(glyphs('sq')).toEqual(expect.arrayContaining(['Gj gj', 'Ll ll', 'Nj nj', 'Rr rr', 'Sh sh', 'Th th', 'Xh xh', 'Zh zh']));
    expect(glyphs('es').slice(13, 16)).toEqual(['N n', 'Ñ ñ', 'O o']);
    expect(glyphs('es').slice(-3)).toEqual(['ch', 'll', 'rr']);
    expect(glyphs('de').slice(-4)).toEqual(['Ä ä', 'Ö ö', 'Ü ü', 'ß']);
    expect(glyphs('nb').slice(-3)).toEqual(['Æ æ', 'Ø ø', 'Å å']);
    expect(glyphs('nn')).toEqual(glyphs('nb')); // one alphabet for the two written standards
    expect(glyphs('la').join('')).toBe('A aB bC cD dE eF fG gH hI iJ jK kL lM mN nO oP pQ qR rS sT tU uV vX xY yZ z'); // no W: Latin has none
    expect(glyphs('el')[0]).toBe('Α α');
    expect(glyphs('el').at(-1)).toBe('Ω ω');
    expect(glyphs('el')).toContain('Σ σ ς'); // the final sigma is on sigma's own card
    expect(glyphs('he').filter((g) => !'ךםןףץ'.includes(g)).join('')).toBe('אבגדהוזחטיכלמנסעפצקרשת');
    expect(glyphs('he').filter((g) => 'ךםןףץ'.includes(g))).toEqual(['ך', 'ם', 'ן', 'ף', 'ץ']);
    expect(glyphs('arc')).toEqual(glyphs('he')); // the same square script
    expect(glyphs('th')[0]).toBe('ก');
    expect(glyphs('hi')[0]).toBe('अ');
  });

  it('says a letter\'s name and then its sound, and nothing a learner cannot use', () => {
    const back = (lang: string, glyph: string): string => alphabetCards(lang).find((c) => c.glyph === glyph)!.back;
    expect(back('es', 'Ñ ñ')).toBe('eñe: ny as in canyon');
    expect(back('sq', 'Xh xh')).toBe('xhë: j as in jam');
    expect(back('de', 'ß')).toBe('Eszett (scharfes S): s as in kiss');
    expect(back('nb', 'Å å')).toBe('å: o as in more');
    expect(back('la', 'C c')).toMatch(/^ce: k; in Church Latin ch as in church before e, i, ae and oe \(classical: always k\)$/);
    expect(back('el', 'Β β')).toMatch(/^beta \(βήτα\): v in Modern Greek; b in the classroom pronunciation of ancient Greek$/);
    expect(back('he', 'ב')).toBe('bet: b with a dot inside (בּ), v without it');
    expect(back('he', 'ש')).toContain('שׁ'); // shin with its dot, built from code points
    expect(back('arc', 'א')).toBe('aleph: transliterated ʾ'); // the names the pack's tutorial uses, and a transliteration only
    expect(back('th', 'ก')).toBe('k /k/ · ko kai, “chicken” (ไก่) · mid class');
    expect(back('hi', 'क')).toBe('k /k/');
    for (const lang of Object.keys(PACKS)) for (const c of alphabetCards(lang)) expect(c.back.length, `${lang} ${c.glyph}`).toBeLessThanOrEqual(140);
  });

  it('the Thai and Hindi letters are the alphabet trainer\'s own, row for row (the data file is written from its decks)', () => {
    expect(TH_LETTERS.map((r) => [...r])).toEqual(rowsFor('th').map((r) => [...r]));
    expect(HI_LETTERS.map((r) => [...r])).toEqual(rowsFor('hi').map((r) => [...r]));
  });

  it('answers the exercise engine with the letter and the back of its card, and nothing for a unit it does not own', () => {
    const card = alphabetCards('de').at(-1)!;
    const facts = alphabetFacts(card.unitId, 'de')!;
    expect(facts.unit.label).toBe('ß');
    expect(facts.glosses).toEqual(['Eszett (scharfes S): s as in kiss']);
    expect(facts.status).toBe('provisional');
    expect(alphabetFacts('lemma:de:hund:NOUN', 'de')).toBeUndefined();
    expect(alphabetFacts(card.unitId, 'es')).toBeUndefined();            // another language's letter is not this language's
    expect(alphabetFacts(classCards('de')[0].unitId, 'de')).toBeUndefined(); // a class phrase is not a letter
    expect(classFacts(card.unitId, 'de')).toBeUndefined();               // and a letter is not a class phrase
    expect(classCards('de').some((c) => isAlphabetUnit(c.unitId))).toBe(false);
  });

  it('every card of every language builds as a flashcard with the real written-recognition builder', async () => {
    const builder = resolveBuilder(registry as never, 'written-recognition')!;
    for (const lang of Object.keys(PACKS)) {
      for (const card of alphabetCards(lang)) {
        const target = { unitId: card.unitId, unitKind: 'lexeme', languageId: lang, dimension: 'written-recognition' } as never;
        const built = await builder.build(target, alphabetFacts(card.unitId, lang)!, { now: '2026-11-14T00:00:00Z', random: () => 0 } as never);
        expect('unavailable' in built, `${lang}: ${card.glyph}`).toBe(false);
        if (!('unavailable' in built)) {
          expect(built.responseMode, `${lang}: ${card.glyph}`).toBe('typed-or-self');
          expect(built.prompt.stimulusText).toBe(card.glyph);
          expect(built.answerKey.accepted.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('builds the deck with its name and description, and notes that say who has not reviewed it', () => {
    const deck = alphabetDeckFor('hi', undefined, '2026-11-14T00:00:00.000Z')!;
    expect(deck).toMatchObject({ id: 'alphabet:hi', name: 'Alphabet', description: 'Alphabet Sprint: a few letters at a time, chosen for the real words they let you read.', builtin: 'alphabet', languageId: 'hi' });
    expect(deck.items).toHaveLength(71);
    expect(deck.items[0]).toMatchObject({ unitId: 'class:hi-alphabet:अ', label: 'अ', dimension: 'written-recognition', family: 'written-recognition' });
    expect(deck.notes).toMatch(/not yet checked by a Hindi teacher or native speaker/);
    expect(alphabetDeckFor('es', undefined, '')!.notes).toMatch(/not yet reviewed by a native speaker/);
    expect(alphabetDeckFor('la', undefined, '')!.notes).toMatch(/not yet reviewed by a Latinist/);
    expect(alphabetDeckFor('arc', undefined, '')!.notes).toMatch(/not yet reviewed by an Aramaist/);
    expect(alphabetDeckFor('en', undefined, '')).toBeUndefined();
  });
});

describe('Alphabet: in Saved decks', () => {
  it('is there on the first visit beside Class Essentials, by name, with its count, and seeding again never duplicates it', async () => {
    const rig = await makeRig({ signedIn: true });
    await listSavedDecks(rig.app.ctx, 'L1', 'sq', 'sq-AL');
    await listSavedDecks(rig.app.ctx, 'L1', 'sq', 'sq-AL');
    expect((await stored(rig)).map((d) => d.id).sort()).toEqual(['alphabet:sq', 'class-essentials:sq']);
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('#alphabet-due-count'), 'the Alphabet due line');
    const row = rig.q('[data-deck-id="alphabet:sq"]');
    expect(row.getAttribute('data-builtin')).toBe('alphabet');
    expect(row.querySelector('.deck-title')!.textContent).toBe('Alphabet');
    expect(row.querySelector('.deck-caption')!.textContent).toBe(FIRST_VISIT); // Alphabet Sprint: practical progress, not a card count
    expect(row.textContent).not.toContain('native speaker'); // the note stays in the deck's record, not on this page
    expect(rig.q('#alphabet-due-count').textContent).toBe('Nothing due');
    expect(rig.root.querySelector('#start-alphabet-due')).toBeNull(); // the seeded letters do not become due work by being seeded
    expect(rig.q('#class-essentials-due-count').textContent).toBe('Nothing due');
  });

  it('a learner who already had Class Essentials gets the Alphabet on the next visit, and keeps what was there', async () => {
    const rig = await makeRig({ signedIn: true });
    const before = classDeckFor('sq', 'sq-AL', '2026-10-16T00:00:00.000Z')!;
    const mine: SavedDeck = { id: 'mine-1', savedAt: '2026-10-20T00:00:00.000Z', languageId: 'sq', items: [{ itemId: 'i1', unitId: 'lemma:sq:zog:NOUN', unitKind: 'lemma', label: 'zog', dimension: 'written-recognition', family: 'written-recognition' }] };
    await rig.area.set({ [decksKey('L1', 'sq')]: { v: 1, decks: [mine, before], holdOut: [], added: [], dismissed: [] } }); // as a device stored it before 2026-11-14
    const listed = await listSavedDecks(rig.app.ctx, 'L1', 'sq', 'sq-AL');
    expect(listed.map((d) => d.id).sort()).toEqual(['alphabet:sq', 'class-essentials:sq', 'mine-1']);
    const after = await stored(rig);
    expect(after.find((d) => d.id === 'class-essentials:sq')).toEqual(before);
    expect(after.find((d) => d.id === 'mine-1')).toEqual(mine);
    expect(after.filter((d) => d.builtin === 'alphabet')).toHaveLength(1);
  });

  it('a language with no Class Essentials has the Alphabet alone', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('[data-deck-id="alphabet:he"]'), 'the Hebrew alphabet');
    expect(rig.qa('#saved-decks .deck-tile').map((r) => r.getAttribute('data-deck-id'))).toEqual(['alphabet:he']);
    expect(rig.q('[data-deck-id="alphabet:he"] .deck-caption').textContent).toBe(FIRST_VISIT);
    expect(rig.root.querySelector('#class-essentials-due')).toBeNull();
    await rig.go('review');
    expect(rig.q('#previous-count').textContent).toBe('1 saved');
  });

  it('opens as Alphabet Sprint through the flashcard flow: letters chosen for the words they unlock, each followed by a real word; graded once; the ordinary queue never meets it', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('[data-deck-id="alphabet:sq"]'), 'the deck');
    click(rig.q('[data-deck-id="alphabet:sq"] [data-action="practise-again"]'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the first card');
    const items = rig.app.ctx.run.active!.plan.items;
    // the session is the Sprint's plan for a beginner (src/alphabet/sprint/plan.ts), at the configured size, never in alphabet order
    const sprint = planSprint({ profile: SQ_PROFILE, knowledge: scriptKnowledge(SQ_PROFILE, []), cards: [], now: rig.app.ctx.deps.now().toISOString(), size: items.length });
    expect(items.length).toBeGreaterThan(2);
    expect(items.every((p) => p.family === 'written-recognition' && isAlphabetUnit(p.item.unitId))).toBe(true);
    expect(items.map((p) => p.item.unitId)).toEqual(sprint.cards.slice(0, items.length).map((c) => c.unitId));
    expect(items.slice(0, 3).some((p) => p.item.unitId.includes('-alphabet-word:'))).toBe(true); // a real word within the first cards
    expect(items.map((p) => unitLabel(p.item.unitId))).not.toEqual(alphabetCards('sq').slice(0, items.length).map((c) => c.glyph));
    expect(rig.q('.exercise').classList.contains('flashcard')).toBe(true);
    expect(rig.q('#stimulus').textContent).toBe(sprint.cards[0].front);
    expect(rig.root.querySelector('#revealed-answer')).toBeNull();
    click(rig.q('#flip-card'));
    expect(rig.q('#revealed-answer').textContent).toBe(sprint.cards[0].back);
    click(rig.q('[data-grade="good"]'));
    await until(async () => (await queued(rig)).some((e) => e.kind === 'CardReviewed'), 'the review event');
    expect((await queued(rig)).find((e) => e.kind === 'CardReviewed')!.subject.itemIds).toEqual([sprint.cards[0].unitId]);
    expect((await stored(rig)).find((d) => d.id === 'alphabet:sq')!.items).toHaveLength(36);

    // reviewed, but out of the ordinary queue and the home's deck
    await reopen(rig);
    expect(readyCards(rig)).toBe(0);
    await rig.go('review/details');
    expect(rig.q('#deck').textContent).not.toContain('A a');
  });

  it('counts its own due letters, and Class Essentials counts its own phrases', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    const letter = alphabetCards('sq')[3].unitId; // Ç ç
    const due: GoEvent[] = dueCard(A, 'seed-letter', 'written-recognition').map((event) => {
      const payload = { ...event.payload, ...(event.kind === 'CardAdded' ? { unitId: letter, unitKind: 'lexeme' } : {}) };
      return { ...event, subject: { ...event.subject, itemIds: [letter], cardId: itemIdFor(letter, 'written-recognition') }, payload };
    });
    await seed(rig, due);
    await reopen(rig);
    expect(readyCards(rig)).toBe(0); // a due letter is not ordinary due work
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('#alphabet-due-count'), 'the Alphabet due line');
    expect(rig.q('#alphabet-due-count').textContent).toBe('1 card due');
    expect(rig.q('#class-essentials-due-count').textContent).toBe('Nothing due');
    expect(rig.root.querySelector('#start-class-essentials-due')).toBeNull();
    click(rig.q('#start-alphabet-due'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the due letter');
    expect(rig.app.ctx.run.active!.plan.items.map((p) => p.item.unitId)).toEqual([letter]);
    expect(rig.q('#stimulus').textContent).toBe(SQ_PROFILE.units.find((u) => u.key === 'Ç ç')!.display); // the Sprint shows the letter as the profile writes it
  });

  it('Remove takes it out and it stays out; "Restore Alphabet" brings it back once, and Class Essentials is untouched', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('review/decks');
    await until(() => rig.qa('#saved-decks .deck-tile').length === 2, 'both built-in decks');
    expect(rig.root.querySelector('#restore-alphabet')).toBeNull();
    click(rig.q('[data-deck-id="alphabet:sq"] [data-action="remove-deck"]'));
    await until(() => !!rig.root.querySelector('#restore-alphabet'), 'the restore link');
    expect(rig.q('#restore-alphabet').textContent).toBe('Restore Alphabet');
    expect(rig.qa('#saved-decks .deck-tile').map((r) => r.getAttribute('data-deck-id'))).toEqual(['class-essentials:sq']);
    expect(rig.root.querySelector('#restore-class-essentials')).toBeNull();
    await listSavedDecks(rig.app.ctx, 'L1', 'sq'); // another visit does not bring it back
    await rig.go('review'); await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('#restore-alphabet'), 'still removed');
    click(rig.q('#restore-alphabet'));
    await until(() => rig.qa('#saved-decks .deck-tile').length === 2, 'the deck again');
    expect(rig.root.querySelector('#restore-alphabet')).toBeNull();
    expect((await stored(rig)).filter((d) => d.builtin === 'alphabet')).toHaveLength(1);
  });
});
