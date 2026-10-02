/**
 * Data for the Hindi multiword units: noun / adjective + light verb (complex predicates), compound postpositions and
 * fixed expressions. Machine-drafted from general knowledge of Hindi, not checked by a native speaker; a unit that the
 * drafter was not sure of is left out. Matching is on lemmas or written forms, with the nukta ignored on both sides, so
 * that a learner's जरूरत still finds ज़रूरत.
 *
 * Complex predicates are written per light verb as "word=meaning;" lists. The meaning is the unit's, not the sum of
 * its words.
 */

/** light verb → "noun=meaning;noun=meaning;…" */
const PREDICATES: Record<string, string> = {
  'करना':
    'याद=to remember, to learn by heart, to recall;कोशिश=to try, to make an effort;शुरू=to begin, to start (something);खत्म=to finish, to bring to an end;पसंद=to like, to choose;मदद=to help;इंतज़ार=to wait for (X का);बात=to talk, to speak with;काम=to work;प्यार=to love (X से);विश्वास=to believe, to trust (in X पर);प्रार्थना=to pray;क्षमा=to forgive;माफ़=to forgive, to excuse;फ़ैसला=to decide;इस्तेमाल=to use;शादी=to marry;पश्चाताप=to repent;स्वीकार=to accept, to confess;इनकार=to refuse, to deny;उम्मीद=to hope, to expect;इच्छा=to wish, to desire;उपयोग=to use;इलाज=to treat (an illness);इशारा=to signal, to point;एतराज़=to object;कब्ज़ा=to seize, to take possession;खोज=to search, to investigate;गलती=to make a mistake;चिंता=to worry (about X की);चर्चा=to discuss;चोरी=to steal;जाँच=to examine, to check;झगड़ा=to quarrel;तलाश=to search for;तारीफ़=to praise;तैयारी=to prepare;दावा=to claim;नकल=to copy, to imitate;परवाह=to care about;पूजा=to worship;प्रयास=to attempt;प्रचार=to preach, to advertise;प्रतीक्षा=to wait for;प्रयोग=to use, to experiment;बहस=to argue;भरोसा=to trust (X पर);भक्ति=to worship with devotion;मज़ाक=to joke;मेहनत=to work hard;माँग=to demand;यात्रा=to travel;रक्षा=to protect;शिकायत=to complain;शिकार=to hunt;सफ़र=to travel, to journey;सफ़ाई=to clean;साफ़=to clean;सहायता=to help;सेवा=to serve;स्नान=to bathe;स्वागत=to welcome;हमला=to attack;हस्ताक्षर=to sign;इंतज़ाम=to arrange, to provide;अनुवाद=to translate;अध्ययन=to study;अभ्यास=to practise;आराम=to rest;आशा=to hope;घोषणा=to announce;निवेदन=to request, to submit;पालन=to obey, to follow (a rule);पीछा=to chase, to follow;बचाव=to defend;बयान=to state, to describe;भेंट=to present as a gift;मंज़ूर=to approve, to accept;महसूस=to feel;मुक़दमा=to sue;याचना=to beg, to petition;वादा=to promise;व्यवहार=to behave, to treat;शासन=to rule;शोर=to make a noise;संघर्ष=to struggle;सम्मान=to respect, to honour;सलाम=to salute;समझौता=to compromise, to make an agreement;समर्थन=to support;सहन=to bear, to endure;संकल्प=to resolve;सुधार=to improve, to reform;सुरक्षा=to protect;स्थापना=to establish;हल=to solve;बंद=to close, to shut off;चालू=to switch on, to start;पूरा=to complete, to fulfil;ख़र्च=to spend;पार=to cross;इकट्ठा=to gather, to collect;तय=to settle, to fix;कम=to reduce;गुस्सा=to be angry (at X पर);नाराज़=to make angry;ख़ुश=to please;दुखी=to sadden;तंग=to trouble;परेशान=to bother, to trouble;बर्बाद=to ruin, to waste;आदर=to respect;प्रेम=to love (X से);घृणा=to hate;नफ़रत=to hate;आक्रमण=to attack, to invade;निर्माण=to build, to create;रचना=to compose, to create;न्याय=to judge, to do justice;निर्णय=to decide;चुनाव=to choose, to select;वर्णन=to describe;उल्लेख=to mention;अनुरोध=to request;प्रशंसा=to praise;विरोध=to oppose;समाप्त=to end, to conclude;प्रस्तुत=to present;प्रकट=to reveal, to show;प्रदान=to grant;उत्पन्न=to produce;प्रवेश=to enter;निवास=to dwell;विचार=to think about, to consider;ध्यान=to meditate;स्मरण=to remember;उपासना=to worship;स्तुति=to praise (God);दर्शन=to see, to visit (a holy person or place);मना=to forbid;नमस्कार=to greet;सत्कार=to receive with honour;त्याग=to give up, to renounce;उद्धार=to save, to deliver;पाप=to sin;दया=to have mercy;कृपा=to show favour',
  'होना':
    'प्यार=to fall in love (with X से);प्रेम=to fall in love (with X से);डर=to be afraid (of X से);ग़लती=to make a mistake, to be at fault (by X से);देरी=to be late, to be delayed;याद=to know by heart, to remember;शुरू=to begin;खत्म=to end, to be finished;पसंद=to be liked (by);तैयार=to be ready, to get ready;पता=to know, to be aware;मालूम=to be known, to know;देर=to be late, to take time;नाराज़=to be angry;ख़ुश=to be glad;दुखी=to be sad;बीमार=to be ill;पूरा=to be completed, to be fulfilled;शादी=to be married, to get married;बारिश=to rain;दर्द=to hurt, to have pain;बुखार=to have a fever;ज़रूरत=to be needed (X की ज़रूरत);मुलाक़ात=to meet;बात=to be talked about, to have a talk;फ़ायदा=to be of benefit;नुक़सान=to suffer loss, to be damaged;शक=to doubt (X पर);यक़ीन=to be convinced (of X पर);विश्वास=to believe, to be sure (in X पर);चर्चा=to be discussed;सफल=to succeed;असफल=to fail;गुस्सा=to be angry (at X पर);हैरान=to be surprised;परेशान=to be troubled;शर्मिंदा=to be ashamed;हावी=to dominate;लागू=to apply, to come into force;शामिल=to join, to take part;सहमत=to agree;सवार=to ride, to get on;रवाना=to depart;ग़ायब=to disappear;प्रकट=to appear, to be revealed;उत्पन्न=to arise, to be born;उपस्थित=to be present;समाप्त=to end;सुबह=to dawn, to become morning;शाम=to become evening;रात=to become night;इच्छा=to feel like, to wish;ख़बर=to be aware;ज़िम्मेदार=to be responsible;सच=to come true, to be true;आरंभ=to begin;ख़राब=to go bad, to break;ठीक=to be well, to recover;बड़ा=to grow up;मौजूद=to be present;जन्म=to be born;मृत्यु=to die;मौत=to die;मंज़ूर=to be accepted;साफ़=to be clear, to be clean;बंद=to be closed;चालू=to be started;इकट्ठा=to gather;पार=to be across, to be over;तय=to be settled',
  'आना':
    'याद=to be remembered, to miss;नज़र=to be seen, to appear;समझ=to be understood, to make sense;पसंद=to be liked, to please;मज़ा=to enjoy, to be fun;गुस्सा=to get angry (at X पर);रोना=to feel like crying;हँसी=to feel like laughing;नींद=to feel sleepy;चक्कर=to feel dizzy;पसीना=to sweat;ख़्याल=to occur to one;बारी=to come to one\'s turn;मौत=to die;काम=to be of use;हिंदी=to know Hindi;भाषा=to know a language;शर्म=to feel ashamed;तरस=to feel pity;दया=to feel compassion;जान=to come to life, to revive;होश=to come to one\'s senses;बदलाव=to change;सामने=to come forward;आवाज़=to be heard (a sound comes);रास=to suit, to agree with',
  'लगना':
    'भूख=to be hungry;प्यास=to be thirsty;डर=to be afraid (of X से);अच्छा=to seem good, to like;बुरा=to feel bad, to be offended;ठंड=to feel cold;सर्दी=to feel cold;गर्मी=to feel hot;चोट=to get hurt;नींद=to doze off;शर्म=to feel shy;देर=to take a long time;समय=to take time;वक़्त=to take time;मन=to feel at home, to be engrossed;आग=to catch fire;आँख=to fall asleep;सुंदर=to look beautiful;ज़ोर=to take effort;हाथ=to come into one\'s hands;प्यारा=to seem sweet;अजीब=to seem strange;मुश्किल=to seem difficult;आसान=to seem easy;थकान=to feel tired',
  'देना':
    'धन्यवाद=to thank;ध्यान=to pay attention;आशीष=to bless;आशीर्वाद=to bless;गवाही=to give testimony, to witness;दिखाई=to be seen, to be visible;सुनाई=to be heard, to be audible;जवाब=to answer;उत्तर=to answer;इजाज़त=to allow;अनुमति=to permit;सज़ा=to punish;धोखा=to deceive;सहारा=to support;साथ=to accompany, to support;दान=to donate;दुआ=to bless;गाली=to abuse, to swear at;श्राप=to curse;शाप=to curse;जन्म=to give birth to;जगह=to make room;सलाह=to advise;सुझाव=to suggest;उपदेश=to preach;आदेश=to order;आज्ञा=to command;भाषण=to give a speech;परीक्षा=to take an exam;वोट=to vote;ज़ोर=to stress, to insist;रिश्वत=to bribe;तसल्ली=to console;बधाई=to congratulate;शुभकामना=to give good wishes;धमकी=to threaten;चेतावनी=to warn;मौक़ा=to give a chance;समय=to give time;उधार=to lend;बलिदान=to sacrifice;प्राण=to give up one\'s life;जान=to give one\'s life;उदाहरण=to give an example;ख़बर=to inform;सूचना=to inform;संदेश=to deliver a message;दोष=to blame;कान=to listen carefully;दिलासा=to comfort;अधिकार=to give authority;शिक्षा=to teach;ज्ञान=to impart knowledge;राय=to give an opinion;दावत=to invite to a feast;निमंत्रण=to invite;भरोसा=to assure;वचन=to give one\'s word;सबूत=to give evidence;साक्षी=to bear witness;रास्ता=to give way',
  'लेना':
    'साँस=to breathe;नाम=to name, to mention;सबक़=to learn a lesson;बदला=to take revenge;सहारा=to rely on;काम=to make use of;जन्म=to be born;भाग=to take part;सलाह=to take advice;छुट्टी=to take leave;इजाज़त=to take permission;परीक्षा=to examine, to test;मदद=to take help;फ़ैसला=to take a decision;निर्णय=to take a decision;शपथ=to take an oath;प्रतिज्ञा=to take a vow;अनुमति=to take permission;ख़बर=to enquire after, to take to task;आराम=to rest;चुटकी=to tease;रूप=to take shape;मज़ा=to enjoy;रुचि=to take an interest;दिलचस्पी=to take an interest;आशीर्वाद=to receive a blessing;क़सम=to take an oath;उधार=to borrow;कर्ज़=to take a loan;टिकट=to buy a ticket;हिस्सा=to take part;शरण=to take refuge;अंगड़ाई=to stretch;करवट=to turn over;जायज़ा=to survey',
  'रखना':
    'याद=to remember, to keep in mind;ध्यान=to take care, to keep in mind;विश्वास=to have faith;आशा=to hope;उम्मीद=to hope;नाम=to name;भरोसा=to trust (X पर);नज़र=to keep an eye on;क़दम=to step, to set foot;व्रत=to keep a fast;उपवास=to fast;रोज़ा=to keep a fast;ख़याल=to take care of;प्रेम=to love (X से);साथ=to keep with one;पास=to keep with oneself;बात=to put forward a point, to keep a promise;शर्त=to set a condition;आस=to hope;सब्र=to be patient;धीरज=to be patient;हिसाब=to keep accounts;रुचि=to have an interest;इरादा=to intend',
  'चलना':
    'काम=to get by;हवा=to blow (wind);साथ=to walk together;पता=to find out, to come to know;बात=to come up, to be discussed;चाल=to make a move',
  'पड़ना':
    'ज़रूरत=to be needed (X की ज़रूरत);असर=to have an effect;फ़र्क़=to make a difference;आदत=to get used to;नज़र=to catch sight of;बीमार=to fall ill;सुनाई=to be heard;दिखाई=to be seen;बर्फ़=to snow;ओले=to hail;सूखा=to have a drought;अकाल=to have a famine;जान=to seem;मालूम=to seem, to become known;पता=to find out;मुसीबत=to meet trouble;पाला=to encounter;गर्मी=to become hot;सर्दी=to become cold;ठंड=to become cold',
  'मारना':
    'डींग=to boast;गोता=to dive;आँख=to wink;चक्कर=to go round;गप=to chat;लात=to kick;थप्पड़=to slap;पत्थर=to throw stones;गोली=to shoot;छलांग=to jump;झपट्टा=to pounce;मक्खी=to idle about;डंक=to sting;ताना=to taunt;बाज़ी=to win the game',
  'उठाना':
    'फ़ायदा=to take advantage;लाभ=to benefit;क़दम=to take a step;ज़िम्मेदारी=to take responsibility;मज़ा=to enjoy;आवाज़=to raise one\'s voice;सवाल=to raise a question;कष्ट=to suffer;नुक़सान=to suffer a loss;बोझ=to bear a burden;क्रूस=to take up the cross;हाथ=to raise a hand;आनंद=to enjoy',
  'खाना':
    'क़सम=to take an oath;धोखा=to be deceived;चोट=to be hurt;ठोकर=to stumble;हवा=to take the air;तरस=to take pity;मार=to get beaten;डाँट=to get scolded;रिश्वत=to take bribes;चक्कर=to get dizzy;घूस=to take bribes;भाव=to put on airs',
  'मिलना':
    'सज़ा=to be punished;मौक़ा=to get a chance;जवाब=to get an answer;आराम=to get relief;ख़बर=to receive news;सहायता=to get help;छुट्टी=to get leave;नौकरी=to get a job;शांति=to find peace;सुकून=to find peace;इनाम=to get a prize;गले=to embrace;क्षमा=to be forgiven;माफ़ी=to be forgiven;जीवन=to receive life',
  'मिलाना': 'हाथ=to shake hands;आँख=to meet eyes;नज़र=to meet eyes',
  'माँगना':
    'माफ़ी=to apologise;भीख=to beg;दुआ=to pray, to ask a blessing;क्षमा=to ask forgiveness;मदद=to ask for help;इजाज़त=to ask permission;सलाह=to ask advice;जवाब=to demand an answer;हाथ=to ask for a woman\'s hand;मन्नत=to make a vow',
  'बोलना': 'झूठ=to lie;सच=to tell the truth',
  'कहना': 'अलविदा=to say goodbye;सच=to tell the truth;नमस्ते=to greet',
  'गाना': 'गाना=to sing',
  'मानना': 'बात=to obey;बुरा=to take offence;हार=to admit defeat;सच=to believe;धन्यवाद=to be thankful',
  'बनाना': 'खाना=to cook;बात=to make excuses, to put on a show;दोस्त=to make friends;मित्र=to make friends;बहाना=to make an excuse',
  'देखना': 'सपना=to dream;राह=to wait for;रास्ता=to wait for;ख़्वाब=to dream',
  'रहना':
    'चुप=to keep quiet;ख़ुश=to be happy;दूर=to stay away;ज़िंदा=to stay alive;तैयार=to be ready;सावधान=to be careful;सतर्क=to be alert;शांत=to stay calm;साथ=to live together;बीमार=to be ill;याद=to stay in mind;ध्यान=to be mindful',
  'जाना': 'हार=to lose;जीत=to win;ध्यान=to notice, to have one\'s attention drawn',
  'लगाना':
    'ध्यान=to concentrate;मन=to apply oneself;आग=to set fire;गले=to hug;आरोप=to accuse;इलज़ाम=to accuse;हिसाब=to calculate;पता=to find out, to trace;अनुमान=to estimate;ताला=to lock;ज़ोर=to exert oneself;दाग़=to stain;रोक=to ban;पाबंदी=to impose a ban;टीका=to apply a mark, to vaccinate;गोता=to dive;ठहाका=to burst out laughing;आवाज़=to call out;बोली=to bid;दौड़=to run;चक्कर=to go round;नारा=to shout a slogan;नज़र=to cast the evil eye',
  'निकालना': 'समय=to find time;रास्ता=to find a way;ग़लती=to find fault;हल=to find a solution;नतीजा=to draw a conclusion;अर्थ=to work out a meaning',
  'डालना':
    'असर=to influence;प्रभाव=to influence;नज़र=to glance at;डेरा=to camp;दबाव=to put pressure;आदत=to form a habit;बाधा=to obstruct;पर्दा=to cover up;वोट=to cast a vote;खलल=to disturb;रोशनी=to throw light on;फूट=to sow division;जान=to put life into',
  'तोड़ना': 'वादा=to break a promise;नियम=to break a rule;दिल=to break a heart;क़सम=to break an oath',
  'जोड़ना': 'हाथ=to fold one\'s hands',
  'छोड़ना': 'साथ=to abandon;उम्मीद=to give up hope;आस=to give up hope;प्राण=to die;पीछा=to leave alone',
  'चढ़ाना': 'बलि=to sacrifice;भेंट=to offer;फूल=to offer flowers;प्रसाद=to offer prasad',
  'सिखाना': 'सबक़=to teach a lesson',
  'भरना': 'हामी=to assent;पेट=to fill one\'s stomach;आह=to sigh;हुंकार=to roar;उड़ान=to take flight;फ़ॉर्म=to fill in a form;कर=to pay tax;जुर्माना=to pay a fine;फ़ीस=to pay fees',
  'काटना': 'चक्कर=to roam about;समय=to pass the time;सज़ा=to serve a sentence',
  'बिताना': 'समय=to spend time;वक़्त=to spend time;जीवन=to spend a life',
  'गुज़ारना': 'दिन=to pass the days;ज़िंदगी=to pass a life',
  'उतारना': 'फ़ोटो=to take a photograph;तस्वीर=to take a picture',
  'खींचना': 'तस्वीर=to take a picture;ध्यान=to attract attention',
  'सुलझाना': 'समस्या=to solve a problem',
  'उठना': 'सवाल=to arise (a question);दर्द=to arise (pain);तूफ़ान=to rise (a storm)',
  'जलाना': 'आग=to light a fire;दिया=to light a lamp;मोमबत्ती=to light a candle',
  'पकड़ना': 'रास्ता=to take a road;ज़िद=to be obstinate;बस=to catch a bus;हाथ=to hold by the hand',
  'बाँधना': 'पट्टी=to bandage;उम्मीद=to build hopes',
};

export interface ComplexPredicate { noun: string; verb: string; gloss: string }

function parsePredicates(): ComplexPredicate[] {
  const out: ComplexPredicate[] = [];
  for (const [verb, list] of Object.entries(PREDICATES)) {
    for (const entry of list.split(';')) {
      const eq = entry.indexOf('=');
      if (eq <= 0) continue;
      out.push({ noun: entry.slice(0, eq).normalize('NFC'), verb: verb.normalize('NFC'), gloss: entry.slice(eq + 1) });
    }
  }
  return out;
}

export const HINDI_COMPLEX_PREDICATES: readonly ComplexPredicate[] = parsePredicates();

export interface FixedUnit {
  /** Words separated by spaces; a word may offer alternatives with "/" and a repeated word with "-" (साथ-साथ). The first alternative is the pattern word. */
  words: string;
  display: string;
  gloss: string;
  kind: 'frame' | 'formula' | 'idiom';
}

const fx = (kind: FixedUnit['kind'], words: string, gloss: string, display?: string): FixedUnit => ({ kind, words, gloss, display: display ?? words.split(' ').map((w) => w.split('/')[0]).join(' ') });

/** The genitive का stands for का / के / की. */
export const HINDI_COMPOUND_POSTPOSITIONS: readonly FixedUnit[] = [
  fx('frame', 'का लिए/लिये', 'for, for the sake of, in order to', 'के लिए'),
  fx('frame', 'का साथ', 'with, together with, along with', 'के साथ'),
  fx('frame', 'का पास', 'near, by; in the possession of (have)', 'के पास'),
  fx('frame', 'का बाद', 'after', 'के बाद'),
  fx('frame', 'से पहले', 'before'),
  fx('frame', 'का पहले', 'before', 'के पहले'),
  fx('frame', 'से पूर्व', 'before (formal)'),
  fx('frame', 'का ऊपर', 'above, on top of', 'के ऊपर'),
  fx('frame', 'का नीचे', 'below, under', 'के नीचे'),
  fx('frame', 'का अंदर/अन्दर', 'inside', 'के अंदर'),
  fx('frame', 'का बाहर', 'outside', 'के बाहर'),
  fx('frame', 'का सामने', 'in front of, opposite', 'के सामने'),
  fx('frame', 'का पीछे', 'behind, after', 'के पीछे'),
  fx('frame', 'का बीच', 'between, among, in the middle of', 'के बीच'),
  fx('frame', 'का बिना', 'without', 'के बिना'),
  fx('frame', 'का द्वारा', 'by, through, by means of', 'के द्वारा'),
  fx('frame', 'का ओर', 'towards', 'की ओर'),
  fx('frame', 'का तरफ़', 'towards, on the side of', 'की तरफ़'),
  fx('frame', 'का तरह', 'like, in the manner of', 'की तरह'),
  fx('frame', 'का बारे में', 'about, concerning', 'के बारे में'),
  fx('frame', 'का कारण', 'because of, due to', 'के कारण'),
  fx('frame', 'का वजह से', 'because of', 'की वजह से'),
  fx('frame', 'का बजाय/बजाए', 'instead of', 'के बजाय'),
  fx('frame', 'का अलावा', 'besides, apart from', 'के अलावा'),
  fx('frame', 'का अनुसार', 'according to', 'के अनुसार'),
  fx('frame', 'का जगह', 'in place of, instead of', 'की जगह'),
  fx('frame', 'का साथ-साथ', 'together with, along with, as well as', 'के साथ-साथ'),
  fx('frame', 'का भीतर', 'inside, within', 'के भीतर'),
  fx('frame', 'का मुताबिक़', 'according to', 'के मुताबिक़'),
  fx('frame', 'का बावजूद', 'despite', 'के बावजूद'),
  fx('frame', 'का ख़िलाफ़', 'against', 'के ख़िलाफ़'),
  fx('frame', 'का विरुद्ध', 'against', 'के विरुद्ध'),
  fx('frame', 'का विपरीत', 'contrary to', 'के विपरीत'),
  fx('frame', 'का समान', 'like, similar to', 'के समान'),
  fx('frame', 'का दौरान', 'during', 'के दौरान'),
  fx('frame', 'का आगे', 'in front of, ahead of, beyond', 'के आगे'),
  fx('frame', 'का निकट', 'near', 'के निकट'),
  fx('frame', 'का समीप', 'near, close to', 'के समीप'),
  fx('frame', 'का सिवा/सिवाय', 'except, other than', 'के सिवा'),
  fx('frame', 'का ज़रिए/ज़रिये', 'through, by means of', 'के ज़रिए'),
  fx('frame', 'का तहत', 'under (a rule or scheme)', 'के तहत'),
  fx('frame', 'का चलते', 'because of, owing to', 'के चलते'),
  fx('frame', 'का रूप में', 'as, in the form of', 'के रूप में'),
  fx('frame', 'का हिसाब से', 'according to, by the reckoning of', 'के हिसाब से'),
  fx('frame', 'का प्रति', 'towards, regarding (an attitude)', 'के प्रति'),
  fx('frame', 'का संबंध/सम्बन्ध में', 'regarding, in connection with', 'के संबंध में'),
  fx('frame', 'का मुक़ाबले', 'compared with, against', 'के मुक़ाबले'),
  fx('frame', 'का पक्ष में', 'in favour of', 'के पक्ष में'),
  fx('frame', 'का मारे', 'out of (fear, hunger and so on)', 'के मारे'),
  fx('frame', 'का लायक़', 'worthy of, fit for', 'के लायक़'),
  fx('frame', 'का क़रीब', 'near, about (a number)', 'के क़रीब'),
  fx('frame', 'का अधीन', 'under the control of', 'के अधीन'),
  fx('frame', 'का बदले', 'in exchange for, instead of', 'के बदले'),
  fx('frame', 'का नाते', 'as, in the capacity of', 'के नाते'),
  fx('frame', 'का सहारे', 'with the help of, by means of', 'के सहारे'),
  fx('frame', 'का आसपास', 'around', 'के आसपास'),
  fx('frame', 'का दरमियान', 'between, during', 'के दरमियान'),
  fx('frame', 'का वास्ते', 'for (the sake of)', 'के वास्ते'),
  fx('frame', 'का ख़ातिर', 'for the sake of', 'की ख़ातिर'),
  fx('frame', 'का मद्देनज़र', 'in view of', 'के मद्देनज़र'),
  fx('frame', 'का भरोसे', 'relying on', 'के भरोसे'),
  fx('frame', 'का हाथों', 'at the hands of', 'के हाथों'),
  fx('frame', 'का बराबर', 'equal to, as much as', 'के बराबर'),
  fx('frame', 'का मध्य', 'in the middle of, among', 'के मध्य'),
  fx('frame', 'का विषय में', 'regarding, on the subject of', 'के विषय में'),
  fx('frame', 'का बाबत', 'regarding', 'के बाबत'),
  fx('frame', 'का आधार पर', 'on the basis of', 'के आधार पर'),
  fx('frame', 'का तौर पर', 'as, by way of', 'के तौर पर'),
  fx('frame', 'का मामले में', 'in the matter of', 'के मामले में'),
  fx('frame', 'का सिलसिले में', 'in connection with', 'के सिलसिले में'),
  fx('frame', 'से लेकर', 'from … (up to), starting from'),
  fx('frame', 'से दूर', 'far from'),
  fx('frame', 'से बाहर', 'out of'),
];

/** Fixed expressions and greetings. A single word is not a multiword unit and is left to the word list. */
export const HINDI_FIXED_EXPRESSIONS: readonly FixedUnit[] = [
  fx('formula', 'शुभ रात्रि', 'good night'),
  fx('formula', 'शुभ प्रभात', 'good morning'),
  fx('formula', 'शुभ संध्या', 'good evening'),
  fx('formula', 'आपका स्वागत है/हैं', 'you are welcome; welcome'),
  fx('formula', 'आपसे मिलकर ख़ुशी हुई', 'pleased to meet you'),
  fx('formula', 'आप कैसे/कैसी हैं', 'how are you? (polite)'),
  fx('formula', 'तुम कैसे/कैसी हो', 'how are you? (familiar)'),
  fx('formula', 'क्या हाल है/हैं', 'how are you? how are things?'),
  fx('formula', 'मैं ठीक हूँ/हूं', 'I am fine'),
  fx('formula', 'ठीक है', 'all right, okay'),
  fx('formula', 'कोई बात नहीं', 'no problem, never mind'),
  fx('formula', 'क्या बात है', 'what is the matter? how wonderful!'),
  fx('formula', 'जी हाँ', 'yes (polite)'),
  fx('formula', 'जी नहीं', 'no (polite)'),
  fx('formula', 'बहुत-बहुत धन्यवाद', 'thank you very much'),
  fx('formula', 'ख़ुदा हाफ़िज़', 'goodbye'),
  fx('formula', 'फिर मिलेंगे', 'see you again'),
  fx('formula', 'जन्मदिन मुबारक', 'happy birthday'),
  fx('formula', 'शुभ यात्रा', 'have a good journey'),
  fx('formula', 'भगवान का शुक्र है', 'thank God'),
  fx('formula', 'हे प्रभु', 'O Lord'),
  fx('formula', 'हे परमेश्वर', 'O God'),
  fx('formula', 'हे पिता', 'O Father'),
  fx('formula', 'प्रभु यीशु मसीह', 'the Lord Jesus Christ'),
  fx('formula', 'यीशु मसीह', 'Jesus Christ'),
  fx('formula', 'पवित्र आत्मा', 'the Holy Spirit'),
  fx('formula', 'पवित्र शास्त्र', 'Holy Scripture'),
  fx('formula', 'अनन्त/अनंत जीवन', 'eternal life'),
  fx('formula', 'परमेश्वर का राज्य', 'the kingdom of God'),
  fx('formula', 'स्वर्ग का राज्य', 'the kingdom of heaven'),
  fx('formula', 'परमेश्वर का वचन', 'the word of God'),
  fx('idiom', 'है/हैं ना/न', 'isn\'t it? (a tag asking agreement)'),
  fx('idiom', 'हो सकता/सकती/सकते है/हैं', 'it may be, perhaps'),
  fx('idiom', 'ऐसा नहीं है/हैं', 'it is not so'),
  fx('idiom', 'पता नहीं', 'I don\'t know; who knows'),
  fx('idiom', 'क्या पता', 'who knows'),
  fx('idiom', 'क्यों नहीं', 'why not; of course'),
  fx('idiom', 'सच में', 'really, truly'),
  fx('idiom', 'सच कहूँ तो', 'to tell the truth'),
  fx('idiom', 'वैसे भी', 'anyway, in any case'),
  fx('idiom', 'दूसरी ओर', 'on the other hand'),
  fx('idiom', 'एक ओर', 'on the one hand'),
  fx('idiom', 'दूसरे शब्दों में', 'in other words'),
  fx('idiom', 'यानी कि', 'that is to say'),
  fx('idiom', 'जैसा कि', 'as'),
  fx('idiom', 'कम से कम', 'at least'),
  fx('idiom', 'ज़्यादा से ज़्यादा', 'at most'),
  fx('idiom', 'जल्दी से जल्दी', 'as soon as possible'),
  fx('idiom', 'जल्द से जल्द', 'as soon as possible'),
  fx('idiom', 'एक न एक दिन', 'sooner or later; one day or other'),
  fx('idiom', 'कभी न कभी', 'sometime or other'),
  fx('idiom', 'हर रोज़', 'every day'),
  fx('idiom', 'हर दिन', 'every day'),
  fx('idiom', 'हर बार', 'every time'),
  fx('idiom', 'हर कोई', 'everyone'),
  fx('idiom', 'एक बार', 'once'),
  fx('idiom', 'एक साथ', 'together, at once'),
  fx('idiom', 'एक दूसरे/दूसरी', 'each other'),
  fx('idiom', 'बार-बार', 'again and again'),
  fx('idiom', 'जान-बूझकर', 'on purpose, deliberately'),
  fx('idiom', 'अपने आप', 'by oneself, of its own accord'),
  fx('idiom', 'मन ही मन', 'inwardly, to oneself'),
  fx('idiom', 'दिन-रात', 'day and night'),
  fx('idiom', 'आगे चलकर', 'later on, in the future'),
  fx('idiom', 'शायद ही', 'hardly ever, hardly'),
  fx('idiom', 'कुछ भी नहीं', 'nothing at all'),
  fx('idiom', 'कुछ नहीं', 'nothing'),
  fx('idiom', 'कभी नहीं', 'never'),
  fx('idiom', 'कहीं नहीं', 'nowhere'),
  fx('idiom', 'कोई भी नहीं', 'no one at all'),
  fx('idiom', 'सब कुछ', 'everything'),
  fx('idiom', 'कुछ और', 'something else'),
  fx('idiom', 'बहुत कुछ', 'a great deal'),
  fx('idiom', 'थोड़ा/थोड़ी/थोड़े सा/सी/से', 'a little'),
  fx('idiom', 'ख़ास तौर पर', 'especially'),
  fx('idiom', 'इसी तरह', 'in the same way'),
  fx('frame', 'जैसे ही', 'as soon as'),
  fx('frame', 'जब तक', 'as long as; until'),
  fx('frame', 'जब भी', 'whenever'),
  fx('frame', 'इसलिए कि', 'because; so that'),
  fx('frame', 'उदाहरण के लिए', 'for example'),
];
