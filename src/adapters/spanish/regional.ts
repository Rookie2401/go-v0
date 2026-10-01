/**
 * Words that belong to one region, each tagged with its variety. Both words of a pair are listed, so a learner meets
 * each with a plain statement of where it is used. A word is tagged es-ES only when it is not in ordinary use in Latin
 * America (ordenador, zumo, patata, móvil); a word that is general Spanish with a Latin American alternative (coche,
 * conducir, gafas …) is left untagged and the preference is said in the gloss. Tags follow the
 * narrowest variety the word is certainly used in: es-HN (Honduras), es-CA (Central America), es-419 (Latin America
 * in general), es-MX, es-CAR, es-AND, es-AR, es-ES. A word marked `colloquial` is ordinary informal speech, not slang.
 *
 * Machine-drafted and not native-reviewed. Only words whose region is certain are here; the Honduran and Central
 * American handful is deliberately short (see the package report for the ones that most need a native check).
 * The words that carry a tag but live in the verb list (manejar, estacionar, enojar, coger, conducir) are counted too.
 */
export const REGIONAL_ROWS = `
# NOUN
lempira/m = lempira, the currency of Honduras [es-HN]
cipote/m = boy, kid; a vulgar word in Spain [es-HN colloquial]
cipota/f = girl, kid; a vulgar word in Spain [es-HN colloquial]
catracho/m = Honduran man (friendly, informal) [es-HN colloquial]
catracha/f = Honduran woman (friendly, informal) [es-HN colloquial]
baleada/f = Honduran snack: a folded flour tortilla with beans, cheese and cream [es-HN]
pulpería/f = small neighbourhood shop [es-CA]
pisto/m = money (informal); in Spain, a vegetable stew [es-CA colloquial]
chele/m = fair-skinned or fair-haired person (informal) [es-CA colloquial]
lapicero/m = pen (ballpoint) [es-CA]
computadora/f = computer [es-419]
ordenador/m = computer (Spain; Latin America says computadora) [es-ES]
carro/m = car (Latin America; in Spain, a cart) [es-419]
coche/m = car (the usual word in Spain; much of Latin America prefers carro)
jugo/m = juice [es-419]
zumo/m = juice (Spain; Latin America says jugo) [es-ES]
celular/m = mobile phone [es-419]
móvil/m = mobile phone (Spain; Latin America says celular) [es-ES]
papa/f = potato [es-419]
patata/f = potato (Spain; Latin America says papa) [es-ES]
lentes/m = glasses (for the eyes) [es-419] | lentes:m pl
gafas/f = glasses (for the eyes; Latin America often says lentes) | gafas:f pl
durazno/m = peach [es-419]
melocotón/m = peach (Latin America often says durazno)
frijol/m = bean [es-419]
alubia/f = bean (Latin America often says frijol)
habichuela/f = bean (Caribbean) [es-CAR]
elote/m = corn on the cob [es-419]
tamal/m = tamale [es-419]
cacahuate/m = peanut (Mexico) [es-MX]
cacahuete/m = peanut (Mexico says cacahuate)
gamba/f = prawn, shrimp (Latin America often says camarón)
alberca/f = swimming pool (Mexico) [es-MX]
pileta/f = swimming pool (Argentina) [es-AR]
palta/f = avocado (Peru, Chile, Argentina) [es-AND es-AR]
frutilla/f = strawberry (Argentina) [es-AR]
cobija/f = blanket [es-419]
boleto/m = ticket (travel, events) [es-419]
chamba/f = job, work (informal) [es-419 colloquial]
chamaco/m = boy, kid (informal) [es-MX colloquial]
popote/m = drinking straw (Mexico) [es-MX]
pajita/f = drinking straw (the word differs by country: popote in Mexico)
chaval/m = kid, lad (informal; heard mostly in Spain) [colloquial]
# ADJ
lindo = pretty, nice [es-419]
enojado = angry [es-419]
enfadado = angry (Latin America often says enojado)
guay = cool, great (informal; heard mostly in Spain) [colloquial]
# ADV
ahorita = right now, in a moment (informal) [es-419 colloquial]
# VERB
platicar = to chat, talk [es-419]
aparcar = to park (Latin America often says estacionar)
enfadar = to anger (enfadarse: to get angry; Latin America often says enojar)
`;
