/**
 * The words the Hindi ladder plan (data/ladder/hi/PLAN.md, sections 6 and 7) found missing: the frame words of its clinic, train,
 * office, church, school, village and family units (6.1), the frequent unlisted forms and names of the authentic books (6.2), the
 * names its cast needs (सैम, अमन, the characters of the GDL books), and the numerals 31-99 (7.8), which the list lacked.
 * A noun of a loan or of an uncertain gender keeps what the row says; the rules supply the plural and the oblique.
 * Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker: the glosses and genders are a draft for the reviewer.
 */
export const GAP_ROWS = `
# NOUN
## d:health
गोली/f = tablet, pill; a bullet [everyday]
मरीज़/mf = patient [perso-arabic everyday]
इंजेक्शन/m = injection [english-loan everyday]
पट्टी/f = bandage; a strip [everyday]
डेंगू/m = dengue [everyday]
मलेरिया/m = malaria [inv english-loan everyday]
## d:travel
ऑटो/m = auto-rickshaw [english-loan everyday]
प्लेटफ़ॉर्म/m = railway platform [english-loan everyday]
ट्रैफ़िक/m = traffic [english-loan everyday]
परदेस/m = a foreign land, a land away from home [everyday]
## d:work
फ़ॉर्म/m = form (to fill in) [english-loan everyday]
आवेदन/m = application (a request made in writing) [sanskritic formal]
रिपोर्ट/f = report [english-loan everyday]
अध्यक्ष/m = chairman, president (of a meeting or a body) [sanskritic formal]
निवेदन/m = request, humble submission (formal) [sanskritic formal]
महोदय/m = sir (the salutation of a formal letter) [sanskritic formal]
स्वीकार/m = acceptance, consent [sanskritic formal]
ट्रेनिंग/f = training [english-loan everyday]
अनुभव/m = experience [sanskritic everyday]
## d:daily-life
संदेश/m = message [sanskritic everyday]
सूचना/f = notice, information [sanskritic formal]
जेब/f = pocket [perso-arabic everyday d:clothes]
ख़त/m = letter (a written message) [perso-arabic everyday]
पार्टी/f = party; a political party [english-loan everyday]
दुआ/f = prayer, blessing (a request made to God for someone) [perso-arabic everyday d:prayer]
कचरा/m = rubbish, waste [everyday]
गंदगी/f = dirt, filth [perso-arabic everyday]
सुविधा/f = facility, convenience [sanskritic formal]
महँगाई/f = high prices, inflation [everyday d:money]
तरक़्क़ी/f = progress, advancement [perso-arabic everyday]
सुधार/m = improvement, reform [sanskritic everyday]
प्रस्ताव/m = proposal, motion [sanskritic formal]
राय/f = opinion, advice [perso-arabic everyday]
सुझाव/m = suggestion [sanskritic formal]
वोट/m = vote [english-loan everyday]
चंदा/m = donation, subscription [everyday d:money]
सावधानी/f = care, caution [sanskritic everyday]
सीख/f = lesson, teaching (a piece of advice) [everyday]
ग्रहण/m = receiving, accepting; an eclipse [sanskritic formal]
जायदाद/f = property, estate [perso-arabic everyday d:law]
दावत/f = feast, invitation to a meal [perso-arabic everyday d:food]
## d:city
इलाक़ा/m = area, district [perso-arabic everyday]
दृश्य/m = view, scene [sanskritic everyday]
धुंध/f = mist, haze [everyday d:nature]
मानसून/m = monsoon [english-loan everyday d:nature]
## d:school
इम्तिहान/m = exam, test [perso-arabic everyday]
दाख़िला/m = admission, enrolment [perso-arabic everyday]
पाठ्यक्रम/m = syllabus, course of study [sanskritic formal]
## d:house
इलायची/f = cardamom [perso-arabic everyday d:food]
कूलर/m = air cooler [english-loan everyday]
मच्छरदानी/f = mosquito net [everyday]
## d:village
शिविर/m = camp [sanskritic formal]
धान/m = paddy, the rice plant [everyday d:food]
खेती/f = farming, cultivation [everyday]
सूअर/m = pig [everyday d:animals]
## d:food
पकवान/m = a festive dish, a rich dish [everyday]
## d:daily-life
ढोल/m = drum [everyday]
गुलाल/m = coloured powder thrown at Holi [everyday]
पिचकारी/f = water squirt, a syringe for squirting coloured water at Holi [everyday]
## d:daily-life
इंटरनेट/m = the internet [english-loan everyday]
कंप्यूटर/m = computer [english-loan everyday]
फ़ोटो/m = photograph [english-loan everyday]
वीडियो/m = video [english-loan everyday]
##
# ADJ
आदरणीय = respected (the salutation of a letter) [inv sanskritic formal]
फ़ेल = failed (in an exam) [inv english-loan everyday d:school]
सहमत = in agreement, of the same opinion [inv sanskritic formal]
सूचित = informed [inv sanskritic formal]
`;

/**
 * 6.2 of the plan: forms that stopped the authentic books (the planner's evidence, not a request). Colloquial वो, the spelling
 * बिल्कुल and यानि are variants of listed words (`also:`), so that a learner's record of वह stays one word.
 */
export const GAP_FREQUENT_ROWS = `
# NOUN
## d:animals
जीव/m = living being, creature [sanskritic everyday]
## d:body
नज़र/f = sight, glance, look [perso-arabic everyday]
## d:family
काका/m = father's younger brother, uncle; a respectful address to an older man [inv everyday]
मम्मी/f = mummy, mum [english-loan colloquial]
## d:school
टीम/f = team [english-loan everyday]
हॉकी/f = hockey [english-loan everyday]
टीचर/mf = teacher [english-loan everyday]
## d:daily-life
तेज़ी/f = speed, quickness; haste [perso-arabic everyday]
जादू/m = magic [perso-arabic everyday]
विमान/m = aeroplane; aircraft [sanskritic formal]
पार/m = the other side, the far bank [everyday]
सर/m = sir (a respectful address to a man, a teacher) [english-loan everyday]
बाँस/m = bamboo [everyday d:nature]
मुखिया/m = head, chief (of a village or a family) [inv everyday d:village]
देवी/f = goddess; a lady (a respectful title) [sanskritic everyday d:people]
टूथपेस्ट/m = toothpaste [english-loan everyday d:body]
##
# ADJ
पालतू = tame, domesticated (a pet) [inv everyday d:animals]
नन्हा = tiny, little (of a small child or creature) [everyday] | @adj
पैदा = born, produced (पैदा होना = to be born) [inv perso-arabic everyday]
विशालकाय = huge, gigantic [inv sanskritic everyday]
महसूस = felt (महसूस करना = to feel) [inv perso-arabic everyday]
तय = settled, decided, fixed (तय करना = to decide) [inv perso-arabic everyday]
# ADV
वापस = back, returned (वापस आना = to come back) [perso-arabic everyday] | वापस
झटपट = quickly, in a trice [everyday] | झटपट
# PART
ना = no; isn't it? (a colloquial tag, a softener) [colloquial] | ना
`;

/** The numerals 31-99 (the list stopped at thirty and the round tens). Each is a lemma of its own: the Hindi numbers are not compounded by rule. */
export const GAP_NUMBER_ROWS = `
##
# NUM
## d:number
इकतीस = thirty-one [everyday] | इकतीस
बत्तीस = thirty-two [everyday] | बत्तीस
तैंतीस = thirty-three [everyday] | तैंतीस
चौंतीस = thirty-four [everyday] | चौंतीस
पैंतीस = thirty-five [everyday] | पैंतीस
छत्तीस = thirty-six [everyday] | छत्तीस
सैंतीस = thirty-seven [everyday] | सैंतीस
अड़तीस = thirty-eight [everyday] | अड़तीस
उनतालीस = thirty-nine [everyday] | उनतालीस
इकतालीस = forty-one [everyday] | इकतालीस
बयालीस = forty-two [everyday] | बयालीस
तैंतालीस = forty-three [everyday] | तैंतालीस
चौवालीस = forty-four [everyday also:चवालीस] | चौवालीस
पैंतालीस = forty-five [everyday] | पैंतालीस
छियालीस = forty-six [everyday] | छियालीस
सैंतालीस = forty-seven [everyday] | सैंतालीस
अड़तालीस = forty-eight [everyday] | अड़तालीस
उनचास = forty-nine [everyday] | उनचास
इक्यावन = fifty-one [everyday] | इक्यावन
बावन = fifty-two [everyday] | बावन
तिरपन = fifty-three [everyday also:तिरेपन] | तिरपन
चौवन = fifty-four [everyday] | चौवन
पचपन = fifty-five [everyday] | पचपन
छप्पन = fifty-six [everyday] | छप्पन
सत्तावन = fifty-seven [everyday] | सत्तावन
अट्ठावन = fifty-eight [everyday] | अट्ठावन
उनसठ = fifty-nine [everyday] | उनसठ
इकसठ = sixty-one [everyday] | इकसठ
बासठ = sixty-two [everyday] | बासठ
तिरसठ = sixty-three [everyday also:तिरेसठ] | तिरसठ
चौंसठ = sixty-four [everyday] | चौंसठ
पैंसठ = sixty-five [everyday] | पैंसठ
छियासठ = sixty-six [everyday] | छियासठ
सड़सठ = sixty-seven [everyday] | सड़सठ
अड़सठ = sixty-eight [everyday] | अड़सठ
उनहत्तर = sixty-nine [everyday] | उनहत्तर
इकहत्तर = seventy-one [everyday] | इकहत्तर
बहत्तर = seventy-two [everyday] | बहत्तर
तिहत्तर = seventy-three [everyday] | तिहत्तर
चौहत्तर = seventy-four [everyday] | चौहत्तर
पचहत्तर = seventy-five [everyday] | पचहत्तर
छिहत्तर = seventy-six [everyday] | छिहत्तर
सतहत्तर = seventy-seven [everyday] | सतहत्तर
अठहत्तर = seventy-eight [everyday] | अठहत्तर
उनासी = seventy-nine [everyday also:उन्यासी] | उनासी
इक्यासी = eighty-one [everyday] | इक्यासी
बयासी = eighty-two [everyday] | बयासी
तिरासी = eighty-three [everyday] | तिरासी
चौरासी = eighty-four [everyday] | चौरासी
पचासी = eighty-five [everyday] | पचासी
छियासी = eighty-six [everyday] | छियासी
सत्तासी = eighty-seven [everyday] | सत्तासी
अट्ठासी = eighty-eight [everyday] | अट्ठासी
नवासी = eighty-nine [everyday] | नवासी
इक्यानवे = ninety-one [everyday] | इक्यानवे
बानवे = ninety-two [everyday] | बानवे
तिरानवे = ninety-three [everyday] | तिरानवे
चौरानवे = ninety-four [everyday] | चौरानवे
पंचानवे = ninety-five [everyday] | पंचानवे
छियानवे = ninety-six [everyday] | छियानवे
सत्तानवे = ninety-seven [everyday] | सत्तानवे
अट्ठानवे = ninety-eight [everyday] | अट्ठानवे
निन्यानवे = ninety-nine [everyday] | निन्यानवे
`;

/** Names the plan's cast and the GDL books need (6.2, 7.7). A name whose gender the drafter was not sure of carries none. */
export const GAP_NAME_ROWS = `
# PROPN
## d:people
सैम/m = Sam (a man's name, from English)
अमन/m = Aman (a boy's name)
जॉन/m = John (a man's name, from English)
डेविड/m = David (a man's name, from English)
अर्जुन/m = Arjun (a man's name)
अकबर/m = Akbar (a man's name)
श्रीनिवास/m = Srinivas (a man's name)
सोनू = Sonu (a boy's or girl's name)
मुन्नु = Munnu (a pet name for a small boy)
चीकू = Chiku (a pet name)
अनु/f = Anu (a girl's name)
रीति/f = Reeti (a girl's name)
मुनिया/f = Muniya (a little girl's name)
रज़ा = Raza (a name)
भबलू = Bhablu (a character of the GDL books)
मोरू = Moru (a character of the GDL books)
मुमताज़ = Mumtaz (a character of the GDL books)
कल्लू = Kallu (a character of the GDL books)
टूका = Tuka (a character of the GDL books)
मुत्तज्जी = Muttajji (a character of the GDL books)
जादव = Jadav (a character of the GDL books)
मिठु = Mithu (a character of the GDL books)
पपलू = Paplu (a character of the GDL books)
## d:city
लखनऊ/m = Lucknow
`;
