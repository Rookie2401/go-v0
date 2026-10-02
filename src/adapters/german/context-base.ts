/**
 * The context-free readings of one written word, as the sentence layer starts from them: the engine's readings turned
 * into candidates (provenance, confidence, `unconfirmed`), a noun's lexical gender, older spelling related to today's,
 * a compound taken apart, a derived noun noted. A pure function of the written form: computed once per form and
 * handed out as copies.
 */
import type { WordPart } from '../../core';
import { decomposeCompound } from './compounds';
import { cloneR, DE_SOURCE_IDS, addNote, capitalise, lexicalGender, norm, type C, type R } from './context';
import { historicalGerman } from './historical';
import { analyzeGermanForm } from './morphology';
import type { DeCell, DeLexiconView, DeReading } from './types';
import { morphOfCells } from './types';

const HAND_RULE = /a listed form|uninflected word of the word list|^contraction of/;

/** A DeReading as a pipeline reading. A reading the engine only infers is `unconfirmed`; a listed word is 'hand', a derived form 'rule'. */
function toR(r: DeReading): R {
  const hand = r.lemmaKnown && HAND_RULE.test(r.rule);
  const c: C = {
    lemma: r.lemma, pos: r.pos, morph: { ...r.morph }, confidence: r.lemmaKnown ? r.confidence : Math.min(r.confidence, 0.6),
    notes: { source: hand ? 'hand' : 'rule', rule: r.rule, lemmaStatus: r.lemmaKnown ? 'in the word list' : 'inferred by the rules' },
    origin: hand ? 'hand' : 'rule', sourceId: hand ? DE_SOURCE_IDS.hand : DE_SOURCE_IDS.rules,
  };
  if (r.lemmaKnown && r.gloss) c.gloss = r.gloss;
  // the verb class (strong, weak, mixed, irregular) the engine names in its rule
  const cls = (r.pos === 'VERB' || r.pos === 'AUX') && r.lemmaKnown ? /^(irregular|strong|weak|mixed) verb/.exec(r.rule)?.[1] : undefined;
  if (cls) c.notes = { ...(c.notes ?? {}), class: cls };
  if (!r.lemmaKnown) c.unconfirmed = true;
  if (r.parts?.length) c.parts = r.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  if (r.role) c.role = r.role;
  if (r.register?.length) c.register = [...r.register];
  if (r.varieties?.length) c.varieties = [...r.varieties];
  const out: R = { c, own: true };
  if (r.cells) out.cells = r.cells.map((x) => ({ ...x }));
  if (r.prefix) out.prefix = { ...r.prefix };
  return out;
}

const GENDER_NAME = { m: 'Masc', f: 'Fem', n: 'Neut' } as const;

/** A noun's lexical gender is in its morph, the plural too (the engine's cells leave it out of a plural). */
function withGender(rs: R[], lex: DeLexiconView): void {
  for (const r of rs) {
    if (r.c.pos !== 'NOUN' || r.c.morph.Gender || !r.cells?.length) continue;
    const g = lexicalGender(lex, r.c.lemma);
    if (g) r.c.morph = { ...r.c.morph, Gender: GENDER_NAME[g] };
  }
}

// ───────────────────────────── older spelling ─────────────────────────────

const union = (a: readonly string[] | undefined, b: readonly string[]): string[] => [...new Set([...(a ?? []), ...b])];

function modernReadings(form: string, lex: DeLexiconView): DeReading[] {
  return analyzeGermanForm(form, lex).filter((r) => r.lemmaKnown);
}

/** Readings of today's word an older spelling stands for, best relation first. */
function historical(surface: string, lex: DeLexiconView): R[] {
  const isModern = (form: string): boolean => analyzeGermanForm(form, lex).some((r) => r.lemmaKnown);
  const out: R[] = [];
  for (const rel of historicalGerman(surface, isModern)) {
    for (const m of modernReadings(rel.modern, lex)) {
      const r = toR(m);
      r.c.confidence = Math.min(r.c.confidence, rel.confidence);
      r.c.orthography = { modern: rel.modern, period: rel.period, confidence: rel.confidence };
      r.c.varieties = union(r.c.varieties, [rel.period]);
      r.c.origin = 'rule';
      r.c.sourceId = DE_SOURCE_IDS.rules;
      r.c.notes = { ...(r.c.notes ?? {}), source: 'rule', modern: rel.modern, spelling: rel.rule };
      out.push(r);
    }
  }
  return out;
}

// ───────────────────────────── compounds and derived nouns ─────────────────────────────

const describeParts = (parts: WordPart[]): string => parts.map((p) => (p.kind === 'link' ? `-${p.text}-` : p.text)).join(' + ');

/** A capitalised word the list does not hold, taken apart into known words: one reading per reading of the head. */
function compoundReadings(surface: string, lex: DeLexiconView): R[] {
  const d = decomposeCompound(surface, lex);
  if (!d || d.lexical) return [];
  const head = d.parts[d.parts.length - 1];
  const out: R[] = [];
  for (const h of analyzeGermanForm(capitalise(head.text), lex).filter((x) => x.pos === 'NOUN' && x.lemmaKnown)) {
    const lemma = surface.slice(0, head.start) + (h.lemma[0].toLocaleLowerCase('de') + h.lemma.slice(1));
    const cells: DeCell[] | undefined = h.cells?.map((x) => ({ ...x }));
    const morph: Record<string, string> = { ...h.morph };
    const g = lexicalGender(lex, h.lemma);
    if (g && !morph.Gender) morph.Gender = GENDER_NAME[g];
    const components = d.parts.filter((p) => p.lemma).map((p) => p.lemma as string);
    const c: C = {
      lemma, pos: 'NOUN', morph, confidence: d.confidence, unconfirmed: true,
      parts: d.parts.map((p) => ({ ...p })),
      notes: {
        source: 'rule', rule: `compound of known words (${describeParts(d.parts)}), not in the word list; the last part gives the gender and the endings`,
        lemmaStatus: 'inferred by the rules', compound: describeParts(d.parts), components,
      },
      origin: 'rule', sourceId: DE_SOURCE_IDS.rules,
    };
    const r: R = { c, own: true };
    if (cells) r.cells = cells;
    out.push(r);
  }
  return out;
}

/** The parts of a word the list holds, set beside its own lemma and gloss. */
function attachParts(rs: R[], surface: string, lex: DeLexiconView): void {
  if (surface.length < 7) return;
  const nouns = rs.filter((r) => r.c.pos === 'NOUN' && !r.c.unconfirmed && !r.c.parts);
  if (!nouns.length) return;
  const d = decomposeCompound(surface, lex);
  if (!d || !d.lexical) return;
  for (const r of nouns) {
    r.c.parts = d.parts.map((p) => ({ ...p }));
    addNote(r.c, 'compound', describeParts(d.parts));
    r.c.notes = { ...(r.c.notes ?? {}), components: d.parts.filter((p) => p.lemma).map((p) => p.lemma as string) };
  }
}

const DERIVED: Array<[RegExp, string]> = [
  [/ung$/, '-ung noun, usually made from a verb'],
  [/keit$/, '-keit noun, made from an adjective'],
  [/heit$/, '-heit noun, made from an adjective or a noun'],
  [/schaft$/, '-schaft noun: a group, a state or a quality'],
  [/tion$/, '-tion noun, from Latin: an action or its result'],
  [/nis$/, '-nis noun: a result or a state'],
  [/tum$/, '-tum noun: a state or a realm'],
];

function noteDerived(rs: R[]): void {
  for (const r of rs) {
    if (r.c.pos !== 'NOUN' || r.c.unconfirmed || !r.c.lemma || r.c.notes?.nominalization) continue;
    const l = norm(r.c.lemma);
    const hit = DERIVED.find(([re]) => re.test(l) && l.length > 5);
    if (hit) addNote(r.c, 'nominalization', hit[1]);
  }
}

/** A capitalised infinitive is a noun (das Lesen) when the list holds no noun of that spelling. */
function nominalisedInfinitive(rs: R[], surface: string): R[] {
  if (rs.some((r) => r.c.pos === 'NOUN' && !r.c.unconfirmed)) return [];
  const inf = rs.find((r) => (r.c.pos === 'VERB' || r.c.pos === 'AUX') && r.c.morph.VerbForm === 'Inf' && !r.c.unconfirmed && r.c.lemma
    && norm(r.c.lemma) === norm(surface));
  if (!inf) return [];
  const cells: DeCell[] = [{ c: 'N', g: 'n' }, { c: 'A', g: 'n' }, { c: 'D', g: 'n' }];
  const c: C = {
    lemma: capitalise(surface), pos: 'NOUN', morph: { ...morphOfCells(cells) }, confidence: 0.7,
    notes: {
      source: 'rule', rule: `the infinitive ${norm(surface)} used as a neuter noun, as in das ${surface}`, lemmaStatus: 'in the word list',
      nominalization: `infinitive used as a noun (das ${surface})`,
    },
    origin: 'rule', sourceId: DE_SOURCE_IDS.rules,
  };
  if (inf.c.gloss) c.gloss = inf.c.gloss;
  return [{ c, cells, own: true }];
}

/** A capitalised adjective is a noun inside a sentence (der Alte, das Gute): the adjective's own readings, noted. */
function nominalisedAdjectives(rs: R[], surface: string): R[] {
  if (rs.some((r) => (r.c.pos === 'NOUN' || r.c.pos === 'PROPN') && !r.c.unconfirmed)) return [];
  const out: R[] = [];
  for (const a of rs) {
    if (a.c.pos !== 'ADJ' || a.c.unconfirmed || !a.cells?.length) continue;
    const n = cloneR(a);
    n.c.confidence = Math.min(n.c.confidence, 0.7);
    n.c.role = 'adjective used as a noun';
    n.c.notes = { ...(n.c.notes ?? {}), nominalization: `adjective used as a noun (der ${norm(surface)})` };
    out.push(n);
  }
  return out;
}

// ───────────────────────────── the cache ─────────────────────────────

const CACHES = new WeakMap<DeLexiconView, Map<string, R[]>>();
const CACHE_LIMIT = 40_000;

function compute(surface: string, lex: DeLexiconView): R[] {
  const eng = analyzeGermanForm(surface, lex);
  let rs = eng.map(toR);
  withGender(rs, lex);
  const known = rs.some((r) => !r.c.unconfirmed);
  const cap = /^\p{Lu}/u.test(surface);
  if (!known) {
    const hist = historical(surface, lex);
    if (hist.length) {
      const strong = hist.some((r) => (r.c.orthography?.confidence ?? 0) >= 0.7);
      rs = [...hist, ...(strong ? [] : rs)];
    }
  }
  if (cap && !(surface.length > 1 && surface === surface.toLocaleUpperCase('de'))) {
    if (!rs.some((r) => r.c.pos === 'NOUN' && !r.c.unconfirmed)) {
      const comp = rs.some((r) => !r.c.unconfirmed) ? [] : compoundReadings(surface, lex);
      if (comp.length) rs = [...comp, ...rs.filter((r) => !(r.c.pos === 'NOUN' && r.c.unconfirmed))];
      else {
        const nom = nominalisedInfinitive(rs, surface);
        if (nom.length) rs = [...nom, ...rs];
        else rs = [...rs, ...nominalisedAdjectives(rs, surface)];
      }
    } else attachParts(rs, surface, lex);
  }
  noteDerived(rs);
  return rs;
}

/** The context-free readings of a written form (capitalisation as written), best first; a fresh copy every time. */
export function baseReadings(surface: string, lex: DeLexiconView): R[] {
  let cache = CACHES.get(lex);
  if (!cache) { cache = new Map(); CACHES.set(lex, cache); }
  let hit = cache.get(surface);
  if (!hit) {
    hit = compute(surface.normalize('NFC'), lex);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(surface, hit);
  }
  return hit.map(cloneR);
}
