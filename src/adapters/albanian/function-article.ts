/**
 * The linking article of Standard Albanian: i, e, të, së. Package Q3.
 *
 * It is NOT "the" and it has no English gloss. Before an adjective, an ordinal, a possessive or a genitive it joins
 * that word to the noun before it and agrees with that noun (djali i mirë, vajza e mirë, djemtë e mirë, vajzës së mirë).
 *
 * The table implemented (head noun's gender, number, case; "after a definite noun" = the article stands directly after a
 * definite noun, otherwise it follows another word or an indefinite noun):
 *
 *   masculine singular  nominative i                 accusative  e after a definite noun, të otherwise     gen / dat / abl  të
 *   feminine singular   nominative e                 accusative  e after a definite noun, të otherwise     gen / dat / abl  së after a definite noun, të otherwise
 *   plural (any gender) nominative / accusative  e after a definite noun, të otherwise                       gen / dat / abl  të
 *
 * Examples: djali i mirë; një djalë i mirë; djalin e mirë; një djalë të mirë; djalit të mirë; vajza e mirë; vajzën e mirë;
 * një vajzë të mirë; vajzës së mirë; një vajze të mirë; djemtë e mirë; vajzat e mira; djem të mirë; djemve të mirë.
 * Neuter nouns are not covered (they are few and abstract): the answer is empty.
 */
import type { SqLexeme } from './types';
import { F } from './function-build';

type Gender = 'Masc' | 'Fem' | 'Neut';
type Num = 'Sing' | 'Plur';
type Case = 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Abl';
type Def = 'Def' | 'Ind';

/** The linking article as a lexeme: no gloss, a role in plain words. */
export const LINKING_ARTICLE: SqLexeme = F('i', 'DET', '', [
  'i: m sg nom art',
  'e: m f sg pl nom acc art',
  'të: m f sg pl nom acc gen dat abl art',
  'së: f sg gen dat abl def art',
], {
  role: 'linking article: joins an adjective, an ordinal, a possessive or a genitive to the noun before it and agrees with that noun',
});

/**
 * The linking article that agrees with a noun of this gender, number, case and definiteness: i / e / të / së.
 * `adjacent` = the article stands directly after a definite noun (djali i mirë) rather than after another word
 * (një djalë i mirë; djali im i mirë). Returns every form in use for those features, the usual one first. When
 * `adjacent` is not given and the noun is definite, both the "directly after" form and the other one are returned.
 */
export function linkingArticle(f: { gender: Gender; number: Num; case: Case; definite: Def; adjacent?: boolean }): string[] {
  if (f.gender === 'Neut') return [];
  const definite = f.definite === 'Def';
  const direct = definite && f.adjacent !== false;
  const open = definite && f.adjacent === undefined; // either is possible
  const pick = (near: string, far: string): string[] => (direct ? (open ? [near, far] : [near]) : [far]);

  if (f.number === 'Sing' && f.case === 'Nom') return f.gender === 'Masc' ? ['i'] : ['e'];
  if (f.case === 'Nom' || f.case === 'Acc') return pick('e', 'të'); // singular accusative, plural nominative / accusative
  if (f.number === 'Sing' && f.gender === 'Fem') return pick('së', 'të'); // feminine singular genitive / dative / ablative
  return ['të'];
}

const GENDERS: Gender[] = ['Masc', 'Fem'];
const NUMBERS: Num[] = ['Sing', 'Plur'];
const CASES: Case[] = ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'];
const DEFS: Def[] = ['Def', 'Ind'];

/**
 * The features of the head noun that a given linking-article form is compatible with (the inverse of linkingArticle):
 * one entry per gender and number, cases and definiteness joined as comma unions where the form allows several.
 */
export function linkingArticleReadings(form: string): Array<{ gender: string; number: string; case: string; definite: string }> {
  const out: Array<{ gender: string; number: string; case: string; definite: string }> = [];
  for (const gender of GENDERS) {
    for (const number of NUMBERS) {
      // case sets per definiteness
      const byDef = new Map<Def, Case[]>();
      for (const definite of DEFS) {
        const cases = CASES.filter((c) => {
          const all = [
            ...linkingArticle({ gender, number, case: c, definite, adjacent: true }),
            ...linkingArticle({ gender, number, case: c, definite, adjacent: false }),
          ];
          return all.includes(form);
        });
        if (cases.length) byDef.set(definite, cases);
      }
      const defs = [...byDef.keys()];
      if (defs.length === 2 && byDef.get('Def')!.join() === byDef.get('Ind')!.join()) {
        out.push({ gender, number, case: byDef.get('Def')!.join(','), definite: 'Def,Ind' });
      } else {
        for (const d of defs) out.push({ gender, number, case: byDef.get(d)!.join(','), definite: d });
      }
    }
  }
  return out;
}
