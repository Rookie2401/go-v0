/**
 * The closed classes of French: articles, contractions, pronouns, determiners, negation, prepositions, conjunctions,
 * numbers, interjections, and the three auxiliaries être, avoir and aller with every form of every simple tense. Every
 * form is listed, elided forms included (l', j', n', d' …), because these words are half of any text and must not depend
 * on the morphology engine. Machine-drafted and not checked by a native speaker.
 *
 * Forms: `lemma = gloss [tags] | form:morph tags; form:morph tags` (entries.ts). Conventions of types.ts: PronType, Definite,
 * Poss, Reflex, Polarity=Neg, Case Nom/Acc/Dat for clitics; a stressed (disjunctive) pronoun carries `Stress=Yes`; a possessive
 * carries the person of the possessor (`Person=1 Number[psor]=Sing`) beside the gender and number of the thing possessed.
 *
 * DECISIONS the contract left open:
 *  - One lemma per paradigm, as in dictionaries: le covers le, la, l', les (article and pronoun are separate entries); un covers
 *    un, une, des (indefinite); lui carries the dative clitics lui and leur; the possessive pronoun le leur is the PRON leur.
 *  - Contractions (au, aux, du, des) are ADP entries whose halves travel in `notes.components` (the `+à+le` tag, see entries.ts).
 *    du and des each have more than one entry: the contraction (ADP) and the partitive / indefinite article (DET). "de la" and
 *    "de l'" are two words, so they are not forms: de + la, de + l'.
 *  - A lemma + part of speech can be listed once, so `plus` is one ADV entry with two forms (negative "plus", and "more");
 *    the same goes for que as an adverb.
 *  - voici and voilà are PART (the presentative) and also INTJ ("there you are").
 *  - Ordinals are ADJ with NumType=Ord; the cardinals are NUM with NumType=Card. Hyphenated compounds (vingt-deux …) are
 *    generated below and written out as rows; "vingt et un" is three tokens and is not a row.
 */

type Cells = readonly [string, string, string, string, string, string];

/** One tense of a verb: six forms for je tu il nous vous ils (the order of the cells), each with the same features. */
function six(forms: Cells, feats: string): string[] {
  const persons = ['1s', '2s', '3s', '1p', '2p', '3p'];
  return forms.map((f, i) => `${f}:${persons[i]} ${feats}`);
}

/** Every simple form of one auxiliary-type verb. */
function paradigm(lemma: string, gloss: string, p: {
  pres: Cells; impf: Cells; past: Cells; fut: Cells; cond: Cells; subj: Cells; subjImpf: Cells;
  imper: readonly [string, string, string]; presPart: string; pastPart: readonly string[];
}): string {
  const forms = [
    `${lemma}:inf VerbForm=Inf`,
    ...six(p.pres, 'pres VerbForm=Fin'),
    ...six(p.impf, 'impf VerbForm=Fin'),
    ...six(p.past, 'past VerbForm=Fin'),
    ...six(p.fut, 'Tense=Fut Mood=Ind VerbForm=Fin'),
    ...six(p.cond, 'Mood=Cnd Tense=Pres VerbForm=Fin'),
    ...six(p.subj, 'subj Tense=Pres VerbForm=Fin'),
    ...six(p.subjImpf, 'subj Tense=Imp VerbForm=Fin'),
    `${p.imper[0]}:2s imper VerbForm=Fin`,
    `${p.imper[1]}:1p imper VerbForm=Fin`,
    `${p.imper[2]}:2p imper VerbForm=Fin`,
    `${p.presPart}:ptcp Tense=Pres`,
  ];
  if (p.pastPart.length === 1) forms.push(`${p.pastPart[0]}:ptcp Tense=Past`);
  else {
    const [ms, fs, mp, fp] = p.pastPart;
    forms.push(`${ms}:ptcp Tense=Past m sg`, `${fs}:ptcp Tense=Past f sg`, `${mp}:ptcp Tense=Past m pl`, `${fp}:ptcp Tense=Past f pl`);
  }
  return `${lemma} = ${gloss} | ${forms.join('; ')}`;
}

const AUXILIARIES = `
# AUX
${paradigm('être', 'to be; also the auxiliary of the compound tenses of many verbs and of the passive', {
  pres: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
  impf: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'],
  past: ['fus', 'fus', 'fut', 'fûmes', 'fûtes', 'furent'],
  fut: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
  cond: ['serais', 'serais', 'serait', 'serions', 'seriez', 'seraient'],
  subj: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'],
  subjImpf: ['fusse', 'fusses', 'fût', 'fussions', 'fussiez', 'fussent'],
  imper: ['sois', 'soyons', 'soyez'], presPart: 'étant', pastPart: ['été'],
})}
${paradigm('avoir', 'to have; also the auxiliary of the compound tenses of most verbs', {
  pres: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
  impf: ['avais', 'avais', 'avait', 'avions', 'aviez', 'avaient'],
  past: ['eus', 'eus', 'eut', 'eûmes', 'eûtes', 'eurent'],
  fut: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'],
  cond: ['aurais', 'aurais', 'aurait', 'aurions', 'auriez', 'auraient'],
  subj: ['aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'],
  subjImpf: ['eusse', 'eusses', 'eût', 'eussions', 'eussiez', 'eussent'],
  imper: ['aie', 'ayons', 'ayez'], presPart: 'ayant', pastPart: ['eu', 'eue', 'eus', 'eues'],
})}
# VERB
${paradigm('aller', 'to go; also forms the near future (je vais partir)', {
  pres: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
  impf: ['allais', 'allais', 'allait', 'allions', 'alliez', 'allaient'],
  past: ['allai', 'allas', 'alla', 'allâmes', 'allâtes', 'allèrent'],
  fut: ['irai', 'iras', 'ira', 'irons', 'irez', 'iront'],
  cond: ['irais', 'irais', 'irait', 'irions', 'iriez', 'iraient'],
  subj: ['aille', 'ailles', 'aille', 'allions', 'alliez', 'aillent'],
  subjImpf: ['allasse', 'allasses', 'allât', 'allassions', 'allassiez', 'allassent'],
  imper: ['va', 'allons', 'allez'], presPart: 'allant', pastPart: ['allé', 'allée', 'allés', 'allées'],
})}
`;

// ── numbers: the compounds written with hyphens are generated, one row each ──
const UNITS_EN = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TENS_EN = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const TEENS_EN = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const english = (n: number): string => (n % 100 < 20 && n % 100 >= 10 ? TEENS_EN[n % 10] : n % 10 === 0 ? TENS_EN[n / 10] : `${TENS_EN[Math.floor(n / 10)]}-${UNITS_EN[n % 10]}`);

function compoundNumbers(): string {
  const lines: string[] = [];
  const add = (fr: string, n: number) => lines.push(`${fr} = ${english(n)} | ${fr}:NumType=Card`);
  const units: Array<[string, number]> = [['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9]];
  const tens: Array<[string, number]> = [['vingt', 20], ['trente', 30], ['quarante', 40], ['cinquante', 50]];
  for (const [t, v] of tens) {
    add(`${t}-et-un`, v + 1);
    for (const [u, k] of units) add(`${t}-${u}`, v + k);
  }
  // soixante and the seventies (soixante-dix … soixante-dix-neuf)
  add('soixante-et-un', 61);
  for (const [u, k] of units) add(`soixante-${u}`, 60 + k);
  add('soixante-et-onze', 71);
  const teens: Array<[string, number]> = [['onze', 11], ['douze', 12], ['treize', 13], ['quatorze', 14], ['quinze', 15], ['seize', 16], ['dix-sept', 17], ['dix-huit', 18], ['dix-neuf', 19]];
  for (const [u, k] of teens) if (k !== 11) add(`soixante-${u}`, 60 + k);
  // the eighties and nineties (quatre-vingt-un … quatre-vingt-dix-neuf); Belgium and Switzerland say septante, huitante, nonante
  add('quatre-vingt-un', 81);
  for (const [u, k] of units) add(`quatre-vingt-${u}`, 80 + k);
  for (const [u, k] of teens) add(`quatre-vingt-${u}`, 80 + k);
  return lines.join('\n');
}

const SEPTANTE = (() => {
  const lines: string[] = [];
  const units: Array<[string, number]> = [['un', 1], ['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9]];
  for (const [stem, v, tag] of [['septante', 70, '[fr-BE fr-CH]'], ['nonante', 90, '[fr-BE fr-CH]'], ['huitante', 80, '[fr-CH]']] as const) {
    lines.push(`${stem} = ${english(v)} ${tag} | ${stem}:NumType=Card`);
    for (const [u, k] of units) lines.push(`${stem}-${u} = ${english(v + k)} ${tag} | ${stem}-${u}:NumType=Card`);
  }
  return lines.join('\n');
})();

/** Ordinals in -ième: lemma, English. The form is the lemma and the plural. */
const ORDINALS: Array<[string, string]> = [
  ['deuxième', 'second'], ['troisième', 'third'], ['quatrième', 'fourth'], ['cinquième', 'fifth'], ['sixième', 'sixth'], ['septième', 'seventh'],
  ['huitième', 'eighth'], ['neuvième', 'ninth'], ['dixième', 'tenth'], ['onzième', 'eleventh'], ['douzième', 'twelfth'], ['vingtième', 'twentieth'],
  ['centième', 'hundredth'], ['millième', 'thousandth'],
];
const ORDINAL_ROWS = ORDINALS.map(([w, en]) => `${w} = ${en} | ${w}:sg NumType=Ord; ${w}s:pl NumType=Ord`).join('\n');

export const FUNCTION_ROWS = `
# DET
le = the | le:m sg def art; la:f sg def art; l':sg def art; les:pl def art
un = a, an | un:m sg indef art; une:f sg indef art; des:pl indef art
du = some, any (the partitive: du pain; de la soupe and de l'eau are written as separate words) | du:m sg PronType=Part; des:pl PronType=Part
ce = this, that | ce:m sg dem; cet:m sg dem; cette:f sg dem; ces:pl dem
mon = my | mon:m sg poss Person=1 Number[psor]=Sing; mon:f sg poss Person=1 Number[psor]=Sing; ma:f sg poss Person=1 Number[psor]=Sing; mes:pl poss Person=1 Number[psor]=Sing
ton = your (informal, one person) | ton:m sg poss Person=2 Number[psor]=Sing; ton:f sg poss Person=2 Number[psor]=Sing; ta:f sg poss Person=2 Number[psor]=Sing; tes:pl poss Person=2 Number[psor]=Sing
son = his, her, its, one's | son:m sg poss Person=3 Number[psor]=Sing; son:f sg poss Person=3 Number[psor]=Sing; sa:f sg poss Person=3 Number[psor]=Sing; ses:pl poss Person=3 Number[psor]=Sing
notre = our | notre:sg poss Person=1 Number[psor]=Plur; nos:pl poss Person=1 Number[psor]=Plur
votre = your (plural or polite) | votre:sg poss Person=2 Number[psor]=Plur; vos:pl poss Person=2 Number[psor]=Plur
leur = their | leur:sg poss Person=3 Number[psor]=Plur; leurs:pl poss Person=3 Number[psor]=Plur
quel = which, what (also: what a …!) | quel:m sg int; quelle:f sg int; quels:m pl int; quelles:f pl int
quelque = some, a few | quelque:sg PronType=Ind; quelques:pl PronType=Ind
chaque = each, every | chaque:sg PronType=Ind
aucun = no, not any | aucun:m sg neg PronType=Neg; aucune:f sg neg PronType=Neg
nul = no, not any (formal) [formal] | nul:m sg neg PronType=Neg; nulle:f sg neg PronType=Neg; nuls:m pl neg PronType=Neg; nulles:f pl neg PronType=Neg
plusieurs = several | plusieurs:pl PronType=Ind
certain = certain, some | certain:m sg PronType=Ind; certaine:f sg PronType=Ind; certains:m pl PronType=Ind; certaines:f pl PronType=Ind
tout = all, every, the whole | tout:m sg PronType=Tot; toute:f sg PronType=Tot; tous:m pl PronType=Tot; toutes:f pl PronType=Tot
même = same | même:sg PronType=Ind; mêmes:pl PronType=Ind
autre = other, another | autre:sg PronType=Ind; autres:pl PronType=Ind
tel = such | tel:m sg PronType=Ind; telle:f sg PronType=Ind; tels:m pl PronType=Ind; telles:f pl PronType=Ind
# ADP
à = to, at, in | à
de = of, from, about | de; d'
en = in, into, by, as | en
au = to the, at the, in the (à + le) [+à+le] | au:m sg
aux = to the, at the (à + les) [+à+les] | aux:pl
du = of the, from the (de + le) [+de+le] | du:m sg
des = of the, from the (de + les) [+de+les] | des:pl
dans = in, inside, within
sur = on, upon, about
sous = under, beneath
avec = with
sans = without
pour = for, in order to
par = by, through, per
chez = at the home of, among
vers = toward, around
entre = between, among
contre = against
depuis = since, for (time)
pendant = during, for (time)
avant = before
après = after
devant = in front of, before
derrière = behind
jusque = until, as far as, even | jusque; jusqu'
dès = from, as early as
parmi = among
selon = according to, depending on
sauf = except, unless
malgré = despite
envers = toward (a person), with regard to
hors = outside, out of
outre = besides, beyond
durant = during
suivant = according to, depending on
concernant = concerning
moyennant = in return for, by means of
hormis = except, apart from
excepté = except
lors = at the time of (lors de)
par-dessus = over, above
par-dessous = under, beneath
vis-à-vis = facing, opposite; toward
au-dessus = above (au-dessus de)
au-dessous = below (au-dessous de)
au-delà = beyond (au-delà de)
en-dessous = underneath (en-dessous de)
# PRON
je = I | je:1s nom prs; j':1s nom prs
tu = you (informal, one person) | tu:2s nom prs
il = he, it | il:3s m nom prs
elle = she, it | elle:3s f nom prs; elle:3s f prs Stress=Yes
on = one, we, people, they | on:3s nom prs PronType=Ind
nous = we, us | nous:1p nom prs; nous:1p acc dat prs; nous:1p acc prs Reflex=Yes; nous:1p prs Stress=Yes
vous = you (plural or polite) | vous:2p nom prs; vous:2s nom prs Polite=Form; vous:2p acc dat prs; vous:2p acc prs Reflex=Yes; vous:2p prs Stress=Yes
ils = they (masculine or mixed) | ils:3p m nom prs
elles = they (feminine) | elles:3p f nom prs; elles:3p f prs Stress=Yes
me = me, to me | me:1s acc dat prs; m':1s acc dat prs; me:1s acc dat prs Reflex=Yes; m':1s acc dat prs Reflex=Yes
te = you, to you (informal) | te:2s acc dat prs; t':2s acc dat prs; te:2s acc dat prs Reflex=Yes; t':2s acc dat prs Reflex=Yes
se = himself, herself, itself, themselves, each other | se:Person=3 Case=Acc,Dat PronType=Prs Reflex=Yes; s':Person=3 Case=Acc,Dat PronType=Prs Reflex=Yes
le = him, it, them (direct object) | le:3s m acc prs; la:3s f acc prs; l':3s acc prs; les:3p acc prs
lui = to him, to her; him (after a preposition) | lui:3s dat prs; leur:3p dat prs; lui:3s m prs Stress=Yes
y = there, to it | y:prs
en = of it, of them, some; from there | en:prs
moi = me (stressed) | moi:1s prs Stress=Yes; moi:1s acc dat prs
toi = you (stressed, informal) | toi:2s prs Stress=Yes; toi:2s acc dat prs
soi = oneself | soi:3s prs Stress=Yes Reflex=Yes
eux = them (stressed, masculine) | eux:3p m prs Stress=Yes
moi-même = myself | moi-même:1s prs Stress=Yes
toi-même = yourself (informal) | toi-même:2s prs Stress=Yes
lui-même = himself | lui-même:3s m prs Stress=Yes
elle-même = herself | elle-même:3s f prs Stress=Yes
soi-même = oneself | soi-même:3s prs Stress=Yes Reflex=Yes
nous-mêmes = ourselves | nous-mêmes:1p prs Stress=Yes
vous-même = yourself (polite) | vous-même:2s prs Stress=Yes Polite=Form
vous-mêmes = yourselves | vous-mêmes:2p prs Stress=Yes
eux-mêmes = themselves (masculine) | eux-mêmes:3p m prs Stress=Yes
elles-mêmes = themselves (feminine) | elles-mêmes:3p f prs Stress=Yes
ce = it, this, that (c'est, ce sont) | ce:3s dem; c':3s dem; ç':3s dem
ceci = this | ceci:dem
cela = that | cela:dem
ça = that, it (informal) [colloquial] | ça:dem
celui = the one, he who | celui:m sg dem; celle:f sg dem; ceux:m pl dem; celles:f pl dem
celui-ci = this one, the latter | celui-ci:m sg dem; celle-ci:f sg dem; ceux-ci:m pl dem; celles-ci:f pl dem
celui-là = that one, the former | celui-là:m sg dem; celle-là:f sg dem; ceux-là:m pl dem; celles-là:f pl dem
mien = mine | mien:m sg poss Person=1 Number[psor]=Sing; mienne:f sg poss Person=1 Number[psor]=Sing; miens:m pl poss Person=1 Number[psor]=Sing; miennes:f pl poss Person=1 Number[psor]=Sing
tien = yours (informal) | tien:m sg poss Person=2 Number[psor]=Sing; tienne:f sg poss Person=2 Number[psor]=Sing; tiens:m pl poss Person=2 Number[psor]=Sing; tiennes:f pl poss Person=2 Number[psor]=Sing
sien = his, hers, its | sien:m sg poss Person=3 Number[psor]=Sing; sienne:f sg poss Person=3 Number[psor]=Sing; siens:m pl poss Person=3 Number[psor]=Sing; siennes:f pl poss Person=3 Number[psor]=Sing
nôtre = ours | nôtre:sg poss Person=1 Number[psor]=Plur; nôtres:pl poss Person=1 Number[psor]=Plur
vôtre = yours (plural or polite) | vôtre:sg poss Person=2 Number[psor]=Plur; vôtres:pl poss Person=2 Number[psor]=Plur
leur = theirs (le leur, la leur) | leur:sg poss Person=3 Number[psor]=Plur; leurs:pl poss Person=3 Number[psor]=Plur
qui = who, whom, which, that | qui:rel; qui:int
que = whom, which, that; what | que:rel; qu':rel; que:int; qu':int
quoi = what, which | quoi:int; quoi:rel
dont = whose, of which, of whom | dont:rel
lequel = which, which one | lequel:m sg PronType=Int,Rel; laquelle:f sg PronType=Int,Rel; lesquels:m pl PronType=Int,Rel; lesquelles:f pl PronType=Int,Rel
auquel = to which (à + lequel) [+à+lequel] | auquel:m sg PronType=Int,Rel
auxquels = to which (à + lesquels) [+à+lesquels] | auxquels:m pl PronType=Int,Rel
auxquelles = to which (à + lesquelles) [+à+lesquelles] | auxquelles:f pl PronType=Int,Rel
duquel = of which (de + lequel) [+de+lequel] | duquel:m sg PronType=Int,Rel
desquels = of which (de + lesquels) [+de+lesquels] | desquels:m pl PronType=Int,Rel
desquelles = of which (de + lesquelles) [+de+lesquelles] | desquelles:f pl PronType=Int,Rel
quelqu'un = someone | quelqu'un:m sg PronType=Ind; quelqu'une:f sg PronType=Ind; quelques-uns:m pl PronType=Ind; quelques-unes:f pl PronType=Ind
chacun = each one, everyone | chacun:m sg PronType=Ind; chacune:f sg PronType=Ind
aucun = none, not any, no one | aucun:m sg neg PronType=Neg; aucune:f sg neg PronType=Neg
personne = nobody, no one | personne:neg PronType=Neg
rien = nothing | rien:neg PronType=Neg
tout = everything, all | tout:m sg PronType=Tot; tous:m pl PronType=Tot; toutes:f pl PronType=Tot
plusieurs = several (people or things) | plusieurs:pl PronType=Ind
certain = some, certain ones | certains:m pl PronType=Ind; certaines:f pl PronType=Ind
autre = another, the other | autre:sg PronType=Ind; autres:pl PronType=Ind
autrui = others, other people [formal] | autrui:PronType=Ind
quiconque = whoever, anyone | quiconque:PronType=Ind
# PART
ne = not (the first half of the negation) | ne:neg; n':neg
t = (a linking t between a verb and il, elle or on: a-t-il; it has no meaning) | t
voici = here is, here are (pointing to what is near) | voici
voilà = there is, there are; here you are | voilà
# ADV
pas = not (the second half of the negation) | pas:neg
plus = more; no more, no longer (ne … plus) | plus:neg; plus
jamais = never, ever | jamais:neg
point = not at all (formal) [formal] | point:neg
guère = hardly, scarcely | guère:neg
que = only (ne … que) | que; qu'
non = no, not | non:neg
si = so, such; however | si
tout = quite, all (tout petit) | tout; toute; toutes
où = where; when, in which | où:rel; où:int
comment = how | comment:int
pourquoi = why | pourquoi:int
combien = how much, how many | combien:int
quand = when | quand:int
avant = before, beforehand
après = after, afterwards
devant = in front, ahead
derrière = behind
contre = against (a thing or person)
près = near, close
loin = far, far away
autour = around
dessus = on top, above
dessous = underneath, below
dedans = inside
dehors = outside
ainsi = thus, in this way
alors = then, so, at that time
puis = then, next
ensuite = then, afterwards
enfin = at last, finally
sinon = otherwise, or else
pourtant = yet, however
cependant = however, meanwhile
néanmoins = nevertheless
toutefois = however, nevertheless
voire = even, indeed
ci = here (written after a noun or pronoun: ce livre-ci, celui-ci)
# CONJ
et = and
ou = or
mais = but
donc = so, therefore
or = now, yet (introducing a new point)
ni = nor, neither | ni:neg
car = for, because
soit = either, or (soit … soit …)
# SCONJ
que = that, than; (also introduces the subjunctive) | que; qu'
si = if, whether | si; s'
quand = when
comme = as, like, since
lorsque = when | lorsque; lorsqu'
puisque = since, because | puisque; puisqu'
quoique = although | quoique; quoiqu'
parce = because (in parce que)
tandis = while, whereas (in tandis que)
afin = so that (afin que, afin de)
pourvu = provided that (in pourvu que)
# NUM
zéro = zero | zéro:NumType=Card
un = one | un:m sg NumType=Card; une:f sg NumType=Card
deux = two | deux:NumType=Card
trois = three | trois:NumType=Card
quatre = four | quatre:NumType=Card
cinq = five | cinq:NumType=Card
six = six | six:NumType=Card
sept = seven | sept:NumType=Card
huit = eight | huit:NumType=Card
neuf = nine | neuf:NumType=Card
dix = ten | dix:NumType=Card
onze = eleven | onze:NumType=Card
douze = twelve | douze:NumType=Card
treize = thirteen | treize:NumType=Card
quatorze = fourteen | quatorze:NumType=Card
quinze = fifteen | quinze:NumType=Card
seize = sixteen | seize:NumType=Card
dix-sept = seventeen | dix-sept:NumType=Card
dix-huit = eighteen | dix-huit:NumType=Card
dix-neuf = nineteen | dix-neuf:NumType=Card
vingt = twenty | vingt:NumType=Card; vingts:NumType=Card
trente = thirty | trente:NumType=Card
quarante = forty | quarante:NumType=Card
cinquante = fifty | cinquante:NumType=Card
soixante = sixty | soixante:NumType=Card
soixante-dix = seventy | soixante-dix:NumType=Card
quatre-vingt = eighty | quatre-vingt:NumType=Card; quatre-vingts:NumType=Card
quatre-vingt-dix = ninety | quatre-vingt-dix:NumType=Card
cent = hundred | cent:NumType=Card; cents:NumType=Card
mille = thousand | mille:NumType=Card; mil:NumType=Card
million = million | million:NumType=Card; millions:NumType=Card
milliard = billion (a thousand million) | milliard:NumType=Card; milliards:NumType=Card
${compoundNumbers()}
${SEPTANTE}
# ADJ
premier = first | premier:m sg NumType=Ord; première:f sg NumType=Ord; premiers:m pl NumType=Ord; premières:f pl NumType=Ord
second = second (of two) | second:m sg NumType=Ord; seconde:f sg NumType=Ord; seconds:m pl NumType=Ord; secondes:f pl NumType=Ord
dernier = last, latest | dernier:m sg; dernière:f sg; derniers:m pl; dernières:f pl
${ORDINAL_ROWS}
# INTJ
oui = yes
non = no
si = yes (contradicting a negative question)
bonjour = hello, good morning
bonsoir = good evening
salut = hi, bye; greetings
merci = thank you, thanks
pardon = sorry, pardon me
voilà = there you are, that's it
voici = here you are
hélas = alas
ah = ah
oh = oh
eh = hey, eh
bah = bah, well
hein = eh? huh? [colloquial]
euh = er, um
tiens = well, look; here [colloquial]
allô = hello (on the telephone)
adieu = farewell, goodbye
bravo = well done, bravo
zut = darn, blast [colloquial]
chut = hush, shh
ouf = phew
aïe = ouch
bof = meh, so-so [colloquial]
ouais = yeah [colloquial]
ciao = bye [colloquial]
${AUXILIARIES}
`;
