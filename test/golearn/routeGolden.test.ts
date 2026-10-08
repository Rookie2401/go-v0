/**
 * GOLDEN: what a Spanish and a German learner are offered, captured BEFORE the route changes (R4: adaptive ladder, reach floor 0.85
 * for authentic texts, challenge setting, orphan boost). Where none of the new conditions applies the offer must stay exactly
 * what it was: same texts, same order, same reasons, same scores, same wording.
 *
 * The catalogue deliberately keeps every authentic text at or above 85 % and every controlled text above 75 %, completed units
 * are understood in full with no help, and no orphan list is registered — so none of the new rules has anything to act on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLadderPathSource } from '../../src/golearn/recommend';
import { routeWorld, ladderUnit, U } from './routeWorld';
import type { RouteLang } from './routeWorld';

afterEach(() => setLadderPathSource(undefined));

async function offered(lang: RouteLang, withPath: boolean) {
  const w = await routeWorld(lang);
  const unit1 = await ladderUnit(w, 'unit-1');
  const deps = await w.catalogue([
    w.entry('a-high', 93), w.entry('b-mid', 90), w.entry('c-edge', 87), w.entry('d-far', 50),
    w.entry('e-scripture', 91, { stream: 'scripture', domains: ['theology'] }),
    w.entry('f-controlled', 80, { stream: 'acquisition' }),
    w.entry('g-fresh', 95, { domains: ['travel'] }),
  ]);
  if (withPath) {
    setLadderPathSource(async ({ completed }) => ({
      steps: [{ unitId: 'u1', textId: unit1, title: 'Unit one', stage: 'a1-1', published: true }].filter((s) => !completed.has(s.textId)), finished: false,
    }));
  }
  const recs = await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps } as never);
  return recs.map((r) => [r.textId ?? r.reason, r.reason, r.score, r.explanation]);
}

describe('golden: what the shipped courses are offered (nothing new applies)', () => {
  it('Spanish, library only', async () => { expect(await offered('es', false)).toMatchInlineSnapshot(`
    [
      [
        "text:es:unit-1",
        "next-input",
        0.8,
        "Not started yet; about 100 % of its words are already shown or likely familiar.",
      ],
      [
        "text:es:g-fresh",
        "next-input",
        0.591,
        "It is on a different subject from what you read last. About 95.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:e-scripture",
        "next-input",
        0.5784,
        "It is on a different subject from what you read last. About 91.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:a-high",
        "next-input",
        0.5555,
        "About 93.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:b-mid",
        "next-input",
        0.5212,
        "About 90.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:c-edge",
        "next-input",
        0.4868,
        "About 87.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:f-controlled",
        "next-input",
        0.2169,
        "About 80.0 % of its words (names and numbers left out) are shown understood or likely familiar. You have not read it yet. It is published, with its rights on record. It was written for the course; it counts for less as ordinary texts become readable for you.",
      ],
      [
        "text:es:base",
        "reinforces-weak-items",
        0.5,
        "33 % of its words were met but not yet shown understood.",
      ],
    ]
  `); });
  it('Spanish, with the ladder next', async () => { expect(await offered('es', true)).toMatchInlineSnapshot(`
    [
      [
        "text:es:unit-1",
        "next-input",
        0.99,
        "Next on your path: "Unit one" (a1-1).",
      ],
      [
        "text:es:g-fresh",
        "next-input",
        0.591,
        "It is on a different subject from what you read last. About 95.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:e-scripture",
        "next-input",
        0.5784,
        "It is on a different subject from what you read last. About 91.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:a-high",
        "next-input",
        0.5555,
        "About 93.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:b-mid",
        "next-input",
        0.5212,
        "About 90.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:c-edge",
        "next-input",
        0.4868,
        "About 87.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:es:f-controlled",
        "next-input",
        0.2169,
        "About 80.0 % of its words (names and numbers left out) are shown understood or likely familiar. You have not read it yet. It is published, with its rights on record. It was written for the course; it counts for less as ordinary texts become readable for you.",
      ],
      [
        "text:es:base",
        "reinforces-weak-items",
        0.5,
        "33 % of its words were met but not yet shown understood.",
      ],
    ]
  `); });
  it('German, library only', async () => { expect(await offered('de', false)).toMatchInlineSnapshot(`
    [
      [
        "text:de:unit-1",
        "next-input",
        0.8,
        "Not started yet; about 100 % of its words are already shown or likely familiar.",
      ],
      [
        "text:de:g-fresh",
        "next-input",
        0.591,
        "It is on a different subject from what you read last. About 95.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:e-scripture",
        "next-input",
        0.5784,
        "It is on a different subject from what you read last. About 91.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:a-high",
        "next-input",
        0.5555,
        "About 93.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:b-mid",
        "next-input",
        0.5212,
        "About 90.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:c-edge",
        "next-input",
        0.4868,
        "About 87.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:f-controlled",
        "next-input",
        0.2169,
        "About 80.0 % of its words (names and numbers left out) are shown understood or likely familiar. You have not read it yet. It is published, with its rights on record. It was written for the course; it counts for less as ordinary texts become readable for you.",
      ],
      [
        "text:de:base",
        "reinforces-weak-items",
        0.5,
        "33 % of its words were met but not yet shown understood.",
      ],
    ]
  `); });
  it('German, with the ladder next', async () => { expect(await offered('de', true)).toMatchInlineSnapshot(`
    [
      [
        "text:de:unit-1",
        "next-input",
        0.99,
        "Next on your path: "Unit one" (a1-1).",
      ],
      [
        "text:de:g-fresh",
        "next-input",
        0.591,
        "It is on a different subject from what you read last. About 95.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:e-scripture",
        "next-input",
        0.5784,
        "It is on a different subject from what you read last. About 91.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:a-high",
        "next-input",
        0.5555,
        "About 93.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:b-mid",
        "next-input",
        0.5212,
        "About 90.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:c-edge",
        "next-input",
        0.4868,
        "About 87.0 % of its words (names and numbers left out) are shown understood or likely familiar, close to what you asked for. You have not read it yet. It is published, with its rights on record.",
      ],
      [
        "text:de:f-controlled",
        "next-input",
        0.2169,
        "About 80.0 % of its words (names and numbers left out) are shown understood or likely familiar. You have not read it yet. It is published, with its rights on record. It was written for the course; it counts for less as ordinary texts become readable for you.",
      ],
      [
        "text:de:base",
        "reinforces-weak-items",
        0.5,
        "33 % of its words were met but not yet shown understood.",
      ],
    ]
  `); });
});
