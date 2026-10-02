/**
 * The closed classes of Hindi and the verbs a learner meets in every sentence: pronouns with every direct, oblique and
 * fused form (मुझे, मुझसे, उसने, किसको), possessives, demonstrative and relative words, postpositions, conjunctions and
 * subordinators, particles, interjections, and the irregular verbs होना, करना, देना, लेना, जाना, आना … with their paradigms.
 * Every form is listed, because these are the commonest words in any text and must not depend on the rules.
 * Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker.
 */
export const FUNCTION_ROWS = `
# AUX
होना = to be; to become [noerg everyday] | होना:inf; होने:inf obl; हूँ:1s pres VerbForm=Fin; है:3s pres VerbForm=Fin; है:2s pres VerbForm=Fin; हैं:3p pres VerbForm=Fin; हैं:1p pres VerbForm=Fin; हैं:Person=2 Number=Plur Polite=Form pres VerbForm=Fin; हो:Person=2 Polite=Fam pres VerbForm=Fin; हो:VerbForm=Stem; हो:Mood=Sub Person=3 Number=Sing VerbForm=Fin; हो:Mood=Sub Person=2 Number=Sing VerbForm=Fin; हो:Mood=Sub Person=2 Polite=Fam VerbForm=Fin; हो:Mood=Imp Person=2 Polite=Fam VerbForm=Fin; हों:Mood=Sub Person=3 Number=Plur VerbForm=Fin; हों:Mood=Sub Person=1 Number=Plur VerbForm=Fin; हों:Mood=Sub Person=2 Number=Plur Polite=Form VerbForm=Fin; हों:Mood=Imp Person=2 Polite=Form VerbForm=Fin; होइए:Mood=Imp Person=2 Polite=Form VerbForm=Fin; था:m sg past Person=3 VerbForm=Fin; था:m sg past Person=1 VerbForm=Fin; था:m sg past Person=2 VerbForm=Fin; थी:f sg past Person=3 VerbForm=Fin; थी:f sg past Person=1 VerbForm=Fin; थी:f sg past Person=2 VerbForm=Fin; थे:m pl past Person=3 VerbForm=Fin; थे:m pl past Person=1 VerbForm=Fin; थे:m pl past Person=2 Polite=Fam VerbForm=Fin; थे:m pl past Person=2 Polite=Form VerbForm=Fin; थीं:f pl past Person=3 VerbForm=Fin; थीं:f pl past Person=1 VerbForm=Fin; थीं:f pl past Person=2 Polite=Fam VerbForm=Fin; थीं:f pl past Person=2 Polite=Form VerbForm=Fin; हुआ:VerbForm=Part pfv m sg; हुए:VerbForm=Part pfv m pl; हुई:VerbForm=Part pfv f sg; हुईं:VerbForm=Part pfv f pl; होता:VerbForm=Part ipfv m sg; होते:VerbForm=Part ipfv m pl; होते:VerbForm=Part ipfv m sg obl; होती:VerbForm=Part ipfv f sg; होतीं:VerbForm=Part ipfv f pl; हूँगा:Tense=Fut Mood=Ind VerbForm=Fin Person=1 Number=Sing Gender=Masc; हूँगी:Tense=Fut Mood=Ind VerbForm=Fin Person=1 Number=Sing Gender=Fem; होगा:Tense=Fut Mood=Ind VerbForm=Fin Person=3 Number=Sing Gender=Masc; होगा:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Number=Sing Gender=Masc; होगी:Tense=Fut Mood=Ind VerbForm=Fin Person=3 Number=Sing Gender=Fem; होगी:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Number=Sing Gender=Fem; होगी:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Polite=Fam Gender=Fem; होंगे:Tense=Fut Mood=Ind VerbForm=Fin Person=3 Number=Plur Gender=Masc; होंगे:Tense=Fut Mood=Ind VerbForm=Fin Person=1 Number=Plur Gender=Masc; होंगे:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Number=Plur Polite=Form Gender=Masc; होंगी:Tense=Fut Mood=Ind VerbForm=Fin Person=3 Number=Plur Gender=Fem; होंगी:Tense=Fut Mood=Ind VerbForm=Fin Person=1 Number=Plur Gender=Fem; होंगी:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Number=Plur Polite=Form Gender=Fem; होगे:Tense=Fut Mood=Ind VerbForm=Fin Person=2 Polite=Fam Gender=Masc; होकर:VerbForm=Conv
सकना = to be able to, can [everyday] | @verb:c noimp
चाहिए = ought to, should; is needed [inv everyday] | चाहिए

# VERB
करना = to do, to make [erg everyday d:daily-life] | @verb:c nopf noimp; किया:VerbForm=Part pfv m sg; किए:VerbForm=Part pfv m pl; की:VerbForm=Part pfv f sg; कीं:VerbForm=Part pfv f pl; कीजिए:Mood=Imp Person=2 Polite=Form VerbForm=Fin; कर:VerbForm=Conv; करके:VerbForm=Conv
देना = to give; to let [erg everyday] | @verb:e
लेना = to take [erg everyday] | @verb:e
जाना = to go [noerg everyday d:travel] | @verb:v nopf; गया:VerbForm=Part pfv m sg; गए:VerbForm=Part pfv m pl; गई:VerbForm=Part pfv f sg; गईं:VerbForm=Part pfv f pl
आना = to come [noerg everyday d:travel] | @verb:v
रहना = to stay, to live; to keep on (the continuous) [noerg everyday] | @verb:c
पाना = to get, to find; to be able to [erg everyday] | @verb:v
चाहना = to want, to wish [erg everyday] | @verb:c
कहना = to say, to tell [erg everyday d:speech] | @verb:c
लगना = to seem; to be felt; to begin (after an oblique infinitive) [noerg everyday] | @verb:c
पड़ना = to fall; to have to (after an oblique infinitive) [noerg everyday] | @verb:c
चुकना = to have already (done); to be finished [noerg everyday] | @verb:c noimp
समझना = to understand; to think, to consider [everyday d:school] | @verb:c
रखना = to keep, to put, to place [erg everyday] | @verb:c
मानना = to accept, to obey; to believe; to confess [erg everyday d:theology] | @verb:c
देखना = to see, to look at [erg everyday] | @verb:c
सुनना = to hear, to listen [erg everyday] | @verb:c
बोलना = to speak [everyday d:speech] | @verb:c
करवाना = to have (something) done [erg everyday cau:करना] | @verb:v
कराना = to have (something) done [erg everyday cau:करना] | @verb:v

# PRON
मैं = I [everyday] | मैं:1s dir prs; मैंने:1s prs Case=Erg; मुझ:1s obl prs; मुझे:1s prs Case=Dat; मुझको:1s prs Case=Dat; मुझसे:1s obl prs; मुझमें:1s obl prs; मुझपर:1s obl prs
हम = we [everyday] | हम:1p dir prs; हम:1p obl prs; हमने:1p prs Case=Erg; हमें:1p prs Case=Dat; हमको:1p prs Case=Dat; हमसे:1p obl prs; हममें:1p obl prs; हमपर:1p obl prs
तू = you (intimate: to a child, a close friend, God in prayer) [everyday] | तू:2s dir prs Polite=Infm; तूने:2s prs Case=Erg Polite=Infm; तुझ:2s obl prs Polite=Infm; तुझे:2s prs Case=Dat Polite=Infm; तुझको:2s prs Case=Dat Polite=Infm; तुझसे:2s obl prs Polite=Infm; तुझमें:2s obl prs Polite=Infm; तुझपर:2s obl prs Polite=Infm
तुम = you (familiar) [everyday] | तुम:Person=2 dir prs Polite=Fam; तुम:Person=2 obl prs Polite=Fam; तुमने:Person=2 prs Case=Erg Polite=Fam; तुम्हें:Person=2 prs Case=Dat Polite=Fam; तुमको:Person=2 prs Case=Dat Polite=Fam; तुमसे:Person=2 obl prs Polite=Fam; तुममें:Person=2 obl prs Polite=Fam; तुमपर:Person=2 obl prs Polite=Fam
आप = you (polite); oneself (in अपने आप) [everyday] | आप:Person=2 dir prs Polite=Form; आप:Person=2 obl prs Polite=Form; आपने:Person=2 prs Case=Erg Polite=Form; आपको:Person=2 prs Case=Dat Polite=Form; आपसे:Person=2 obl prs Polite=Form; आपमें:Person=2 obl prs Polite=Form; आपपर:Person=2 obl prs Polite=Form
यह = this; he, she, it (near) [everyday] | यह:3s dir dem; इस:3s obl dem; इसे:3s dem Case=Dat; इसको:3s dem Case=Dat; इसने:3s dem Case=Erg; इससे:3s obl dem; इसमें:3s obl dem; इसपर:3s obl dem
ये = these; they (near); this [everyday] | ये:3p dir dem; इन:3p obl dem; इन्हें:3p dem Case=Dat; इनको:3p dem Case=Dat; इन्होंने:3p dem Case=Erg; इनसे:3p obl dem; इनमें:3p obl dem; इनपर:3p obl dem
वह = that; he, she, it (far) [everyday] | वह:3s dir dem; उस:3s obl dem; उसे:3s dem Case=Dat; उसको:3s dem Case=Dat; उसने:3s dem Case=Erg; उससे:3s obl dem; उसमें:3s obl dem; उसपर:3s obl dem
वे = those; they (far) [everyday] | वे:3p dir dem; उन:3p obl dem; उन्हें:3p dem Case=Dat; उनको:3p dem Case=Dat; उन्होंने:3p dem Case=Erg; उनसे:3p obl dem; उनमें:3p obl dem; उनपर:3p obl dem
यही = this very one (यह + ही) [everyday] | यही:3s dir dem; इसी:3s obl dem; इन्हीं:3p obl dem
वही = that very one (वह + ही) [everyday] | वही:3s dir dem; उसी:3s obl dem; उन्हीं:3p obl dem
कौन = who [everyday] | कौन:int dir; किस:int obl; किसे:int Case=Dat; किसको:int Case=Dat; किसने:int Case=Erg; किससे:int obl; किसमें:int obl; किसपर:int obl; किन:int obl Number=Plur; किन्हें:int Case=Dat Number=Plur; किन्होंने:int Case=Erg Number=Plur; किनसे:int obl Number=Plur; किनमें:int obl Number=Plur
क्या = what [everyday] | क्या:int
जो = who, which, that (relative) [everyday] | जो:rel dir; जिस:rel obl; जिसे:rel Case=Dat; जिसको:rel Case=Dat; जिसने:rel Case=Erg; जिससे:rel obl; जिसमें:rel obl; जिसपर:rel obl; जिन:rel obl Number=Plur; जिन्हें:rel Case=Dat Number=Plur; जिन्होंने:rel Case=Erg Number=Plur; जिनसे:rel obl Number=Plur; जिनमें:rel obl Number=Plur
कोई = someone, anyone; some, any [everyday] | कोई:PronType=Ind dir; किसी:PronType=Ind obl
कुछ = something, anything; some [everyday] | कुछ:PronType=Ind
सब = all, everyone, everything [everyday] | सब; सबको:Case=Dat; सबने:Case=Erg; सबसे:obl; सबमें:obl
सभी = all, everyone [everyday] | सभी
दोनों = both [everyday] | दोनों
खुद = oneself, myself, himself (emphasis) [perso-arabic everyday] | खुद
स्वयं = oneself, in person [sanskritic formal] | स्वयं

# DET
मेरा = my [everyday] | @adj:poss Person=1
हमारा = our [everyday] | @adj:poss Person=1
तेरा = your (intimate) [everyday] | @adj:poss Person=2 Polite=Infm
तुम्हारा = your (familiar) [everyday] | @adj:poss Person=2 Polite=Fam
आपका = your (polite) [everyday] | @adj:poss Person=2 Polite=Form
उसका = his, her, its (that one's) [everyday] | @adj:poss Person=3
इसका = its, his, her (this one's) [everyday] | @adj:poss Person=3
उनका = their; his, her (respectful) [everyday] | @adj:poss Person=3
इनका = their; his, her (respectful, near) [everyday] | @adj:poss Person=3
किसका = whose [everyday] | @adj:poss int
जिसका = whose (relative) [everyday] | @adj:poss rel
अपना = own (my own, your own, his own …: the subject's) [everyday] | @adj:poss
हर = every, each [everyday] | हर
कई = several, many a [everyday] | कई
अन्य = other, another [sanskritic formal] | अन्य

# ADP
का = of; 's (agrees with the thing owned: का के की) [everyday] | का:m sg dir; के:m; की:f
को = to; (marks the person receiving or the definite object) [everyday] | को
में = in, inside; among [everyday] | में
पर = on, at; (in believe in) [everyday] | पर
से = from; with, by; than [everyday] | से
ने = (marks the doer of a perfective verb) [everyday] | ने:Case=Erg
तक = up to, until, as far as; even [everyday] | तक
लिए = for, for the sake of (in के लिए) [everyday] | लिए
साथ = with, together with (in के साथ) [everyday] | साथ
पास = near, with; at hand (in के पास) [everyday] | पास
बाद = after (in के बाद) [everyday] | बाद
पहले = before; first, earlier (in से पहले) [everyday] | पहले
ऊपर = above, on top of; upstairs (in के ऊपर) [everyday] | ऊपर
नीचे = under, below; downstairs (in के नीचे) [everyday] | नीचे
अंदर = inside, in (in के अंदर) [perso-arabic everyday] | अंदर
बाहर = outside (in के बाहर) [everyday] | बाहर
सामने = in front of, facing (in के सामने) [everyday] | सामने
पीछे = behind; after (in के पीछे) [everyday] | पीछे
आगे = ahead of, in front of; further (in के आगे) [everyday] | आगे
बीच = between, in the middle of (in के बीच) [everyday] | बीच
बिना = without [everyday] | बिना
द्वारा = by, through (the doer or the means) [sanskritic formal] | द्वारा
ओर = toward, in the direction of (in की ओर) [everyday] | ओर
तरफ़ = toward, side (in की तरफ़) [perso-arabic everyday] | तरफ़
तरह = like, in the manner of (in की तरह) [everyday] | तरह
बारे = about, concerning (in के बारे में) [everyday] | बारे
कारण = because of, owing to (in के कारण) [sanskritic] | कारण
वजह = because of, owing to (in की वजह से) [perso-arabic everyday] | वजह
बजाय = instead of (in के बजाय) [perso-arabic] | बजाय
अलावा = besides, apart from (in के अलावा) [perso-arabic everyday] | अलावा
भीतर = inside, within (in के भीतर) [sanskritic formal] | भीतर
निकट = near, close to (in के निकट) [sanskritic formal] | निकट
समीप = near, close to (in के समीप) [sanskritic formal] | समीप
दौरान = during (in के दौरान) [perso-arabic formal] | दौरान
ज़रिए = through, by means of (in के ज़रिए) [perso-arabic everyday] | ज़रिए
अनुसार = according to (in के अनुसार) [sanskritic formal] | अनुसार
सहित = together with (in के सहित) [sanskritic formal] | सहित
समेत = along with, including [perso-arabic] | समेत
सिवा = except, apart from (in के सिवा) [perso-arabic everyday] | सिवा
सिवाय = except, apart from (in के सिवाय) [perso-arabic everyday] | सिवाय
बगैर = without [perso-arabic everyday] | बगैर
ख़िलाफ़ = against (in के ख़िलाफ़) [perso-arabic everyday] | ख़िलाफ़
ख़ातिर = for the sake of (in की ख़ातिर) [perso-arabic everyday] | ख़ातिर
बदले = in exchange for, instead of (in के बदले) [everyday] | बदले
बावजूद = in spite of (in के बावजूद) [perso-arabic everyday] | बावजूद
संग = with, along with (in के संग) [literary everyday] | संग

# CONJ
और = and [everyday] | और
या = or [everyday] | या
लेकिन = but [perso-arabic everyday] | लेकिन
पर = but [everyday] | पर
मगर = but [perso-arabic everyday] | मगर
परन्तु = but, yet [sanskritic formal] | परन्तु
किन्तु = but, however [sanskritic formal literary] | किन्तु
बल्कि = but rather, on the contrary [perso-arabic everyday] | बल्कि
इसलिए = therefore, so, for this reason [everyday] | इसलिए
अथवा = or [sanskritic formal] | अथवा
तथा = and [sanskritic formal] | तथा
एवं = and [sanskritic formal] | एवं
यानी = that is, in other words [perso-arabic everyday] | यानी
अर्थात् = that is, namely [sanskritic formal] | अर्थात्
वरना = otherwise, or else [perso-arabic everyday] | वरना
अन्यथा = otherwise [sanskritic formal] | अन्यथा
तथापि = even so, nevertheless [sanskritic formal literary] | तथापि
हालाँकि = although, however [perso-arabic everyday] | हालाँकि
जबकि = while, whereas [everyday] | जबकि

# SCONJ
कि = that [everyday] | कि
क्योंकि = because, for [everyday] | क्योंकि
ताकि = so that, in order that [everyday] | ताकि
अगर = if [perso-arabic everyday] | अगर
यदि = if [sanskritic formal] | यदि
जब = when [everyday] | जब
जैसे = as, like; for example [everyday] | जैसे
चूँकि = since, because [perso-arabic formal] | चूँकि
चाहे = whether; although [everyday] | चाहे

# PART
भी = also, too, even [everyday] | भी
ही = only, just, very; (emphasis) [everyday] | ही
तो = then, so; indeed, as for (emphasis) [everyday] | तो
न = not; (a tag question: न?) [everyday] | न
मत = do not (a command) [everyday] | मत
क्या = (marks a yes/no question) [everyday] | क्या:int
सा = -ish; like, as if (after a word: थोड़ा सा, कौन सा) [everyday] | @adj
वाला = one who, one that; -er (आने वाला = the coming one) [everyday] | @adj
भर = all through, the whole of; only (दिन भर) [everyday] | भर
सिर्फ़ = only, merely [perso-arabic everyday] | सिर्फ़
केवल = only, merely [sanskritic] | केवल

# ADV
नहीं = not, no [everyday] | नहीं
अब = now [everyday] | अब
तब = then, at that time [everyday] | तब
फिर = then, again, afterwards [perso-arabic everyday] | फिर
कभी = ever, sometime; (with न: never) [everyday] | कभी
अभी = right now, just now [everyday] | अभी
यहाँ = here [everyday] | यहाँ
वहाँ = there [everyday] | वहाँ
जहाँ = where (relative) [everyday] | जहाँ
कहाँ = where [everyday] | कहाँ
कब = when [everyday] | कब
क्यों = why [everyday] | क्यों
कैसे = how; in what way [everyday] | कैसे
ऐसे = in this way, like this [everyday] | ऐसे
वैसे = in that way; by the way [everyday] | वैसे
बहुत = very, much, many [everyday] | बहुत
ज़रूर = certainly, surely; without fail [perso-arabic everyday] | ज़रूर
शायद = perhaps, maybe [perso-arabic everyday] | शायद
कृपया = please [sanskritic formal] | कृपया

# INTJ
हाँ = yes [everyday] | हाँ
जी = yes (respectful); sir, madam [everyday] | जी
नमस्ते = hello; goodbye (a greeting) [sanskritic everyday] | नमस्ते
नमस्कार = hello; greetings [sanskritic formal] | नमस्कार
धन्यवाद = thank you [sanskritic everyday] | धन्यवाद
शुक्रिया = thanks [perso-arabic colloquial] | शुक्रिया
आमीन = amen [religious biblical] | आमीन
हे = O (before a name one calls: हे प्रभु) [sanskritic religious] | हे
अरे = hey, oh [colloquial] | अरे
वाह = wow, well done [colloquial] | वाह
`;
