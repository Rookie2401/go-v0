/**
 * French phrase units: words that travel together or whose meaning is not the sum of the parts. A unit is written as a spec string;
 * its words match an inflected form through the lemma of any reading of the token (avoir besoin matches j'ai eu besoin de), and a
 * fixed expression matches by its written form. Machine-drafted, not checked by a native speaker; the glosses are short English of
 * my own. A unit I was not certain of is left out. Nothing here is discovered: only listed units are found.
 *
 * Tokens (docs/french/PLAN.md): an elided word is its own token with the apostrophe, so "d'accord" is `d'` + `accord`, "parce qu'il"
 * is `parce` + `qu'` + `il`, "s'il vous plaît" is `s'` + `il` + `vous` + `plaît`; a hyphen between a verb and its clitic is a
 * non-word token, so "est-ce que" is `est` · `-` · `ce` · `que`.
 *
 * Spec syntax (one space between words):
 *   word       the written form (normalized), or any word whose lemma it is: `avoir` matches ai, avait, eu
 *   d'accord   an elision is written as in French and split into its tokens (d' + accord); `l'` matches only the elided article,
 *              `le` matches le, la, les and l' through the lemma
 *   a|b|c      any one of these words (the first names the pattern)
 *   avoir~     up to two modifier words (adverb, determiner, adjective, `n'`) may follow: j'ai toujours très faim, il n'y a pas
 *   est+ce     a clitic written after a hyphen: one token (the hyphen) is allowed between the two (est-ce, allez-vous); the
 *              matcher cannot ask that the skipped token be a hyphen, so one word could also stand there: a known limit
 *   (se)       the reflexive pronoun of a pronominal verb: me te se (m' t' s') before the verb, or nous nous / vous vous; in a
 *              compound tense an auxiliary (and an adverb) may stand between: elle s'est bien souvenue
 *   _          a verb (an infinitive complement): venir de _
 *   *          any one word        #   a number, a determiner or an adjective (il y a deux ans)
 *
 * Limits worth knowing: the reflexive pronouns me and te are also object pronouns, so "il me passe le sel" can match the unit
 * se passer; the pronominal units that are ordinary verbs also carry a lower confidence (0.8) for that reason.
 */
import type { PhraseItem, PhraseRule } from '../shared';

type Kind = PhraseRule['kind'];
/** [spec, gloss, kind, display (defaults to the spec words, infinitives as written), confidence (default 0.9)] */
type Unit = readonly [spec: string, gloss: string, kind: Kind, display?: string, confidence?: number];

export const PHRASE_UNITS: readonly Unit[] = [
  // ── il y a, impersonal il
  ['il~ y avoir', 'there is, there are (il y a, il y avait, il y aura)', 'idiom', 'il y a'],
  ['il~ y avoir # an|ans|jour|jours|semaine|semaines|mois|heure|heures|minute|minutes|siècle|siècles|année|années|moment', 'ago (il y a deux ans)', 'collocation', 'il y a … (time)', 0.85],
  ['il falloir', 'it is necessary, one must (il faut)', 'construction', 'il faut'],
  ['il falloir que', 'it is necessary that (the subjunctive follows)', 'construction', 'il faut que'],
  ['il valoir mieux', 'it is better to', 'idiom', 'il vaut mieux'],
  ['il être temps de', 'it is time to', 'idiom', 'il est temps de'],
  ['il être question de', 'it is a matter of, it is about', 'idiom', 'il est question de'],
  ['il~ (se) agir de', 'it is a question of, it is about (il s\'agit de)', 'idiom', 'il s\'agit de'],
  ['il~ (se) pouvoir que', 'it may be that (the subjunctive follows)', 'idiom', 'il se peut que'],
  ['il paraître que', 'it seems that, apparently', 'idiom', 'il paraît que'],
  ['il suffire de', 'it is enough to', 'idiom', 'il suffit de'],
  ['il faire~ beau', 'the weather is fine', 'collocation', 'il fait beau'],
  ['il faire~ mauvais', 'the weather is bad', 'collocation', 'il fait mauvais'],
  ['il faire~ chaud', 'it is hot (weather)', 'collocation', 'il fait chaud'],
  ['il faire~ froid', 'it is cold (weather)', 'collocation', 'il fait froid'],
  ['il faire~ doux', 'it is mild (weather)', 'collocation', 'il fait doux'],
  ['il faire~ frais', 'it is cool (weather)', 'collocation', 'il fait frais'],
  ['il faire nuit', 'it is dark, it is night', 'collocation', 'il fait nuit'],
  ['il faire jour', 'it is daylight', 'collocation', 'il fait jour'],
  ['il était une fois', 'once upon a time (opening of a tale)', 'formula'],
  // ── avoir
  ['avoir~ besoin', 'to need (usually + de)', 'idiom', 'avoir besoin de'],
  ['avoir~ envie', 'to feel like, to want (usually + de)', 'idiom', 'avoir envie de'],
  ['avoir~ peur', 'to be afraid (usually + de)', 'idiom', 'avoir peur de'],
  ['avoir~ honte', 'to be ashamed (usually + de)', 'idiom', 'avoir honte de'],
  ['avoir~ raison', 'to be right', 'idiom'],
  ['avoir~ tort', 'to be wrong', 'idiom'],
  ['avoir~ faim', 'to be hungry', 'idiom'],
  ['avoir~ soif', 'to be thirsty', 'idiom'],
  ['avoir~ chaud', 'to be hot (a person)', 'idiom'],
  ['avoir~ froid', 'to be cold (a person)', 'idiom'],
  ['avoir~ sommeil', 'to be sleepy', 'idiom'],
  ['avoir lieu', 'to take place', 'collocation'],
  ['avoir l\'air', 'to look, to seem (avoir l\'air + adjective, or de + infinitive)', 'idiom'],
  ['avoir beau _', 'to do (something) in vain, however much one does it', 'construction', 'avoir beau …'],
  ['avoir # an|ans', 'to be … years old', 'idiom', 'avoir … ans'],
  ['avoir~ mal à|au|aux', 'to have a pain in, to hurt', 'frame', 'avoir mal à …'],
  ['avoir de la chance', 'to be lucky', 'idiom'],
  ['avoir le droit de', 'to have the right to, to be allowed to', 'collocation'],
  ['avoir l\'habitude de', 'to be used to, to be in the habit of', 'collocation'],
  ['avoir l\'intention de', 'to intend to', 'collocation'],
  ['avoir du mal à _', 'to have trouble (doing)', 'construction', 'avoir du mal à …'],
  ['avoir affaire à|au|aux', 'to have to deal with', 'idiom', 'avoir affaire à …'],
  ['avoir pitié de', 'to have pity on', 'idiom'],
  // ── être
  ['être en train de _', 'to be in the middle of (doing)', 'construction', 'être en train de …'],
  ['être~ d\'accord', 'to agree', 'idiom', 'être d\'accord'],
  ['être sur le point de _', 'to be about to (do)', 'construction', 'être sur le point de …'],
  ['être~ en retard', 'to be late', 'collocation'],
  ['être~ en colère', 'to be angry', 'collocation'],
  ['être de retour', 'to be back', 'collocation'],
  ['être à l\'aise', 'to be at ease, to be comfortable', 'collocation'],
  // ── faire
  ['faire~ attention', 'to pay attention, to be careful', 'idiom'],
  ['faire partie de', 'to be part of, to belong to', 'idiom'],
  ['faire semblant de _', 'to pretend (to do)', 'idiom', 'faire semblant de …'],
  ['faire la connaissance de', 'to meet (someone) for the first time, to get to know', 'idiom'],
  ['faire~ connaissance', 'to get acquainted, to meet', 'collocation'],
  ['faire face à|au|aux', 'to face, to cope with', 'collocation', 'faire face à …'],
  ['faire~ plaisir', 'to please, to give pleasure to (usually + à)', 'idiom', 'faire plaisir à …'],
  ['faire~ peur', 'to frighten (usually + à)', 'idiom', 'faire peur à …'],
  ['faire~ mal', 'to hurt (usually + à)', 'idiom', 'faire mal à …'],
  ['faire la queue', 'to queue, to stand in line', 'collocation'],
  ['faire la cuisine', 'to cook, to do the cooking', 'collocation'],
  ['faire la vaisselle', 'to do the dishes', 'collocation'],
  ['faire les courses', 'to do the shopping', 'collocation'],
  ['faire un tour', 'to take a walk or a ride', 'collocation'],
  ['faire un pas', 'to take a step', 'collocation'],
  ['faire un voyage', 'to take a trip', 'collocation'],
  ['faire~ demi-tour', 'to turn back, to turn round', 'collocation'],
  // ── pronominal verbs (the reflexive pronoun stands before the verb)
  ['(se) rendre compte', 'to realize, to become aware (de or que follows)', 'idiom', 'se rendre compte (de, que)'],
  ['(se) souvenir', 'to remember (de follows)', 'frame', 'se souvenir de …'],
  ['(se) passer', 'to happen, to take place', 'idiom', undefined, 0.8],
  ['(se) en aller', 'to go away, to leave', 'idiom', 's\'en aller'],
  ['(se) occuper de', 'to take care of, to deal with', 'frame', 's\'occuper de …'],
  ['(se) intéresser à|au|aux', 'to be interested in', 'frame', 's\'intéresser à …'],
  ['(se) mettre à _', 'to start (doing)', 'construction', 'se mettre à …'],
  ['(se) servir de', 'to use', 'frame', 'se servir de …'],
  ['(se) moquer de', 'to make fun of; not to care about', 'frame', 'se moquer de …'],
  ['(se) mettre~ d\'accord', 'to come to an agreement', 'idiom', 'se mettre d\'accord'],
  ['(se) mettre en colère', 'to get angry', 'idiom'],
  ['(se) appeler', 'to be called (je m\'appelle: my name is)', 'idiom', 's\'appeler', 0.8],
  ['(se) lever', 'to get up', 'collocation', undefined, 0.8],
  ['(se) coucher', 'to go to bed', 'collocation', undefined, 0.8],
  ['(se) réveiller', 'to wake up', 'collocation', undefined, 0.8],
  ['(se) promener', 'to go for a walk', 'collocation', undefined, 0.8],
  ['(se) dépêcher', 'to hurry', 'collocation', undefined, 0.8],
  ['(se) demander', 'to wonder', 'idiom', undefined, 0.8],
  ['(se) tromper', 'to be mistaken, to make a mistake', 'idiom', undefined, 0.8],
  ['(se) plaindre de', 'to complain about', 'frame', 'se plaindre de …'],
  ['(se) fier à|au|aux', 'to trust', 'frame', 'se fier à …'],
  // ── verb + preposition, and verb + infinitive
  ['venir de _', 'to have just (done)', 'construction', 'venir de …'],
  ['finir par _', 'to end up (doing)', 'construction', 'finir par …'],
  ['commencer à _', 'to begin to (do)', 'construction', 'commencer à …'],
  ['commencer par _', 'to begin by (doing)', 'construction', 'commencer par …'],
  ['continuer à|de _', 'to continue to (do)', 'construction', 'continuer à …'],
  ['essayer de _', 'to try to (do)', 'construction', 'essayer de …'],
  ['décider de _', 'to decide to (do)', 'construction', 'décider de …'],
  ['réussir à _', 'to succeed in (doing)', 'construction', 'réussir à …'],
  ['arriver à _', 'to manage to (do)', 'construction', 'arriver à …'],
  ['oublier de _', 'to forget to (do)', 'construction', 'oublier de …'],
  ['cesser de _', 'to stop (doing)', 'construction', 'cesser de …'],
  ['apprendre à _', 'to learn to (do)', 'construction', 'apprendre à …'],
  ['chercher à _', 'to try to, to seek to (do)', 'construction', 'chercher à …'],
  ['refuser de _', 'to refuse to (do)', 'construction', 'refuser de …'],
  ['accepter de _', 'to agree to (do)', 'construction', 'accepter de …'],
  ['promettre de _', 'to promise to (do)', 'construction', 'promettre de …'],
  ['risquer de _', 'to risk (doing), to be likely to', 'construction', 'risquer de …'],
  ['penser à|au|aux', 'to think of, about', 'frame', 'penser à …'],
  ['tenir à|au|aux', 'to be attached to, to care about, to insist on', 'frame', 'tenir à …'],
  ['vouloir dire', 'to mean', 'idiom'],
  ['laisser~ tomber', 'to drop; to give up', 'idiom'],
  ['mettre en place', 'to set up, to put in place', 'idiom'],
  ['prendre~ soin de', 'to take care of', 'idiom'],
  ['prendre~ garde', 'to be careful, to take care (à or de follows)', 'idiom'],
  ['prendre part à|au|aux', 'to take part in', 'idiom', 'prendre part à …'],
  ['prendre fin', 'to come to an end', 'idiom'],
  ['mettre fin à|au|aux', 'to put an end to', 'idiom', 'mettre fin à …'],
  ['rendre visite à|au|aux', 'to visit (a person)', 'idiom', 'rendre visite à …'],
  ['rendre service à|au|aux', 'to do (someone) a favour', 'idiom', 'rendre service à …'],
  ['tenir compte de', 'to take into account', 'idiom'],
  ['donner lieu à|au|aux', 'to give rise to', 'idiom', 'donner lieu à …'],
  ['tomber amoureux|amoureuse|amoureuses', 'to fall in love', 'idiom', 'tomber amoureux'],
  ['entendre parler de', 'to hear of, to hear about', 'collocation'],
  ['jeter un coup d\'œil', 'to take a quick look', 'idiom'],
  ['y compris', 'including', 'formula'],
  // ── subordinating phrases
  ['bien que', 'although (the subjunctive follows)', 'formula', undefined, 0.75],
  ['parce que', 'because', 'formula'],
  ['pour que', 'so that, in order that', 'formula'],
  ['afin que', 'so that, in order that', 'formula'],
  ['alors que', 'while, whereas, although', 'formula', undefined, 0.8],
  ['tandis que', 'while, whereas', 'formula'],
  ['pendant que', 'while', 'formula'],
  ['depuis que', 'since (time)', 'formula'],
  ['dès que', 'as soon as', 'formula'],
  ['avant que', 'before (the subjunctive follows)', 'formula'],
  ['après que', 'after', 'formula', undefined, 0.85],
  ['sans que', 'without (the subjunctive follows)', 'formula'],
  ['à moins que', 'unless (the subjunctive follows)', 'formula'],
  ['de sorte que', 'so that; so', 'formula'],
  ['de manière que', 'so that', 'formula'],
  ['ainsi que', 'as well as; just as', 'formula', undefined, 0.85],
  ['tant que', 'as long as', 'formula', undefined, 0.8],
  ['une fois que', 'once, after', 'formula'],
  ['jusqu\'à ce que', 'until (the subjunctive follows)', 'formula'],
  ['à condition que', 'provided that (the subjunctive follows)', 'formula'],
  ['à mesure que', 'as (progressively), as … grows', 'formula'],
  ['au moment où', 'at the moment when', 'formula'],
  ['au cas où', 'in case', 'formula'],
  ['même si', 'even if', 'formula'],
  ['si bien que', 'so that, with the result that', 'formula'],
  ['pourvu que', 'provided that, let us hope that (the subjunctive follows)', 'formula'],
  ['au fur et à mesure', 'as one goes along, gradually (de or que follows)', 'idiom'],
  ['chaque fois que', 'every time that, whenever', 'formula'],
  // ── connectives
  ['en effet', 'indeed, in fact', 'formula'],
  ['en fait', 'in fact, actually', 'formula'],
  ['en général', 'in general, usually', 'formula'],
  ['en tout cas', 'in any case', 'formula'],
  ['de toute façon', 'anyway, in any case', 'formula'],
  ['de toute manière', 'anyway, in any case', 'formula'],
  ['d\'ailleurs', 'besides, by the way', 'formula'],
  ['d\'abord', 'first, at first', 'formula'],
  ['d\'accord', 'agreed, all right', 'formula'],
  ['d\'habitude', 'usually', 'collocation'],
  ['d\'après', 'according to; after', 'collocation'],
  ['par exemple', 'for example', 'formula'],
  ['par contre', 'on the other hand, however', 'formula'],
  ['par conséquent', 'consequently', 'formula'],
  ['en revanche', 'on the other hand, in return', 'formula'],
  ['en outre', 'moreover', 'formula'],
  ['au contraire', 'on the contrary', 'formula'],
  ['après tout', 'after all', 'formula'],
  ['c\'est pourquoi', 'that is why', 'formula'],
  ['à vrai dire', 'to tell the truth', 'formula'],
  ['pour ainsi dire', 'so to speak', 'formula'],
  ['quand même', 'all the same, even so', 'collocation'],
  ['tout de même', 'all the same, nevertheless', 'collocation'],
  ['bien sûr', 'of course', 'formula'],
  ['sans doute', 'no doubt, probably', 'collocation'],
  ['à mon|ton|son|notre|votre|leur avis', 'in my (your, his, our, their) opinion', 'formula', 'à mon avis'],
  ['quant à|au|aux', 'as for, as regards', 'collocation', 'quant à …'],
  // ── adverbs of time, manner, degree
  ['tout à fait', 'quite, entirely, exactly', 'collocation'],
  ['tout à coup', 'suddenly', 'collocation'],
  ['tout de suite', 'right away, at once', 'collocation'],
  ['tout à l\'heure', 'a little while ago; in a little while', 'collocation'],
  ['tout le monde', 'everyone, everybody', 'idiom'],
  ['tout le temps', 'all the time', 'collocation'],
  ['tous les jours', 'every day', 'collocation'],
  ['tout au plus', 'at most', 'collocation'],
  ['pas du tout', 'not at all', 'collocation'],
  ['de plus en plus', 'more and more', 'idiom'],
  ['de moins en moins', 'less and less', 'idiom'],
  ['de mieux en mieux', 'better and better', 'idiom'],
  ['de temps en temps', 'from time to time', 'idiom'],
  ['de nouveau', 'again, once more', 'collocation'],
  ['de plus', 'moreover; in addition', 'collocation', undefined, 0.8],
  ['en même temps', 'at the same time', 'collocation'],
  ['en ce moment', 'at the moment, right now', 'collocation'],
  ['de nos jours', 'nowadays', 'collocation'],
  ['à la fois', 'at the same time, both', 'collocation'],
  ['à peine', 'hardly, scarcely, only just', 'collocation'],
  ['à peu près', 'about, roughly', 'collocation'],
  ['peu à peu', 'little by little', 'idiom'],
  ['plus tard', 'later', 'collocation'],
  ['plus ou moins', 'more or less', 'idiom'],
  ['par hasard', 'by chance', 'collocation'],
  ['à jamais', 'for ever', 'collocation'],
  ['sans cesse', 'ceaselessly, constantly', 'collocation'],
  ['pour la première fois', 'for the first time', 'collocation'],
  ['à présent', 'now, at present', 'collocation'],
  ['jusqu\'ici', 'until now, so far', 'collocation'],
  ['en vain', 'in vain', 'collocation'],
  ['quelque chose', 'something', 'collocation'],
  ['quelque part', 'somewhere', 'collocation'],
  ['nulle part', 'nowhere', 'collocation'],
  ['n\'importe quoi', 'anything at all; nonsense', 'idiom'],
  ['n\'importe qui', 'anyone at all', 'idiom'],
  ['n\'importe où', 'anywhere at all', 'idiom'],
  ['n\'importe quand', 'at any time at all', 'idiom'],
  ['n\'importe comment', 'anyhow', 'idiom'],
  ['n\'importe quel|quelle|quels|quelles', 'any … at all', 'idiom', 'n\'importe quel'],
  // ── quantity
  ['la plupart de|des|du', 'most of, the majority of', 'collocation', 'la plupart de'],
  ['beaucoup de', 'much, many, a lot of', 'collocation'],
  ['un peu de', 'a little (of)', 'collocation'],
  ['trop de', 'too much, too many', 'collocation'],
  ['assez de', 'enough', 'collocation'],
  ['tant de', 'so much, so many', 'collocation'],
  ['bien des', 'many a, quite a few', 'collocation'],
  ['peu de', 'little, few', 'collocation'],
  ['plein de', 'full of; lots of', 'collocation', undefined, 0.8],
  // ── prepositional phrases
  ['à côté de', 'next to, beside', 'collocation'],
  ['à cause de', 'because of', 'collocation'],
  ['grâce à|au|aux', 'thanks to', 'collocation', 'grâce à'],
  ['au lieu de', 'instead of', 'collocation'],
  ['au milieu de', 'in the middle of', 'collocation'],
  ['au bout de', 'at the end of, after (a time)', 'collocation'],
  ['au sujet de', 'about, concerning', 'collocation'],
  ['au-dessus de', 'above, over', 'collocation'],
  ['au-dessous de', 'below, under', 'collocation'],
  ['au-delà de', 'beyond', 'collocation'],
  ['en face de', 'opposite, facing', 'collocation'],
  ['en dehors de', 'outside, apart from', 'collocation'],
  ['en dépit de', 'in spite of', 'collocation'],
  ['près de', 'near, close to; nearly', 'collocation', undefined, 0.8],
  ['loin de', 'far from', 'collocation'],
  ['autour de', 'around', 'collocation'],
  ['à travers', 'through, across', 'collocation'],
  ['à propos de', 'about, concerning', 'collocation'],
  ['à l\'égard de', 'towards, regarding', 'collocation'],
  ['à l\'intérieur de', 'inside', 'collocation'],
  ['à l\'extérieur de', 'outside', 'collocation'],
  ['à partir de', 'starting from, from … on', 'collocation'],
  ['à force de', 'by dint of, from so much', 'collocation'],
  ['afin de', 'in order to', 'collocation'],
  ['de la part de', 'on behalf of, from', 'collocation'],
  ['auprès de', 'beside, with, among', 'collocation'],
  ['le long de', 'along', 'collocation'],
  ['hors de', 'out of, outside', 'collocation'],
  ['jusqu\'à', 'as far as, until, even', 'collocation'],
  ['lors de', 'at the time of, during', 'collocation'],
  ['faute de', 'for lack of', 'collocation'],
  // ── everyday formulas
  ['s\'il vous plaire', 'please (polite)', 'formula', 's\'il vous plaît'],
  ['s\'il te plaire', 'please (familiar)', 'formula', 's\'il te plaît'],
  ['je vous en prier', 'you are welcome; please do', 'formula', 'je vous en prie'],
  ['je t\'en prier', 'you are welcome; please do (familiar)', 'formula', 'je t\'en prie'],
  ['de rien', 'you are welcome, it is nothing', 'formula', undefined, 0.85],
  ['merci beaucoup', 'thank you very much', 'formula'],
  ['à bientôt', 'see you soon', 'formula'],
  ['à demain', 'see you tomorrow', 'formula'],
  ['au revoir', 'goodbye', 'formula'],
  ['bonne nuit', 'good night', 'formula'],
  ['bonne chance', 'good luck', 'formula'],
  ['bon appétit', 'enjoy your meal', 'formula'],
  ['bon voyage', 'have a good trip', 'formula'],
  ['bonne journée', 'have a good day', 'formula'],
  ['au secours', 'help!', 'formula'],
  ['tant pis', 'too bad, never mind', 'formula'],
  ['tant mieux', 'so much the better, good', 'formula'],
  ['comment aller+vous', 'how are you? (polite)', 'formula', 'comment allez-vous'],
  ['comment aller+tu', 'how are you? (familiar)', 'formula', 'comment vas-tu'],
  ['comment ça aller', 'how is it going?', 'formula', 'comment ça va'],
  ['ça aller', 'it is going well; are you well?', 'formula', 'ça va'],
  ['excuser+moi', 'excuse me', 'formula', 'excusez-moi'],
  ['est+ce que', 'a question marker: is it that …?', 'formula', 'est-ce que'],
  ['qu\'est+ce que', 'what (object of a question)', 'formula', 'qu\'est-ce que'],
  ['qu\'est+ce qui', 'what (subject of a question)', 'formula', 'qu\'est-ce qui'],
  ['n\'est+ce pas', 'isn\'t it? don\'t you?', 'formula', 'n\'est-ce pas'],
];

/** The pronouns that can be the reflexive pronoun before a pronominal verb (nous and vous only when doubled: nous nous, vous vous). */
const REFLEXIVE: string[] = ['me', 'te', 'se', 'm\'', 't\'', 's\''];
const GAP_MODIFIERS: Array<'ADV' | 'DET' | 'ADJ' | 'PART'> = ['ADV', 'DET', 'ADJ', 'PART'];
const NUMERIC_SLOT: Array<'NUM' | 'DET' | 'ADJ'> = ['NUM', 'DET', 'ADJ'];

/** A quantity word takes `de` / `d'` only (beaucoup de pain, never beaucoup du pain); `afin de` and `la plupart` are listed by hand. */
const NO_CONTRACTION_AFTER: ReadonlySet<string> = new Set(['beaucoup', 'peu', 'trop', 'assez', 'tant', 'plein', 'afin', 'bien', 'faute', 'venir', 'finir', 'cesser', 'essayer', 'décider', 'oublier', 'refuser', 'accepter', 'promettre', 'risquer', 'semblant', 'temps', 'fois']);

interface Parsed { pattern: string[]; variants: PhraseItem[][]; display: string }

/** One written word of a spec → its items (the elision split, the hyphen clitic, the alternatives, the slots). */
function wordItems(raw: string, pattern: string[], out: PhraseItem[]): void {
  const elided = /^(\p{L}+')(.+)$/u.exec(raw);
  if (elided) {
    pattern.push(elided[1]); out.push(elided[1]);
    wordItems(elided[2], pattern, out);
    return;
  }
  if (raw.includes('+')) {
    raw.split('+').forEach((part, k) => {
      if (k > 0) out.push({ gap: 1 });
      wordItems(part, pattern, out);
    });
    return;
  }
  if (raw === '_') { pattern.push('_'); out.push({ slot: true, pos: ['VERB', 'AUX'] }); return; }
  if (raw === '*') { pattern.push('_'); out.push({ slot: true }); return; }
  if (raw === '#') { pattern.push('_'); out.push({ slot: true, pos: NUMERIC_SLOT }); return; }
  if (raw.includes('|')) { const alt = raw.split('|'); pattern.push(alt[0]); out.push(alt); return; }
  pattern.push(raw); out.push(raw);
}

const isVowelStart = (s: string): boolean => /^[aeiouyhàâéèêëîïôûœ]/iu.test(s);

/** The spec's pattern, its variants (the matcher's item lists) and the display. Exported for the tests. */
export function parseSpec(spec: string, display?: string): Parsed {
  const pattern: string[] = [];
  const base: PhraseItem[] = [];
  const shown: string[] = [];
  let reflexiveAt = -1;
  let pendingSe = false;
  const spoken = spec.split(' ');
  for (let k = 0; k < spoken.length; k++) {
    const raw = spoken[k];
    if (raw === '(se)') { reflexiveAt = base.length; pattern.push('se'); pendingSe = true; continue; }
    const gap = raw.endsWith('~');
    let w = gap ? raw.slice(0, -1) : raw;
    // "à côté de" is also "à côté du / des": a `de` that is not the first word and does not follow a quantity word takes the contractions
    if (w === 'de' && k > 0 && !NO_CONTRACTION_AFTER.has(spoken[k - 1].replace(/~$/u, ''))) w = 'de|du|des';
    wordItems(w, pattern, base);
    if (gap) base.push({ gap: 2, only: GAP_MODIFIERS });
    const first = w.replace(/\|.*$/u, '');
    let text = first === '_' || first === '*' || first === '#' ? '…' : first.replace(/\+/gu, '-');
    if (pendingSe) { text = (isVowelStart(text) ? 's\'' : 'se ') + text; pendingSe = false; }
    shown.push(text);
  }
  const text = display ?? shown.join(' ');
  if (reflexiveAt < 0) return { pattern, variants: [base], display: text };
  // the clitics en and y come straight after the reflexive pronoun; the auxiliary and an adverb of a compound tense follow them
  let lead = reflexiveAt;
  while (base[lead] === 'en' || base[lead] === 'y') lead++;
  const head = base.slice(0, reflexiveAt);
  const clitics = base.slice(reflexiveAt, lead);
  const rest = base.slice(lead);
  const variant = (pron: PhraseItem[]): PhraseItem[] => [...head, ...pron, ...clitics, { gap: 2, only: ['AUX', 'ADV'] }, ...rest];
  return { pattern, variants: [variant([REFLEXIVE]), variant(['nous', 'nous']), variant(['vous', 'vous'])], display: text };
}

/** The rules the adapter matches. */
export function buildPhraseRules(units: readonly Unit[] = PHRASE_UNITS): PhraseRule[] {
  return units.map(([spec, gloss, kind, display, confidence]) => {
    const p = parseSpec(spec, display);
    return { pattern: p.pattern, display: p.display, gloss, kind, variants: p.variants, ...(confidence !== undefined ? { confidence } : {}) };
  });
}

/**
 * Patterns whose last word must be an infinitive (venir de _): a noun that is also a verb form does not count. The adapter does not
 * filter with it yet (as with the Spanish list); a lead who wants only true infinitives after these frames can drop a match whose
 * last token has no VerbForm=Inf reading.
 */
export const VERB_SLOT_PATTERNS: ReadonlySet<string> = new Set(
  PHRASE_UNITS.filter((u) => u[0].endsWith(' _')).map((u) => parseSpec(u[0]).pattern.join(' ')),
);
