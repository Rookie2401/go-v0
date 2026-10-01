/**
 * The closed classes: pronouns (with vos, usted(es) and vosotros), clitics, possessives, demonstratives,
 * indefinites, question and relative words, prepositions, conjunctions and numbers. Every form is listed, because
 * these words are the commonest in any text and must not depend on the morphology engine. Words the older hand list
 * in es.ts already holds (the articles, yo, tú, él, nosotros, nos, se, qué, cómo, mi, su, nuestro, todo, mismo, a, al,
 * del, en, con, por, para, de, y, pero, mas, si, que, porque, cuando, uno … treinta) are not repeated.
 *
 * Forms: `lemma = gloss [tags] | form:morph tags; form:morph tags`. `vos`, `vosotros` and their possessives carry the
 * variety tags voseo / vosotros: Honduran learners use vos; vosotros is the form of Spain, recognised and never hidden.
 * Machine-drafted, not native-reviewed.
 */
export const FUNCTION_ROWS = `
# PRON
ella = she, her | ella:3s f nom prs
usted = you (formal, singular) | usted:3s nom prs Polite=Form
ustedes = you (plural) | ustedes:3p nom prs Polite=Form
ellos = they (masculine or mixed) | ellos:3p m nom prs
ellas = they (feminine) | ellas:3p f nom prs
nosotras = we (feminine) | nosotras:1p f nom prs
vos = you (informal singular, voseo) [voseo] | vos:2s nom prs
vosotros = you all (informal; Spain) [vosotros] | vosotros:2p m nom prs
vosotras = you all, feminine (informal; Spain) [vosotros] | vosotras:2p f nom prs
mí = me (after a preposition) | mí:1s obl prs
ti = you (after a preposition) | ti:2s obl prs
conmigo = with me | conmigo:1s obl prs
contigo = with you | contigo:2s obl prs
consigo = with himself, herself, themselves | consigo:3s obl prs
me = me (object pronoun) | me:1s acc dat prs
te = you (object pronoun) | te:2s acc dat prs
lo = him, it (object pronoun); the (before an adjective) | lo:3s m acc prs
le = him, her, you (indirect object) | le:3s dat prs
les = them, you all (indirect object) | les:3p dat prs
os = you all (object pronoun; Spain) [vosotros] | os:2p acc dat prs
algo = something | algo:sg
alguien = someone | alguien:sg
nadie = nobody | nadie:sg neg
nada = nothing | nada:sg neg
cualquiera = anyone, any | cualquiera:sg
quién = who | quién:int sg; quiénes:int pl
cuál = which | cuál:int sg; cuáles:int pl
quien = who, whom | quien:rel sg; quienes:rel pl
cual = which (relative) | cual:rel sg; cuales:rel pl
# DET
tu = your (informal) | tu:sg poss; tus:pl poss
vuestro = your (of you all; Spain) [vosotros] | vuestro:m sg poss; vuestra:f sg poss; vuestros:m pl poss; vuestras:f pl poss
mío = mine, of mine | mío:m sg poss; mía:f sg poss; míos:m pl poss; mías:f pl poss
tuyo = yours (informal) | tuyo:m sg poss; tuya:f sg poss; tuyos:m pl poss; tuyas:f pl poss
suyo = his, hers, theirs, yours (formal) | suyo:m sg poss; suya:f sg poss; suyos:m pl poss; suyas:f pl poss
este = this | este:m sg dem; esta:f sg dem; esto:sg dem; estos:m pl dem; estas:f pl dem
ese = that | ese:m sg dem; esa:f sg dem; eso:sg dem; esos:m pl dem; esas:f pl dem
cada = each, every | cada
otro = other, another | otro:m sg; otra:f sg; otros:m pl; otras:f pl
varios = several | varios:m pl; varias:f pl
ambos = both | ambos:m pl; ambas:f pl
alguno = some, any | alguno:m sg; algún:m sg; alguna:f sg; algunos:m pl; algunas:f pl
ninguno = no, none | ninguno:m sg neg; ningún:m sg neg; ninguna:f sg neg; ningunos:m pl neg; ningunas:f pl neg
cualquier = any | cualquier:sg
mucho = much, a lot of | mucho:m sg; mucha:f sg; muchos:m pl; muchas:f pl
poco = little, not much | poco:m sg; poca:f sg; pocos:m pl; pocas:f pl
tanto = so much, as much | tanto:m sg; tanta:f sg; tantos:m pl; tantas:f pl
demasiado = too much | demasiado:m sg; demasiada:f sg; demasiados:m pl; demasiadas:f pl
bastante = enough, quite a lot of | bastante:sg; bastantes:pl
cuánto = how much, how many | cuánto:m sg int; cuánta:f sg int; cuántos:m pl int; cuántas:f pl int
cuyo = whose | cuyo:m sg rel; cuya:f sg rel; cuyos:m pl rel; cuyas:f pl rel
# ADV
dónde = where | dónde:int
cuándo = when | cuándo:int
adónde = where to | adónde:int
donde = where | donde:rel
# ADP
ante = before, in front of
bajo = under
contra = against
desde = from, since
durante = during
entre = between, among
hacia = towards
hasta = until, up to; even
mediante = by means of
según = according to
sin = without
sobre = on, above; about
tras = after, behind
excepto = except
salvo = except, save
# CONJ
e = and (used before i- and hi-)
o = or
u = or (used before o- and ho-)
ni = nor, not even
sino = but, rather
pues = since, well then
# SCONJ
aunque = although, even if
mientras = while
como = as, like; since
# NUM
cero = zero
once = eleven
trece = thirteen
catorce = fourteen
quince = fifteen
dieciséis = sixteen
diecisiete = seventeen
dieciocho = eighteen
diecinueve = nineteen
veintiuno = twenty-one | veintiuno:m sg; veintiún:m sg; veintiuna:f sg
veintidós = twenty-two
veintitrés = twenty-three
veinticuatro = twenty-four
veinticinco = twenty-five
veintiséis = twenty-six
veintisiete = twenty-seven
veintiocho = twenty-eight
veintinueve = twenty-nine
cuarenta = forty
cincuenta = fifty
sesenta = sixty
setenta = seventy
ochenta = eighty
noventa = ninety
cien = a hundred (before a noun)
ciento = a hundred (before a smaller number)
doscientos = two hundred | doscientos:m pl; doscientas:f pl
trescientos = three hundred | trescientos:m pl; trescientas:f pl
cuatrocientos = four hundred | cuatrocientos:m pl; cuatrocientas:f pl
quinientos = five hundred | quinientos:m pl; quinientas:f pl
seiscientos = six hundred | seiscientos:m pl; seiscientas:f pl
setecientos = seven hundred | setecientos:m pl; setecientas:f pl
ochocientos = eight hundred | ochocientos:m pl; ochocientas:f pl
novecientos = nine hundred | novecientos:m pl; novecientas:f pl
mil = a thousand
millón = a million
`;
