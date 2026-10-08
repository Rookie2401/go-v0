/**
 * The words the first reading of the Hindi ladder (data/ladder/hi, 101 units) found missing or read wrongly (adapter-hi@5):
 * a few loans of the clinic and phone units (क्लिनिक, सिम, कार्ड, स्क्रीन, गेस्ट हाउस), आंटी, पैदल, the month मई, a play, a manger,
 * Herod, the burrow beside the bill, the right-hand adjective दायाँ (दाईं), a second word written alike (the verb बँधना), and the
 * spellings पीऊँगा / पीएँगे of the future of पीना. Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker.
 *
 * adapter-hi@6 (2026-10-08, the b1-bridge and the recycling pass): the names of the library books that the bridge places (picture-book
 * characters, the two disciples of Andher Nagari: PROPN, so that a name is no word to learn), the spelling हेलो, the variants अणू /
 * वायुमण्डल / टार्च (written on a row), nouns that a verb reading had taken (बेल, झाड़ी, टहनी, दाखलता), loans (अंकल, सोफ़ा, टॉर्च),
 * दुश्मनी, the verbs मचलना and दुबकना, and the adjectives बर्फ़ीला and कँटीला (so that all their forms are one word).
 */
export const LADDER_FIX_ROWS = `
# NOUN
## d:family
आंटी/f = aunty (a polite address to a woman older than oneself; an aunt) [english-loan everyday also:आँटी]
## d:health
क्लिनिक/m = clinic [english-loan everyday]
## d:daily-life
सिम/m = SIM card [english-loan everyday]
कार्ड/m = card [english-loan everyday]
स्क्रीन/f = screen [english-loan everyday]
नाटक/m = play, drama [sanskritic everyday]
## d:travel
गेस्ट/m = guest [english-loan everyday]
हाउस/m = house (गेस्ट हाउस = guest house) [english-loan everyday]
## d:time
मई/m = May [d:time]
## d:animals
चरनी/f = manger, feeding trough [everyday]
बिल#2/m = burrow, den (of a mouse, a snake) [everyday]
## d:nature
बेल/f = vine, creeper (a climbing plant) [everyday]
झाड़ी/f = bush, shrub [everyday]
टहनी/f = twig, small branch [everyday]
दाखलता/f = grapevine (the word of the older Bible Hindi) [biblical sanskritic]
## d:nature
अणु/m = atom, molecule, a tiny particle [sanskritic also:अणू]
वायुमंडल/m = atmosphere (the layer of air around the earth) [sanskritic also:वायुमण्डल]
## d:daily-life
टॉर्च/f = torch, flashlight [english-loan everyday also:टार्च]
## d:feelings
दुश्मनी/f = enmity, hostility [perso-arabic everyday]
## d:people
अंकल/m = uncle (a polite address to an older man) [inv english-loan everyday]
## d:house
सोफ़ा/m = sofa [english-loan everyday]

# PROPN
## d:people
हेरोदेस/m = Herod [biblical]
चिन्टू/m = Chintu (a boy's name)
गोबरधनदास/m = Gobardhandas (a disciple in Bharatendu's play Andher Nagari)
नारायणदास/m = Narayandas (a disciple in Bharatendu's play Andher Nagari)
मुन्नी/f = Munni (a girl's pet name)
मुन्ना/m = Munna (a boy's pet name)
चुलबुल = Chulbul (the squirrel's name in a picture book)
बोम्बो/m = Bombo (the bear doctor's name in a picture book)
मीमी/f = Mimi (a girl's name)
अली/m = Ali (a boy's name)
गौरव/m = Gaurav (a boy's name)
सुमी/f = Sumi (a girl's name)
स्वीटी/f = Sweety (a girl's pet name, from English)
बाला/f = Bala (a girl's name)
रमा/f = Rama (a woman's name)
रीमा/f = Reema (a woman's name)
मोना/f = Mona (a girl's name)
सिकंदर/m = Sikandar (a name; Alexander)
मिथुन/m = Mithun (a boy's name)
ऋचा/f = Richa (a girl's name) [also:ॠचा]
मीनू/f = Meenu (a girl's name)
टिमी = Timmy (a dog's name, from English)
पेपा = Pepa (a dog's name)

# INTJ
हेलो = hello (a second spelling of हैलो) [english-loan everyday]

# ADV
## d:travel
पैदल = on foot [everyday] | पैदल

# ADJ
बर्फ़ीला = snowy, icy [everyday] | @adj
कँटीला = thorny, prickly [everyday] | @adj
दायाँ = right (the right hand, the right side) [everyday] | दायाँ:m sg dir; दाएँ:m sg obl; दाएँ:m pl dir; दाएँ:m pl obl; दायीं:f sg; दायीं:f pl; दाईं:f sg; दाईं:f pl
बायाँ = left (the left hand, the left side) [everyday] | बायाँ:m sg dir; बाएँ:m sg obl; बाएँ:m pl dir; बाएँ:m pl obl; बायीं:f sg; बायीं:f pl; बाईं:f sg; बाईं:f pl

# VERB
बँधना = to be tied, to be bound [noerg] | @verb:c
मचलना = to fuss and insist like a small child, to be restless with wanting [noerg] | @verb:c
दुबकना = to crouch, to hide oneself low (a cat, a child) [noerg] | @verb:c
`;
