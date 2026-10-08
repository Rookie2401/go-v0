/**
 * Nynorsk closed classes and frequent uninflected words (recon B10 counterparts of B9). MACHINE-DRAFTED, pending native
 * review. Cells the recon marks (?) carry `^` (unverified). Nynorsk is receptive in this course: the list is smaller than
 * the Bokmål one and holds what a reader of ordinary Nynorsk meets first.
 */
import { parseWordRows } from './rows';

export const NN_FUNCTION_ROWS = `
// ── personal pronouns ──
eg|PRON|I; me|eg:prs 1 sg nom, meg:prs 1 sg acc
du|PRON|you (sg)|du:prs 2 sg nom, deg:prs 2 sg acc
han|PRON|he; him|han:prs 3 m sg nom, honom:prs 3 m sg acc
ho|PRON|she; her|ho:prs 3 f sg nom, henne:prs 3 f sg acc
vi|PRON|we; us|vi:prs 1 pl nom, me:prs 1 pl nom, oss:prs 1 pl acc
de|PRON|you (pl)|de:prs 2 pl nom, dykk:prs 2 pl acc
dei|PRON|they; them|dei:prs 3 pl, dem:prs 3 pl acc
seg|PRON|oneself (reflexive)|seg:prs refl 3 acc
ein|PRON|one (generic)|ein:prs 3 indef
// ── articles and demonstratives ──
ein|DET|a, an (the indefinite article)|ein:art ind m sg, ei:art ind f sg, eit:art ind n sg
den|DET|that, the (before an adjective)|den:dem mf sg
det|DET|that, the (before an adjective)|det:dem n sg
dei|DET|those, the (before an adjective)|dei:dem pl
den|PRON|it (masculine/feminine); that|den:prs 3 mf sg
det|PRON|it; that; there (dummy subject)|det:prs 3 n sg
denne|DET|this, these|denne:dem sg mf, dette:dem sg n, desse:dem pl
dette|PRON|this (thing)|dette:dem n sg
// ── possessives ──
min|DET|my|min:poss 1 sg m, mi:poss 1 sg f, mitt:poss 1 sg n, mine:poss 1 pl
din|DET|your (sg)|din:poss 2 sg m, di:poss 2 sg f, ditt:poss 2 sg n, dine:poss 2 pl
vår|DET|our|vår:poss 1 pl sg mf, vårt:poss 1 pl sg n, våre:poss 1 pl pl
sin|DET|his/her/its/their own (reflexive)|sin:poss refl 3 sg m, si:poss refl 3 f sg, sitt:poss refl 3 n sg, sine:poss refl 3 pl
hans|DET|his|hans:poss 3 m
hennar|DET|her|hennar:poss 3 f, hennes:poss 3 f
deira|DET|their|deira:poss 3 pl
dykkar|DET|your (pl)|dykkar:poss 2 pl
// ── other determiners and quantifiers ──
all|DET|all|all:tot sg mf, alt:tot sg n, alle:tot pl
alle|PRON|everyone|alle:tot pl
alt|PRON|everything|alt:tot n sg
heile|DET|the whole|heile:def
begge|DET|both|begge:tot pl
kvar|DET|each, every|kvar:tot sg mf, kvart:tot sg n
nokon|DET|some, any|nokon:indef sg mf, nokre:indef pl
nokon|PRON|someone, anyone|nokon:indef
noko|DET|some, any (neuter)|noko:indef n sg
noko|PRON|something, anything|noko:indef n sg
ingen|DET|no, none|ingen:negp sg mf, ingen:negp pl, inkje:negp n sg
ingenting|PRON|nothing|ingenting:negp
mange|DET|many|mange:indef pl
mykje|DET|much, a lot of|mykje:indef n sg
mykje|ADV|much, a lot|mykje
lite|ADV|little|lite
litt|ADV|a little|litt
få|DET|few|få:indef pl
fleire|DET|more (several)|fleire:cmp indef pl
flest|DET|most (of countable things)|flest:supl indef pl
meir|ADV|more|meir:cmp
meir|DET|more|meir:cmp indef
mest|ADV|most|mest:supl
mest|DET|most|mest:supl indef
slik|DET|such|slik:dem sg mf, slikt:dem sg n, slike:dem pl
sjølv|PRON|self|sjølv:prs refl, sjølve:prs refl def
same|ADJ|same|same
annan|ADJ|other, different, second|annan:pos m sg ind, anna:pos n sg ind, andre:pos pl, andre:pos def
// ── interrogatives and relatives ──
kven|PRON|who|kven:int
kva|PRON|what|kva:int
kvifor|ADV|why|kvifor:int
korleis|ADV|how|korleis:int
kvar|ADV|where|kvar:int
kor|ADV|how (before an adjective); where|kor:int
når|ADV|when (question)|når:int
som|PRON|who, which, that (relative)|som:rel
// ── auxiliaries, copulas and modals ──
vere|AUX|be|vere:inf, vera:inf, er:pres, var:past, vore:ptcp ^, ver:imp
ha|AUX|have (perfect auxiliary)|ha:inf, hava:inf, har:pres, hadde:past, hatt:ptcp
bli|AUX|become; be (passive auxiliary)|bli:inf, verte:inf, verta:inf, blir:pres, vert:pres, blei:past, vart:past, blitt:ptcp, vorte:ptcp ^
kunne|AUX|can, be able to|kunne:inf, kan:pres, kunne:past, kunna:ptcp ^
skulle|AUX|shall, should|skulle:inf, skal:pres, skulle:past, skulla:ptcp ^
ville|AUX|will, want to|ville:inf, vil:pres, ville:past, vilja:ptcp ^
måtte|AUX|must, have to|måtte:inf, må:pres, måtte:past, måtta:ptcp ^
burde|AUX|ought to|burde:inf, bør:pres, burde:past, burda:ptcp ^
tore|AUX|dare|tore:inf, tør:pres, torde:past, tort:ptcp ^
// ── prepositions ──
i|ADP|in; for (duration)|i
på|ADP|on; at|på
til|ADP|to; until|til
frå|ADP|from|frå
av|ADP|of; off; by|av
med|ADP|with|med
om|ADP|about; around; in (a period)|om
for|ADP|for; before (spatial)|for
ved|ADP|by, at, near|ved
over|ADP|over, above|over
under|ADP|under, during|under
mot|ADP|against, towards|mot
mellom|ADP|between|mellom
gjennom|ADP|through|gjennom
etter|ADP|after, according to|etter
før|ADP|before|før
utan|ADP|without|utan
hjå|ADP|at (someone's place), with|hjå
blant|ADP|among|blant
rundt|ADP|around|rundt
bak|ADP|behind|bak
framfor|ADP|in front of|framfor
sidan|ADP|since|sidan
innan|ADP|within|innan
utanfor|ADP|outside of|utanfor
langs|ADP|along|langs
// ── conjunctions and subordinators ──
og|CONJ|and|og
eller|CONJ|or|eller
men|CONJ|but|men
for|CONJ|for, because|for
så|CONJ|so (main-clause order)|så
både|CONJ|both|både
anten|CONJ|either|anten
verken|CONJ|neither|verken
at|SCONJ|that|at
fordi|SCONJ|because|fordi
viss|SCONJ|if|viss
dersom|SCONJ|if, in case|dersom
om|SCONJ|whether; if|om
medan|SCONJ|while|medan
når|SCONJ|when, whenever|når
då|SCONJ|when (a single past event)|då
sidan|SCONJ|since|sidan
før|SCONJ|before|før
enn|SCONJ|than|enn
som|SCONJ|as, like|som
// ── adverbs ──
endeleg|ADV|at last, finally|endeleg
endelig|ADV|at last, finally|endelig
før|ADV|before, earlier|før
fjor|ADV|last year (i fjor)|fjor
ikkje|ADV|not|ikkje:neg
aldri|ADV|never|aldri:neg
alltid|ADV|always|alltid
ofte|ADV|often|ofte
sjeldan|ADV|seldom|sjeldan
òg|ADV|also, too|òg
også|ADV|also, too|også
berre|ADV|only, just|berre
kun|ADV|only|kun
jo|ADV|as you know; yes (to a negative)|jo
nok|ADV|probably; enough|nok
vel|ADV|surely; well|vel
kanskje|ADV|perhaps|kanskje
ja|INTJ|yes|ja
nei|INTJ|no|nei
her|ADV|here|her
der|ADV|there|der
hit|ADV|(to) here|hit
dit|ADV|(to) there|dit
heim|ADV|(to) home|heim
heime|ADV|at home|heime
borte|ADV|away; over there|borte
ute|ADV|outside, out|ute
inne|ADV|inside, in|inne
opp|ADV|up|opp
ned|ADV|down|ned
inn|ADV|in (into)|inn
ut|ADV|out|ut
fram|ADV|forward|fram
bort|ADV|away|bort
tilbake|ADV|back|tilbake
saman|ADV|together|saman
no|ADV|now|no
nå|ADV|now|nå
då|ADV|then; well|då
så|ADV|then; so, such|så
igjen|ADV|again; left|igjen
enno|ADV|yet, still|enno
endå|ADV|even (before a comparative); still|endå
framleis|ADV|still|framleis
allereie|ADV|already|allereie
snart|ADV|soon|snart
nesten|ADV|almost|nesten
veldig|ADV|very|veldig
ganske|ADV|quite|ganske
heilt|ADV|completely|heilt
svært|ADV|very|svært
først|ADV|first, at first|først
sist|ADV|last|sist
seinare|ADV|later|seinare
plutseleg|ADV|suddenly|plutseleg
tidleg|ADV|early|tidleg
seint|ADV|late|seint
fort|ADV|fast; quickly|fort
sakte|ADV|slowly|sakte
lenge|ADV|for a long time|lenge
godt|ADV|well|godt
pent|ADV|nicely|pent
heller|ADV|rather|heller
difor|ADV|therefore|difor
likevel|ADV|nevertheless|likevel
faktisk|ADV|actually|faktisk
gjerne|ADV|gladly, willingly|gjerne
// ── numerals ──
ein|NUM|one|ein:card m, eit:card n
to|NUM|two|to:card
tre|NUM|three|tre:card
fire|NUM|four|fire:card
fem|NUM|five|fem:card
seks|NUM|six|seks:card
sju|NUM|seven|sju:card
syv|NUM|seven|syv:card
åtte|NUM|eight|åtte:card
ni|NUM|nine|ni:card
ti|NUM|ten|ti:card
tjue|NUM|twenty|tjue:card
tyve|NUM|twenty|tyve:card
hundre|NUM|hundred|hundre:card
tusen|NUM|thousand|tusen:card
første|ADJ|first|første:ord
andre|ADJ|second (ordinal)|andre:ord
tredje|ADJ|third|tredje:ord
fjerde|ADJ|fourth|fjerde:ord
femte|ADJ|fifth|femte:ord
// ── particles and interjections ──
å|PART|to (infinitive marker)|å
takk|INTJ|thanks|takk
hei|INTJ|hello|hei
ævelegt|ADJ|eternal (Landsmål spelling)|ævelegt:pos n sg ind @nn-landsmal
amen|INTJ|amen|amen
`;

export const NN_FUNCTION_FORMS = parseWordRows(NN_FUNCTION_ROWS);
