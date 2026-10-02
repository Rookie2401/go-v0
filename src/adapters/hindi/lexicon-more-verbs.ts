/**
 * More verbs of play, animals, weather, hands and tools, movement and the mind, found missing when the list was checked against an inventory
 * of the commonest Hindi verbs and against the bundled Stage 0 and Scripture texts.
 * Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker.
 */
export const VERB_MORE_ROWS = `
# VERB
// ── play, animals, sounds
खेलना = to play (a game, a sport) [d:school] | @verb:c
भौंकना = to bark [d:animals] | @verb:c
दहाड़ना = to roar [noerg d:animals] | @verb:c
चहचहाना = to chirp, to twitter [noerg d:animals] | @verb:v
हिनहिनाना = to neigh [noerg d:animals] | @verb:v
फुदकना = to hop, to skip about [noerg d:animals] | @verb:c
चराना = to graze (animals), to take out to pasture [erg d:village cau:चरना] | @verb:v
चरना = to graze [noerg d:animals] | @verb:c
दुहना = to milk [erg d:village] | @verb:c
जोतना = to plough [erg d:village] | @verb:c
सींचना = to water, to irrigate [erg d:village] | @verb:c
गरजना = to thunder, to roar [noerg d:nature] | @verb:c
कड़कना = to crackle, to crash (thunder) [noerg d:nature] | @verb:c
गूँजना = to echo, to resound [noerg] | @verb:c
टिमटिमाना = to twinkle, to flicker [noerg d:nature] | @verb:v
जगमगाना = to sparkle, to glitter [noerg d:nature] | @verb:v
धधकना = to blaze [noerg] | @verb:c
लहराना = to wave, to flutter | @verb:v
फहराना = to fly (a flag), to unfurl [erg] | @verb:v
// ── moving, turning, creeping
फिरना = to wander, to turn, to go about [noerg] | @verb:c
फिराना = to turn (something), to pass (a hand) over [erg cau:फिरना] | @verb:v
रेंगना = to crawl, to creep [noerg d:animals] | @verb:c
मँडराना = to hover, to hang about [noerg also:मण्डराना also:मंडराना] | @verb:v
उछलना = to jump up, to leap, to bounce [noerg] | @verb:c
उछालना = to toss up, to throw up [erg cau:उछलना] | @verb:c
लुढ़कना = to roll [noerg] | @verb:c
लुढ़काना = to roll (something) [erg cau:लुढ़कना] | @verb:v
घसीटना = to drag [erg] | @verb:c
लाँघना = to step over, to cross [erg] | @verb:c
फाँदना = to jump over, to leap across [erg] | @verb:c
ठिठकना = to halt, to stop short [noerg] | @verb:c
अटकना = to be stuck, to be held up [noerg] | @verb:c
फँसना = to be caught, to be trapped [noerg] | @verb:c
फँसाना = to trap, to entangle [erg cau:फँसना] | @verb:v
बिछुड़ना = to be separated, to part [noerg] | @verb:c
सँभलना = to steady oneself, to recover [noerg] | @verb:c
लड़खड़ाना = to stagger, to stumble [noerg] | @verb:v
चूकना = to miss, to fail [noerg] | @verb:c
भिड़ना = to collide, to grapple [noerg] | @verb:c
टकराना = to collide, to strike against [noerg] | @verb:v
बसना = to settle, to dwell [noerg d:village] | @verb:c
बसाना = to settle (people), to found [erg d:village cau:बसना] | @verb:v
उजड़ना = to be laid waste, to be deserted [noerg] | @verb:c
उजाड़ना = to lay waste, to devastate [erg cau:उजड़ना] | @verb:c
ढहना = to collapse, to fall down [noerg] | @verb:c
ढहाना = to pull down, to demolish [erg cau:ढहना] | @verb:v
जुटना = to gather, to be busy at [noerg] | @verb:c
जुटाना = to gather, to collect, to procure [erg cau:जुटना] | @verb:v
// ── hands and tools
मरोड़ना = to twist, to wring [erg] | @verb:c
पकड़वाना = to have (someone) caught, to have seized [erg cau:पकड़ना] | @verb:v
टेकना = to rest, to lean; to bow (the head) [erg] | @verb:c
ठोकना = to hammer, to knock in [erg] | @verb:c
ढालना = to pour, to cast, to mould [erg] | @verb:c
घोलना = to dissolve, to mix in liquid [erg cau:घुलना] | @verb:c
घुलना = to dissolve, to melt away [noerg] | @verb:c
मथना = to churn [erg d:food] | @verb:c
छीलना = to peel [erg d:food] | @verb:c
कतरना = to clip, to trim [erg] | @verb:c
भूनना = to roast, to fry [erg d:food] | @verb:c
सेंकना = to toast, to warm by a fire [erg d:food] | @verb:c
छाँटना = to sort out, to pick out [erg] | @verb:c
बीनना = to pick, to gather bit by bit [erg] | @verb:c
समेटना = to gather up, to tidy away [erg] | @verb:c
बटोरना = to collect, to gather [erg] | @verb:c
सहेजना = to keep safe, to put away carefully [erg] | @verb:c
सँजोना = to gather and keep, to cherish [erg] | @verb:v
थकाना = to tire out [erg d:health cau:थकना] | @verb:v
चेताना = to warn, to rouse [erg d:theology] | @verb:v
घटना = to decrease, to happen [noerg] | @verb:c
फूटना = to burst, to break open, to sprout [noerg] | @verb:c
फोड़ना = to break open, to burst [erg cau:फूटना] | @verb:c
उगलना = to spit out, to vomit [erg d:body] | @verb:c
थूकना = to spit [erg d:body] | @verb:c
चाटना = to lick [erg d:body] | @verb:c
चूसना = to suck [erg d:body] | @verb:c
कुतरना = to gnaw, to nibble [erg d:animals] | @verb:c
चुगना = to peck, to pick up grain [erg d:animals] | @verb:c
// ── mind and company
पछताना = to regret, to repent [noerg d:theology] | @verb:v
झल्लाना = to be irritated, to snap [noerg d:feelings] | @verb:v
जगना = to be awake, to wake [noerg] | @verb:c
भड़कना = to flare up, to take fright [noerg] | @verb:c
भड़काना = to incite, to stir up [erg cau:भड़कना] | @verb:v
बहलाना = to amuse, to distract [erg] | @verb:v
फुसलाना = to coax, to cajole [erg] | @verb:v
ठगना = to cheat, to swindle [erg d:law] | @verb:c
तरसाना = to make (someone) long for [erg d:feelings] | @verb:v
तड़पना = to writhe, to be in anguish [noerg d:feelings] | @verb:c
तड़पाना = to torment [erg d:feelings cau:तड़पना] | @verb:v
कुचलना = to crush, to trample [erg] | @verb:c
मसलना = to crush with the hand, to rub [erg] | @verb:c
रौंदना = to trample [erg] | @verb:c
// ── irregular stems in -ी and -ू
सीना = to sew [erg] | @verb:ii
छूना = to touch [erg] | @verb:uu
`;
