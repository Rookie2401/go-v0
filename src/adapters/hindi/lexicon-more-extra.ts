/**
 * A second pass over the inventory of common vocabulary: causatives, verbs of the house and the body, adjectives of feeling and character, and nouns of family, body, home, town, health and the stages of a life.
 * Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker.
 */
export const EXTRA_MORE_ROWS = `
# VERB
नाचना = to dance [noerg] | @verb:c
नचाना = to make dance [erg cau:नाचना] | @verb:v
ओढ़ना = to wrap oneself in, to put on (a shawl, a blanket) [erg d:clothes] | @verb:c
ओढ़ाना = to wrap (someone) in, to cover with [erg d:clothes cau:ओढ़ना] | @verb:v
बैठाना = to seat, to make sit [erg cau:बैठना] | @verb:v
सूँघना = to smell, to sniff [erg d:body] | @verb:c
लपेटना = to wrap, to wind round [erg] | @verb:c
घिसना = to wear down, to rub [noerg] | @verb:c
बिगड़ना = to be spoiled, to go wrong [noerg] | @verb:c
बिगाड़ना = to spoil, to ruin [erg cau:बिगड़ना] | @verb:c
सिकुड़ना = to shrink, to contract [noerg] | @verb:c
पसरना = to spread out, to sprawl [noerg] | @verb:c
सिमटना = to huddle, to shrink back, to be gathered [noerg] | @verb:c
खुजाना = to scratch [erg d:body] | @verb:v
चटकना = to crack, to snap, to bloom [noerg] | @verb:c
छलकना = to spill over, to brim over [noerg] | @verb:c
बिखेरना = to scatter, to strew [erg cau:बिखरना] | @verb:c
उधेड़ना = to unpick, to rip up [erg] | @verb:c
सुलगना = to smoulder [noerg] | @verb:c
सुलगाना = to light, to kindle [erg cau:सुलगना] | @verb:v
बरतना = to use, to practise, to handle [erg] | @verb:c
घटाना = to reduce, to subtract [erg cau:घटना] | @verb:v
सँवरना = to be adorned, to improve [noerg] | @verb:c
कटना = to be cut, to pass (time) [noerg] | @verb:c
पिसना = to be ground [noerg] | @verb:c
थमाना = to hand over, to put into (someone's) hand [erg] | @verb:v
टिकाना = to rest, to lodge, to prop [erg cau:टिकना] | @verb:v
पकड़ाना = to hand over, to have (something) held [erg cau:पकड़ना] | @verb:v
सिलना = to be sewn [noerg] | @verb:c
बुलवाना = to have (someone) summoned, to send for [erg cau:बुलाना] | @verb:v
लिखवाना = to have (something) written, to dictate [erg cau:लिखना] | @verb:v
पढ़वाना = to have (something) read [erg cau:पढ़ना] | @verb:v
बनवाना = to have (something) made or built [erg cau:बनना] | @verb:v
रखवाना = to have (something) put or kept [erg cau:रखना] | @verb:v
भिजवाना = to have (something) sent [erg cau:भेजना] | @verb:v
मँगाना = to order, to send for (a thing) [erg] | @verb:v
मँगवाना = to have (a thing) ordered or brought [erg] | @verb:v
बतलाना = to tell, to show [erg] | @verb:v
# ADJ
सुखी = happy, comfortable [inv sanskritic everyday]
गाढ़ा = thick, dark (a colour) [everyday]
ढीला = loose, slack [everyday]
चौकन्ना = alert, on the watch [everyday]
बेवक़ूफ़ = foolish, stupid [inv perso-arabic everyday]
समझदार = sensible, wise [inv perso-arabic everyday]
नादान = innocent, naive [inv perso-arabic everyday]
नासमझ = foolish, thoughtless [inv everyday]
सयाना = grown-up, clever [everyday]
भोला = simple, innocent [everyday]
ग़ायब = absent, vanished [inv perso-arabic everyday]
दयावान = merciful, kind [inv sanskritic formal biblical]
निराश = disappointed, hopeless [inv sanskritic everyday]
चिंतित = worried, anxious [inv sanskritic formal]
संतुष्ट = satisfied, content [inv sanskritic formal]
भयभीत = frightened [inv sanskritic formal biblical]
असफल = unsuccessful [inv sanskritic formal]
अयोग्य = unfit, unworthy [inv sanskritic formal biblical]
अप्रिय = disagreeable, unpleasant [inv sanskritic formal]
महत्त्वपूर्ण = important [inv sanskritic formal also:महत्वपूर्ण]
सर्वश्रेष्ठ = the best, supreme [inv sanskritic formal]
उत्तम = excellent, best [inv sanskritic formal]
नवीन = new, modern [inv sanskritic formal]
आधुनिक = modern [inv sanskritic formal]
दीर्घ = long, extensive [inv sanskritic formal]
लघु = small, short [inv sanskritic formal]
विशाल = vast, huge [inv sanskritic formal]
असंख्य = countless, innumerable [inv sanskritic formal biblical]
अपार = boundless, immense [inv sanskritic formal]
असीम = limitless [inv sanskritic formal]
सीमित = limited [inv sanskritic formal]
अधूरा = incomplete, unfinished [everyday]
समूचा = entire, whole [everyday]
समस्त = all, entire [inv sanskritic formal biblical]
तमाम = all, entire [inv perso-arabic everyday]
वरिष्ठ = senior [inv sanskritic formal]
कनिष्ठ = junior [inv sanskritic formal]
# VERB
फलना = to bear fruit, to prosper [noerg d:nature] | @verb:c
फूलना = to bloom, to swell, to flourish [noerg d:nature] | @verb:c
मुरझाना = to wither, to droop [noerg d:nature] | @verb:v
# VERB
सुनवाना = to have (something) heard or told [erg cau:सुनाना] | @verb:v
खिलवाना = to have (someone) fed [erg d:food cau:खिलाना] | @verb:v
पिलवाना = to have (someone) given a drink [erg d:food cau:पिलाना] | @verb:v
सुलवाना = to have (someone) put to sleep [erg cau:सुलाना] | @verb:v
उठवाना = to have (something) lifted or raised [erg cau:उठाना] | @verb:v
चलवाना = to have (something) driven or run [erg cau:चलाना] | @verb:v
धुलवाना = to have (something) washed [erg cau:धोना] | @verb:v
खुलवाना = to have (something) opened [erg cau:खोलना] | @verb:v
जलवाना = to have (something) burnt [erg cau:जलाना] | @verb:v
मरवाना = to have (someone) killed [erg cau:मारना] | @verb:v
कटवाना = to have (something) cut [erg cau:काटना] | @verb:v
दिलवाना = to have (something) given to someone [erg cau:दिलाना] | @verb:v
डुबोना = to sink, to drown (someone or something) [erg cau:डूबना] | @verb:v
जमाना = to freeze, to set, to establish [erg cau:जमना] | @verb:v
चमकाना = to polish, to make shine [erg cau:चमकना] | @verb:v
# ADJ
बहुत = many, much (बहुतों = many people) [inv everyday]
# NOUN
## d:daily-life
वास/m = dwelling, residence [sanskritic formal biblical]
वाद/m = argument, dispute; doctrine [sanskritic formal]
## d:family
फूफा/m = father's sister's husband [inv everyday]
मौसा/m = mother's sister's husband [inv everyday]
ताई/f = wife of one's tau [everyday]
भाँजा/m = sister's son, nephew [everyday]
भाँजी/f = sister's daughter, niece [everyday]
नाती/m = daughter's son, grandson [everyday]
नातिन/f = daughter's daughter, granddaughter [everyday]
## d:body
एड़ी/f = heel [everyday]
तलवा/m = sole of the foot [everyday]
हथेली/f = palm [everyday]
कलाई/f = wrist [everyday]
भौंह/f = eyebrow [everyday]
पलक/f = eyelid [everyday]
पुतली/f = pupil of the eye; puppet [everyday]
ठुड्डी/f = chin [everyday]
मूँछ/f = moustache [everyday]
नस/f = vein, nerve [perso-arabic everyday]
फेफड़ा/m = lung [everyday]
## d:house
प्लेट/f = plate [english-loan everyday]
कप/m = cup [english-loan everyday]
अंगूठी/f = ring [everyday]
चूड़ी/f = bangle [everyday]
झुमका/m = hanging earring [everyday]
बिंदी/f = bindi, forehead dot [everyday]
कंगन/m = bracelet [everyday]
पाइप/m = pipe [english-loan everyday]
पंप/m = pump [english-loan everyday]
तार/m = wire; telegram [everyday]
खंभा/m = pole, pillar [everyday]
बल्ब/m = light bulb [english-loan everyday]
टंकी/f = tank [everyday]
नाली/f = drain, channel [everyday]
## d:food
कॉफ़ी/f = coffee [english-loan everyday]
जूस/m = juice [english-loan everyday]
## d:animals
कीड़ा/m = insect, worm [everyday]
## d:city
मंदिर/m = temple [sanskritic everyday]
मस्जिद/f = mosque [perso-arabic everyday]
धर्मशाला/f = rest house for pilgrims [sanskritic everyday]
सराय/f = inn [perso-arabic everyday]
महाविद्यालय/m = college [sanskritic formal]
विश्वविद्यालय/m = university [sanskritic formal]
कार्यालय/m = office [sanskritic formal]
न्यायालय/m = court of law [sanskritic formal]
संसद/f = parliament [sanskritic formal]
समिति/f = committee [sanskritic formal]
संघ/m = union, association [sanskritic formal]
दल/m = party, group, band [sanskritic everyday]
सेना/f = army [sanskritic everyday]
महानगर/m = big city, metropolis [sanskritic everyday]
सरहद/f = border, frontier [perso-arabic everyday]
पहाड़ी/f = hill [everyday d:nature]
घाटी/f = valley [everyday d:nature]
तट/m = shore, bank [sanskritic formal d:nature]
बंदरगाह/m = port, harbour [perso-arabic everyday d:travel]
लहर/f = wave [perso-arabic everyday d:nature]
भँवर/m = whirlpool [everyday d:nature]
सोता/m = spring, source of water [everyday d:nature]
कुंड/m = pool, tank [sanskritic everyday d:nature]
हौज़/m = cistern, tank [perso-arabic everyday]
## d:work
क़ैदी/m = prisoner [perso-arabic everyday d:law]
डाकू/m = robber, bandit [everyday d:law]
गुप्तचर/m = spy [sanskritic formal]
भिखारी/m = beggar [everyday]
साधु/m = holy man, sadhu [sanskritic everyday]
संत/m = saint [sanskritic everyday]
फ़क़ीर/m = mendicant, fakir [perso-arabic everyday]
पंडित/m = pandit, learned man, priest [sanskritic everyday]
मौलवी/m = maulvi, Muslim teacher [perso-arabic everyday]
इलाज/m = treatment, cure [perso-arabic everyday d:health]
औषधि/f = medicine, herb [sanskritic formal d:health]
चिकित्सा/f = medical treatment [sanskritic formal d:health]
रोग/m = disease [sanskritic formal d:health]
खुजली/f = itch [everyday d:health]
खाँसी/f = cough [everyday d:health]
ज़ुकाम/m = a cold [perso-arabic everyday d:health]
## d:daily-life
राशि/f = amount, sum; zodiac sign [sanskritic formal]
संख्या/f = number, quantity [sanskritic formal]
हिस्सा/m = part, share [perso-arabic everyday]
भाग/m = part, portion [sanskritic formal]
टुकड़ा/m = piece, bit [everyday]
ढेर/m = heap, pile [everyday]
गुच्छा/m = bunch, cluster [everyday]
जोड़ा/m = pair, couple [everyday]
जोड़ी/f = pair, couple [everyday]
कतार/f = line, queue [perso-arabic everyday]
पंक्ति/f = line, row [sanskritic formal]
सूची/f = list [sanskritic formal]
तालिका/f = table, schedule [sanskritic formal]
रेखा/f = line [sanskritic everyday]
बिंदु/m = dot, point [sanskritic formal]
वृत्त/m = circle [sanskritic formal]
वर्ग/m = square; class, group [sanskritic formal]
चौड़ाई/f = width [everyday]
तौल/f = weight, weighing [everyday]
वस्तु/f = thing, object [sanskritic formal]
यंत्र/m = machine, instrument [sanskritic formal]
नाच/m = dance [everyday]
विवाह/m = marriage, wedding [sanskritic formal]
शादी/f = wedding, marriage [perso-arabic everyday]
जन्मदिन/m = birthday [sanskritic everyday]
बारात/f = wedding procession [perso-arabic everyday]
दुल्हन/f = bride [everyday]
दूल्हा/m = bridegroom [everyday]
अंत्येष्टि/f = funeral rites [sanskritic formal]
श्मशान/m = cremation ground [sanskritic formal]
पुरस्कार/m = prize, award [sanskritic formal]
उपहार/m = gift, present [sanskritic formal]
तोहफ़ा/m = gift, present [perso-arabic everyday]
भिक्षा/f = alms [sanskritic formal]
// ── homographs the neighbour rules choose between: each reading is its own entry
# ADV
और = more, else, another (और चाहिए, और कुछ) [everyday]
# NOUN
## d:daily-life
कर/m = tax; (literary) hand [sanskritic formal]
सोना/m = gold [everyday]
पर/m = wing, feather [everyday d:animals]
जी/m = heart, mind (जी लगना, जी चाहना) [everyday d:feelings]
# PART
जी = (honorific after a name or title: माँ जी, गांधी जी) [everyday]
// ── English loans
# NOUN
## d:travel
ट्रेन/f = train [english-loan everyday]
कार/f = car [english-loan everyday]
बाइक/f = motorbike [english-loan everyday]
टैक्सी/f = taxi [english-loan everyday]
स्कूटर/m = scooter [english-loan everyday]
पेट्रोल/m = petrol [english-loan everyday]
पासपोर्ट/m = passport [english-loan everyday]
## d:work
ऑफ़िस/m = office [english-loan everyday]
मास्टर/m = teacher (master); a title [english-loan everyday]
फ़ीस/f = fee [english-loan everyday]
## d:house
पेन/m = pen [english-loan everyday]
शर्ट/f = shirt [english-loan everyday d:clothes]
सूट/m = suit [english-loan everyday d:clothes]
कोट/m = coat [english-loan everyday d:clothes]
बटन/m = button [english-loan everyday d:clothes]
ब्रश/m = brush [english-loan everyday]
कैमरा/m = camera [english-loan everyday]
बैटरी/f = battery [english-loan everyday]
गैस/f = gas [english-loan everyday]
कैलेंडर/m = calendar [english-loan everyday d:time]
हॉल/m = hall [english-loan everyday]
लाइन/f = line, queue [english-loan everyday]
## d:food
आइसक्रीम/f = ice cream [english-loan everyday]
टॉफ़ी/f = toffee, sweet [english-loan everyday]
# INTJ
ओके = okay [english-loan colloquial]
// ── Sanskrit-derived nouns with conjuncts (स्व- प्र- क्ष- ज्ञ- श्र-)
# NOUN
## d:daily-life
स्वप्न/m = dream [sanskritic formal]
स्वतंत्रता/f = freedom, independence [sanskritic formal]
प्रकृति/f = nature [sanskritic formal]
श्रम/m = labour, toil [sanskritic formal]
क्षेत्र/m = region, field, area [sanskritic formal]
स्नान/m = bath, bathing [sanskritic formal]
स्मरण/m = remembrance, recollection [sanskritic formal]
स्मृति/f = memory [sanskritic formal]
क्षति/f = loss, damage [sanskritic formal]
क्षमता/f = ability, capacity [sanskritic formal]
श्रोता/m = listener [inv sanskritic formal]
यज्ञ/m = sacrifice, offering [sanskritic religious]
प्रमाण/m = proof, evidence [sanskritic formal]
प्रभाव/m = effect, influence [sanskritic formal]
प्रयोग/m = use; experiment [sanskritic formal]
प्रवेश/m = entry, admission [sanskritic formal]
प्रेरणा/f = inspiration, motivation [sanskritic formal]
प्रतिशत/m = percent [sanskritic formal]
स्वर/m = voice, tone, vowel [sanskritic formal]
श्रेणी/f = grade, class, category [sanskritic formal]
क्रिया/f = action; verb [sanskritic formal]
ग्राम/m = village [sanskritic formal]
ग्रंथ/m = book, scripture [sanskritic formal]
दृष्टि/f = sight, vision, view [sanskritic formal]
द्रव्य/m = substance, wealth [sanskritic formal]
पृष्ठ/m = page [sanskritic formal]
प्रेमी/m = lover, one who loves [sanskritic everyday]
राष्ट्र/m = nation [sanskritic formal]
व्यवहार/m = behaviour, dealing [sanskritic formal]
# ADJ
प्रधान = chief, principal [inv sanskritic formal]
ज्ञानी = wise, learned; a wise person [inv sanskritic formal]
`;
