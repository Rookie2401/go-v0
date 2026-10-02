/**
 * Spanish verb generator, part 2: stem-changing verbs (pensar → pienso, volver → vuelvo, pedir → pido, dormir →
 * durmió). Whether a verb changes its stem is a fact about that verb, not something the spelling shows, so this file
 * holds the lists. A verb that is on no list is conjugated as regular (the analyser may still ASSUME a class for a
 * lemma that someone vouched for, and then says so).
 */
import { nuclei } from './morph-orth';
import { regularParadigm, stemOf, type Paradigm } from './verb-regular';

/** 'hiatus' is not a vowel change: the stem's last weak vowel (i, u) after a strong one takes the stress and a written accent (reunir → reúno, prohibir → prohíbo). */
export type StemKind = 'e>ie' | 'o>ue' | 'u>ue' | 'e>i' | 'i>ie' | 'o>hue' | 'e>ye' | 'hiatus';
export interface StemClass { kind: StemKind; /** -ir verbs of the sentir / dormir group also change in the 3rd preterite, gerund and nosotros subjunctive. */ shift: boolean }

const words = (s: string): string[] => s.trim().split(/\s+/);

const E_IE = words(`
pensar cerrar empezar comenzar sentar asentar despertar negar regar fregar segar cegar plegar doblegar desplegar replegar
calentar apretar merendar temblar quebrar nevar helar tropezar acertar atravesar confesar gobernar recomendar encomendar
manifestar arrendar enterrar alentar sembrar encerrar concertar desconcertar escarmentar invernar herrar serrar tentar
trasegar
entender perder defender encender atender tender extender descender ascender condescender trascender contender cerner
heder hender verter reverter
`);
const E_IE_IR = words(`
sentir mentir preferir divertir convertir herir hervir sugerir advertir invertir referir transferir requerir consentir
arrepentir pervertir diferir inferir conferir digerir ingerir presentir resentir revertir subvertir controvertir proferir
adherir
`);
const E_IE_IR_NOSHIFT = words('discernir cernir');
const I_IE = words('adquirir inquirir');
const O_UE = words(`
contar encontrar mostrar costar probar recordar volar soñar sonar resonar rodar almorzar colgar descolgar rogar acordar
acostar aprobar reprobar comprobar demostrar forzar esforzar reforzar volcar revolcar renovar tostar apostar poblar
consolar degollar soltar tronar trocar holgar descontar recontar
volver devolver envolver resolver disolver absolver revolver mover promover conmover remover llover moler doler soler
morder remorder torcer retorcer cocer escocer recocer avergonzar agorar
`);
const O_UE_IR = words('dormir morir');
const E_I = words(`
pedir servir repetir vestir medir elegir corregir competir despedir impedir concebir rendir teñir reñir gemir derretir
colegir expedir ceñir regir embestir investir revestir desvestir seguir conseguir perseguir proseguir reelegir henchir
`);

/**
 * Verbs whose stem keeps a weak vowel apart from the strong one before it, so that the stressed forms carry an accent
 * (aíslo, prohíbo, reúno, rehúso, maúllo, ahúmo) where the regular ones keep a diphthong (bailo, causo).
 * Which verbs do is a fact about each verb; the unaccented stem of these is only found in nosotros / vosotros forms.
 */
const HIATUS = words(`
aislar desaislar aullar maullar aunar reunir prohibir cohibir ahumar sahumar ahusar ahijar ahilar rehilar rehusar
ahincar enraizar desenraizar descafeinar embaular aupar
`);

const TABLE = new Map<string, StemClass>();
for (const l of HIATUS) TABLE.set(l, { kind: 'hiatus', shift: false });
for (const l of E_IE) TABLE.set(l, { kind: 'e>ie', shift: false });
for (const l of E_IE_IR) TABLE.set(l, { kind: 'e>ie', shift: true });
for (const l of E_IE_IR_NOSHIFT) TABLE.set(l, { kind: 'e>ie', shift: false });
for (const l of I_IE) TABLE.set(l, { kind: 'i>ie', shift: false });
for (const l of O_UE) TABLE.set(l, { kind: 'o>ue', shift: false });
for (const l of O_UE_IR) TABLE.set(l, { kind: 'o>ue', shift: true });
for (const l of E_I) TABLE.set(l, { kind: 'e>i', shift: true });
TABLE.set('jugar', { kind: 'u>ue', shift: false });
TABLE.set('oler', { kind: 'o>hue', shift: false });
TABLE.set('errar', { kind: 'e>ye', shift: false });

/** Prefixes that keep a listed verb's pattern (reconvertir, desmentir, reapretar). Deliberately short: pre-tender is regular. */
const SAFE_PREFIXES = ['re', 'des'];

export function stemClassOf(lemma: string): StemClass | undefined {
  const direct = TABLE.get(lemma);
  if (direct) return direct;
  for (const pre of SAFE_PREFIXES) if (lemma.startsWith(pre) && lemma.length > pre.length + 3) {
    const c = TABLE.get(lemma.slice(pre.length));
    if (c) return c;
  }
  return undefined;
}

const SHIFT: Record<string, string> = { e: 'i', o: 'u' };

/** The stem with its last (sounded) vowel changed, and the vowel that changes. */
function changeStem(stem: string, kind: Exclude<StemKind, 'hiatus'>): { strong: string; shifted: string } | undefined {
  const ns = nuclei(stem + 'i').filter(([s]) => s < stem.length); // the ending's vowel decides whether a final u is silent (segu-ir)
  if (!ns.length) return undefined;
  const [s, e] = ns[ns.length - 1];
  const nucleus = stem.slice(s, e);
  const from = kind[0];
  const idx = nucleus.indexOf(from);
  if (idx < 0 || nucleus.length > 1) return undefined;
  const at = s + idx;
  const to: Record<Exclude<StemKind, 'hiatus'>, string> = { 'e>ie': 'ie', 'o>ue': 'ue', 'u>ue': 'ue', 'e>i': 'i', 'i>ie': 'ie', 'o>hue': 'hue', 'e>ye': 'ye' };
  let strong = stem.slice(0, at) + to[kind] + stem.slice(at + 1);
  // a stem that starts with the changing vowel: ye- / hue- are the whole stressed form (errar → yerr-, oler → huel-)
  if (kind === 'e>ye' && at !== 0) strong = stem.slice(0, at) + 'ie' + stem.slice(at + 1);
  // go → güe, not gue (avergonzar → avergüenzo, agorar → agüero): the u must be sounded
  if (kind === 'o>ue' && stem[at - 1] === 'g') strong = stem.slice(0, at) + 'üe' + stem.slice(at + 1);
  const sh = SHIFT[from];
  const shifted = sh ? stem.slice(0, at) + sh + stem.slice(at + 1) : stem;
  return { strong, shifted };
}

/**
 * The stem with the accent on its weak vowel: after a strong one (reun → reún, prohib → prohíb, aisl → aísl), or at
 * its end (hasti → hastí, the enviar class of -iar verbs); undefined when the stem has no such vowel.
 */
export function hiatusStem(stem: string): string | undefined {
  const m = /^(.*[aeo]h?)([iu])([^aeiouáéíóúü]+)$/.exec(stem) ?? /^(.*[^aeiouáéíóúügq])([iu])()$/.exec(stem);
  return m ? m[1] + (m[2] === 'i' ? 'í' : 'ú') + m[3] : undefined;
}

/** A paradigm for a stem-changing verb of the given class, or undefined when the stem has no vowel to change. */
export function stemChangeParadigm(lemma: string, cls: StemClass, assumed?: string): Paradigm | undefined {
  const base = regularParadigm(lemma);
  const st = stemOf(lemma);
  if (!base || !st) return undefined;
  const kind = cls.kind;
  if (kind === 'hiatus') {
    const hs = hiatusStem(st.stem);
    return hs ? { ...base, presStrong: hs, pres1: hs, subStrong: hs, kind: 'stem-change', ...(assumed ? { assumed } : {}) } : undefined;
  }
  const ch = changeStem(st.stem, kind);
  if (!ch) return undefined;
  const useShift = st.cls === 'ir' && cls.shift;
  const shifted = useShift ? ch.shifted : st.stem;
  return {
    ...base,
    presStrong: ch.strong,
    pres1: ch.strong,
    subStrong: ch.strong,
    subWeak: shifted,
    stemPret3: shifted,
    kind: 'stem-change',
    ...(assumed ? { assumed } : {}),
  };
}

/** The classes the analyser may assume for a vouched-for verb that is on no list, given the lemma's ending class. */
export function assumableClasses(cls: 'ar' | 'er' | 'ir'): StemClass[] {
  if (cls === 'ir') return [
    { kind: 'e>ie', shift: true }, { kind: 'o>ue', shift: true }, { kind: 'e>i', shift: true },
  ];
  return [{ kind: 'e>ie', shift: false }, { kind: 'o>ue', shift: false }];
}

/** The accent-on-the-stem class (reúno, aíslo): assumed for a verb on no list only when the written form shows that accent. */
export const HIATUS_CLASS: StemClass = { kind: 'hiatus', shift: false };
