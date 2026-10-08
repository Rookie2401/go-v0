/**
 * Bokmål closed classes and frequent uninflected words (recon B9). MACHINE-DRAFTED, pending native review: no row has
 * been checked against Norsk ordbank. Every form is written out; the order of rows is the frequency order used to rank
 * readings of the same form (frequent first).
 */
import { parseWordRows } from './rows';

export const NB_FUNCTION_ROWS = `
// ── personal pronouns (object forms share the subject form's lemma) ──
jeg|PRON|I; me|jeg:prs 1 sg nom, meg:prs 1 sg acc
du|PRON|you (sg)|du:prs 2 sg nom, deg:prs 2 sg acc
han|PRON|he; him|han:prs 3 m sg nom, ham:prs 3 m sg acc
hun|PRON|she; her|hun:prs 3 f sg nom, henne:prs 3 f sg acc
vi|PRON|we; us|vi:prs 1 pl nom, oss:prs 1 pl acc
dere|PRON|you (pl)|dere:prs 2 pl
de|PRON|they; them|de:prs 3 pl nom, dem:prs 3 pl acc
seg|PRON|oneself (reflexive)|seg:prs refl 3 acc
man|PRON|one, you (generic)|man:prs 3 indef
// ── articles and demonstratives ──
en|DET|a, an (the indefinite article)|en:art ind mf sg, ei:art ind f sg, et:art ind n sg
den|DET|that, the (before an adjective)|den:dem mf sg
det|DET|that, the (before an adjective)|det:dem n sg
de|DET|those, the (before an adjective)|de:dem pl
den|PRON|it (en/ei noun); that|den:prs 3 mf sg
det|PRON|it; that; there (dummy subject)|det:prs 3 n sg
denne|DET|this, these|denne:dem sg mf, dette:dem sg n, disse:dem pl
dette|PRON|this (thing)|dette:dem n sg
disse|PRON|these|disse:dem pl
// ── possessives (the form agrees with the thing possessed) ──
min|DET|my|min:poss 1 sg mf, mi:poss 1 sg f, mitt:poss 1 sg n, mine:poss 1 pl
din|DET|your (sg)|din:poss 2 sg mf, di:poss 2 sg f, ditt:poss 2 sg n, dine:poss 2 pl
vår|DET|our|vår:poss 1 pl sg mf, vårt:poss 1 pl sg n, våre:poss 1 pl pl
sin|DET|his/her/its/their own (reflexive)|sin:poss refl 3 sg mf, si:poss refl 3 f sg, sitt:poss refl 3 n sg, sine:poss refl 3 pl
hans|DET|his|hans:poss 3 m
hennes|DET|her|hennes:poss 3 f
deres|DET|their; your (pl)|deres:poss
dens|DET|its (en/ei noun)|dens:poss 3
dets|DET|its (et noun)|dets:poss 3
// ── other determiners and quantifiers ──
all|DET|all|all:tot sg mf, alt:tot sg n, alle:tot pl
alle|PRON|everyone|alle:tot pl
alt|PRON|everything|alt:tot n sg
hele|DET|the whole|hele:def
begge|DET|both|begge:tot pl
hver|DET|each, every|hver:tot sg mf, hvert:tot sg n
noen|DET|some, any|noen:indef sg mf, noen:indef pl
noen|PRON|someone, anyone|noen:indef
noe|DET|some, any (neuter)|noe:indef n sg
noe|PRON|something, anything|noe:indef n sg
ingen|DET|no, none|ingen:negp sg mf, ingen:negp pl, intet:negp n sg
ingenting|PRON|nothing|ingenting:negp
mange|DET|many|mange:indef pl
mange|PRON|many (people)|mange:indef pl
mye|DET|much, a lot of|mye:indef n sg
mye|ADV|much, a lot|mye
lite|ADV|little|lite
litt|ADV|a little|litt
få|DET|few|få:indef pl
flere|DET|more (several)|flere:cmp indef pl
flest|DET|most (of countable things)|flest:supl indef pl
mer|ADV|more|mer:cmp
mer|DET|more|mer:cmp indef
mest|ADV|most|mest:supl
mest|DET|most|mest:supl indef
slik|DET|such|slik:dem sg mf, slikt:dem sg n, slike:dem pl
sånn|DET|such, like that|sånn:dem sg mf, sånt:dem sg n, sånne:dem pl
selv|PRON|self|selv:prs refl, selve:prs refl def
samme|ADJ|same|samme
annen|ADJ|other, different, second|annen:pos m sg ind, annet:pos n sg ind, andre:pos pl, andre:pos def
hverandre|PRON|each other|hverandre:prs rec
// ── interrogatives and relatives ──
hvem|PRON|who|hvem:int
hva|PRON|what|hva:int
hvilken|DET|which|hvilken:int sg mf, hvilket:int sg n, hvilke:int pl
hvor|ADV|where; how (before an adjective)|hvor:int
hvordan|ADV|how|hvordan:int
hvorfor|ADV|why|hvorfor:int
når|ADV|when (question)|når:int
som|PRON|who, which, that (relative)|som:rel
hvis|PRON|whose (formal)|hvis:rel
// ── auxiliaries, copulas and modals ──
være|AUX|be|være:inf, er:pres, var:past, vært:ptcp, vær:imp
ha|AUX|have (perfect auxiliary)|ha:inf, har:pres, hadde:past, hatt:ptcp, ha:imp
bli|AUX|become; be (passive auxiliary)|bli:inf, blir:pres, ble:past, blei:past #colloquial, blitt:ptcp, bli:imp
kunne|AUX|can, be able to|kunne:inf, kan:pres, kunne:past, kunnet:ptcp
skulle|AUX|shall, should, be going to|skulle:inf, skal:pres, skulle:past, skullet:ptcp
ville|AUX|will, want to|ville:inf, vil:pres, ville:past, villet:ptcp
måtte|AUX|must, have to|måtte:inf, må:pres, måtte:past, måttet:ptcp
burde|AUX|ought to|burde:inf, bør:pres, burde:past, burdet:ptcp
tørre|AUX|dare|tørre:inf, tør:pres, torde:past, turt:ptcp ^
// ── prepositions ──
i|ADP|in; for (duration)|i
på|ADP|on; at|på
til|ADP|to; until|til
fra|ADP|from|fra
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
uten|ADP|without|uten
hos|ADP|at (someone's place), with|hos
blant|ADP|among|blant
rundt|ADP|around|rundt
ifølge|ADP|according to|ifølge
bak|ADP|behind|bak
foran|ADP|in front of|foran
siden|ADP|since|siden
innen|ADP|within, by (a time)|innen
innenfor|ADP|inside of|innenfor
utenfor|ADP|outside of|utenfor
overfor|ADP|opposite, towards|overfor
langs|ADP|along|langs
via|ADP|via|via
per|ADP|per|per
nær|ADP|near|nær
inntil|ADP|up to; until|inntil
unntatt|ADP|except|unntatt
omkring|ADP|around|omkring
// ── conjunctions and subordinators ──
og|CONJ|and|og
eller|CONJ|or|eller
men|CONJ|but|men
for|CONJ|for, because (main-clause order)|for
så|CONJ|so (main-clause order)|så
både|CONJ|both|både
enten|CONJ|either|enten
verken|CONJ|neither|verken
samt|CONJ|as well as|samt
at|SCONJ|that|at
fordi|SCONJ|because|fordi
hvis|SCONJ|if|hvis
om|SCONJ|whether; if|om
mens|SCONJ|while|mens
når|SCONJ|when, whenever|når
da|SCONJ|when (a single past event)|da
siden|SCONJ|since|siden
før|SCONJ|before|før
dersom|SCONJ|if, in case|dersom
enn|SCONJ|than|enn
som|SCONJ|as, like|som
idet|SCONJ|as, just as|idet
ettersom|SCONJ|since, as|ettersom
slik|SCONJ|so that (colloquial)|slik
forat|SCONJ|so that (older spelling of for at)|forat:#archaic @nb-riksmal
// ── adverbs ──
endelig|ADV|at last, finally|endelig
før|ADV|before, earlier|før
fjor|ADV|last year (i fjor)|fjor
ikke|ADV|not|ikke:neg
aldri|ADV|never|aldri:neg
alltid|ADV|always|alltid
ofte|ADV|often|ofte
sjelden|ADV|seldom|sjelden
også|ADV|also, too|også
bare|ADV|only, just|bare
kun|ADV|only|kun
jo|ADV|as you know; yes (to a negative)|jo
nok|ADV|probably; enough|nok
vel|ADV|surely; well|vel
kanskje|ADV|perhaps|kanskje
sikkert|ADV|surely, probably|sikkert
ja|INTJ|yes|ja
nei|INTJ|no|nei
her|ADV|here|her
der|ADV|there|der
hit|ADV|(to) here|hit
dit|ADV|(to) there|dit
hjem|ADV|(to) home|hjem
hjemme|ADV|at home|hjemme
borte|ADV|away; over there|borte
ute|ADV|outside, out|ute
inne|ADV|inside, in|inne
oppe|ADV|up, upstairs|oppe
nede|ADV|down, downstairs|nede
opp|ADV|up|opp
ned|ADV|down|ned
inn|ADV|in (into)|inn
ut|ADV|out|ut
fram|ADV|forward|fram
frem|ADV|forward|frem
bort|ADV|away|bort
tilbake|ADV|back|tilbake
av|ADV|off|av
på|ADV|on|på
over|ADV|over|over
sammen|ADV|together|sammen
nå|ADV|now|nå
da|ADV|then; well|da
så|ADV|then; so, such|så
igjen|ADV|again; left|igjen
ennå|ADV|yet, still|ennå
enda|ADV|even (before a comparative); still|enda
fremdeles|ADV|still|fremdeles
allerede|ADV|already|allerede
snart|ADV|soon|snart
nesten|ADV|almost|nesten
veldig|ADV|very|veldig
ganske|ADV|quite|ganske
helt|ADV|completely|helt
svært|ADV|very|svært
for|ADV|too (before an adjective)|for
først|ADV|first, at first|først
sist|ADV|last|sist
senere|ADV|later|senere
tidligere|ADV|earlier, formerly|tidligere
nylig|ADV|recently|nylig
straks|ADV|at once|straks
plutselig|ADV|suddenly|plutselig
heller|ADV|rather; either (after not)|heller
dessuten|ADV|besides|dessuten
derfor|ADV|therefore|derfor
dermed|ADV|thereby|dermed
likevel|ADV|nevertheless|likevel
imidlertid|ADV|however|imidlertid
faktisk|ADV|actually|faktisk
virkelig|ADV|really|virkelig
egentlig|ADV|actually, really|egentlig
ellers|ADV|otherwise; else|ellers
samtidig|ADV|at the same time|samtidig
gjerne|ADV|gladly, willingly|gjerne
helst|ADV|preferably|helst
dessverre|ADV|unfortunately|dessverre
heldigvis|ADV|fortunately|heldigvis
sannsynligvis|ADV|probably|sannsynligvis
langt|ADV|far|langt
overalt|ADV|everywhere|overalt
nettopp|ADV|just, precisely|nettopp
akkurat|ADV|exactly|akkurat
omtrent|ADV|about, approximately|omtrent
cirka|ADV|about, approximately|cirka
ca.|ADV|about (abbreviation of cirka)|ca.
bl.a.|ADV|among other things (blant annet)|bl.a.
f.eks.|ADV|for example (for eksempel)|f.eks.
osv.|ADV|and so on (og så videre)|osv.
dvs.|ADV|that is (det vil si)|dvs.
mv.|ADV|and so on (med mer)|mv.
nr.|N|number (nummer)|nr.
kl.|N|o'clock (klokka)|kl.
fort|ADV|fast; quickly|fort
sakte|ADV|slowly|sakte
sent|ADV|late|sent
godt|ADV|well|godt
pent|ADV|nicely|pent
tidlig|ADV|early|tidlig
lenge|ADV|for a long time|lenge
lenger|ADV|longer; any longer|lenger
rett|ADV|straight; right (before a place)|rett
mye|ADV|much|mye
etterpå|ADV|afterwards|etterpå
forbi|ADV|past, by|forbi
forbi|ADP|past, by|forbi
nord|ADV|north|nord
sør|ADV|south|sør
vest|ADV|west|vest
øst|ADV|east|øst
// ── numerals ──
en|NUM|one|en:card m, ett:card n
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
elleve|NUM|eleven|elleve:card
tolv|NUM|twelve|tolv:card
tretten|NUM|thirteen|tretten:card
fjorten|NUM|fourteen|fjorten:card
femten|NUM|fifteen|femten:card
seksten|NUM|sixteen|seksten:card
sytten|NUM|seventeen|sytten:card
atten|NUM|eighteen|atten:card
nitten|NUM|nineteen|nitten:card
tjue|NUM|twenty|tjue:card
tyve|NUM|twenty|tyve:card
tretti|NUM|thirty|tretti:card
førti|NUM|forty|førti:card
femti|NUM|fifty|femti:card
seksti|NUM|sixty|seksti:card
sytti|NUM|seventy|sytti:card
åtti|NUM|eighty|åtti:card
nitti|NUM|ninety|nitti:card
hundre|NUM|hundred|hundre:card
tusen|NUM|thousand|tusen:card
million|NUM|million|million:card, millioner:card pl
første|ADJ|first|første:ord
andre|ADJ|second (ordinal)|andre:ord
tredje|ADJ|third|tredje:ord
fjerde|ADJ|fourth|fjerde:ord
femte|ADJ|fifth|femte:ord
sjette|ADJ|sixth|sjette:ord
sjuende|ADJ|seventh|sjuende:ord, syvende:ord
åttende|ADJ|eighth|åttende:ord
niende|ADJ|ninth|niende:ord
tiende|ADJ|tenth|tiende:ord
// ── particles and interjections ──
å|PART|to (infinitive marker)|å
hei|INTJ|hello|hei
takk|INTJ|thanks|takk
unnskyld|INTJ|excuse me, sorry|unnskyld
amen|INTJ|amen|amen
halleluja|INTJ|hallelujah|halleluja
`;

export const NB_FUNCTION_FORMS = parseWordRows(NB_FUNCTION_ROWS);
