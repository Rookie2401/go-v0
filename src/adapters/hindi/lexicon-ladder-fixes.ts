/**
 * The words the first reading of the Hindi ladder (data/ladder/hi, 101 units) found missing or read wrongly (adapter-hi@5):
 * a few loans of the clinic and phone units (क्लिनिक, सिम, कार्ड, स्क्रीन, गेस्ट हाउस), आंटी, पैदल, the month मई, a play, a manger,
 * Herod, the burrow beside the bill, the right-hand adjective दायाँ (दाईं), a second word written alike (the verb बँधना), and the
 * spellings पीऊँगा / पीएँगे of the future of पीना. Row format: see ./entries.ts. Machine-drafted, not reviewed by a native speaker.
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

# PROPN
## d:people
हेरोदेस/m = Herod [biblical]

# ADV
## d:travel
पैदल = on foot [everyday] | पैदल

# ADJ
दायाँ = right (the right hand, the right side) [everyday] | दायाँ:m sg dir; दाएँ:m sg obl; दाएँ:m pl dir; दाएँ:m pl obl; दायीं:f sg; दायीं:f pl; दाईं:f sg; दाईं:f pl
बायाँ = left (the left hand, the left side) [everyday] | बायाँ:m sg dir; बाएँ:m sg obl; बाएँ:m pl dir; बाएँ:m pl obl; बायीं:f sg; बायीं:f pl; बाईं:f sg; बाईं:f pl

# VERB
बँधना = to be tied, to be bound [noerg] | @verb:c
`;
