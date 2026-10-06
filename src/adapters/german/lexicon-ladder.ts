/**
 * Core lexicon, addition from the German ladder plan (data/ladder/de/PLAN.md, section 6 and the b1-bridge list): the 156
 * words of the plan's 1,024 new lemmas that the word list did not hold (marked † in the plan), the words the plan names as
 * missing or wrongly read (kaputt, fest, weh, leid, Meister, anstrengend …), and the first names, surnames and place names
 * of the plan's cast and of a Leipzig frame. Row formats are those of entries.ts.
 *
 * Why it matters: a noun or verb the list does not hold is read by rule, and its plural, its genitive and the participle of
 * the verb then become SEPARATE lemmas (Kurs / Kurse / Kurses, beachtet → beachen). A listed word has all its forms under
 * one lemma. A name the list does not hold is read as a common noun (Marta, Müller, Hannover) or not at all (Sam, Ben).
 *
 * Decisions, in the order of the plan's findings:
 *  - Feminine -in forms are their own lemma (Lehrerin, Ärztin, Erzieherin), as in the German dictionaries (Duden, DWDS);
 *    they are NOT folded into the masculine. Every such form has a reading: the listed rows, and for any other feminine
 *    form of a listed masculine noun a derived reading (morph-derived.ts) that also ties Xinnen to Xin.
 *  - A nominalised adjective (der Kranke, der Deutsche, ein Fremder) is the adjectival noun, its own lemma, as in the
 *    dictionaries (Kranke, Deutsche); its forms (Kranker, Kranken, Kranke …) all belong to that lemma.
 *  - Separable weh|tun and leid|tun are listed so that "tut weh" and "tut mir leid" are one lemma (wehtun, leidtun, both tokens),
 *    not tun + an unknown weh / the wrong leiden.
 *  - A word that is both a name and a noun (Koch, Bauer, Wolf, Berg, Bach, Keller) keeps the noun first; a name is
 *    preferred only after a title or a first name (context-words.ts).
 * Rows here never override a main row: a word the main lists hold with the same facts is skipped; a second gender
 * (die Leiter / der Leiter) is added beside it.
 * MACHINE-DRAFTED, NOT CHECKED BY A NATIVE SPEAKER.
 */
export const LADDER_ROWS = `
# NOUN
// ── home, daily life
Rucksack/m, -s, ¨-e = backpack; rucksack
Regenschirm/m, -s, -e = umbrella
Wäsche/f, -, 0 = laundry; washing
Picknick/n, -s, -s = picnic
Zahnbürste/f, -, -n = toothbrush
Zahnpasta/f, -, Zahnpasten = toothpaste
Brotdose/f, -, -n = lunch box
Schulweg/m, -es, -e = way to school
Pullover/m, -s, - = sweater; pullover
Leiter/f, -, -n = ladder
Pflaster/n, -s, - = sticking plaster; paving
Stock/m, -es, ¨-e = stick; floor, storey (im zweiten Stock)
Kindheit/f, -, 0 = childhood
Jugend/f, -, 0 = youth
Halle/f, -, -n = hall (large room)
Hochzeit/f, -, -en = wedding
Zutat/f, -, -en = ingredient
Spielplatz/m, -es, ¨-e = playground
Veränderung/f, -, -en = change
Blitz/m, -es, -e = flash of lightning
Donner/m, -s, - = thunder
Feierabend/m, -s, -e = end of the working day
Norden/m, -s, 0 = north
Süden/m, -s, 0 = south
Osten/m, -s, 0 = east
Westen/m, -s, 0 = west
Kilometer/m, -s, - = kilometre
Meter/m, -s, - = metre
Quadratmeter/m, -s, - = square metre
Million/f, -, -en = million
Währung/f, -, -en = currency
Erbe/n, -s, 0 = inheritance
Erbe/m, -n, -n = heir [weak]
Päckchen/n, -s, - = small parcel; packet
Landschaft/f, -, -en = landscape; scenery
Plastik/n, -s, 0 = plastic
Klima/n, -s, -s = climate
System/n, -s, -e = system
Pfand/n, -es, ¨-er = deposit (on bottles)
Mülltonne/f, -, -n = rubbish bin; wheelie bin
Mülltrennung/f, -, 0 = waste sorting
Treppenhaus/n, -es, ¨-er = stairwell; staircase
Hausordnung/f, -, -en = house rules
Regel/f, -, -n = rule
Liste/f, -, -n = list
Tagebuch/n, -es, ¨-er = diary
Schlüsselbund/m, -es, ¨-e = bunch of keys
Fundbüro/n, -s, -s = lost property office
// ── communication
Gruppe/f, -, -n = group
Link/m, -s, -s = link (internet)
Mail/f, -, -s = mail; e-mail
E-Mail/f, -, -s = e-mail
Email/f, -, -s = e-mail (spelling) [same: E-Mail]
Video/n, -s, -s = video
Blog/n, -s, -s = blog
Interview/n, -s, -s = interview
Durchsage/f, -, -n = announcement (over a loudspeaker)
Neuigkeit/f, -, -en = piece of news
Hinweis/m, -es, -e = hint; notice; piece of information
Ratschlag/m, -es, ¨-e = piece of advice
Auskunft/f, -, ¨-e = information; information desk
Protokoll/n, -s, -e = minutes; record
Flyer/m, -s, - = flyer; leaflet
Aktion/f, -, -en = campaign; action
Rundbrief/m, -es, -e = circular letter; newsletter
Wochenbericht/m, -es, -e = weekly report
// ── church, mission, community
Kollekte/f, -, -n = collection (in church)
Gesangbuch/n, -es, ¨-er = hymn book; songbook
Helfer/m, -s, - = helper
Ablauf/m, -es, ¨-e = order of events; course; procedure
Andacht/f, -, -en = short devotion; prayer service
Saal/m, -es, Säle = hall; large room
Gemeindehaus/n, -es, ¨-er = church hall; parish centre
Hauskreis/m, -es, -e = house group; small group
Jugendkreis/m, -es, -e = youth group
Trost/m, -es, 0 = comfort; consolation
Missionar/m, -s, -e = missionary
Mission/f, -, -en = mission
Theologie/f, -, -n = theology
Berufung/f, -, -en = calling; vocation
Spende/f, -, -n = donation
Gebetsanliegen/n, -s, - = prayer request
Zusammenarbeit/f, -, 0 = collaboration; cooperation
Unterstützung/f, -, -en = support
Dankbarkeit/f, -, 0 = gratitude
Herausforderung/f, -, -en = challenge
Vorbild/n, -es, -er = model; example
Versammlung/f, -, -en = meeting; assembly
Abstimmung/f, -, -en = vote
Tagesordnung/f, -, -en = agenda
Veranstaltung/f, -, -en = event
Vorbereitung/f, -, -en = preparation
Landeskirche/f, -, -n = regional church (Protestant)
Kirchensteuer/f, -, -n = church tax
Samariter/m, -s, - = Samaritan
Räuber/m, -s, - = robber
Herberge/f, -, -n = inn; hostel
Wirt/m, -es, -e = innkeeper; landlord
Gesetzeslehrer/m, -s, - = teacher of the law
Mitleid/n, -s, 0 = pity; compassion
// ── health
Kurs/m, -es, -e = course; class
Praxis/f, -, Praxen = doctor's practice; surgery
Krankenwagen/m, -s, - = ambulance
Spritze/f, -, -n = syringe; injection
Impfung/f, -, -en = vaccination
Zahnarzt/m, -es, ¨-e = dentist
Hausarzt/m, -es, ¨-e = family doctor; GP
Grippe/f, -, -n = flu
Besserung/f, -, 0 = recovery; improvement
Übelkeit/f, -, 0 = nausea
Durchfall/m, -s, ¨-e = diarrhoea
Notaufnahme/f, -, -n = emergency room
Symptom/n, -s, -e = symptom
Heimweh/n, -s, 0 = homesickness
Stress/m, -es, 0 = stress
// ── travel, work, offices, housing
Anschluss/m, -es, ¨-e = connection (train); line
Ersatz/m, -es, 0 = replacement; substitute
Werkstatt/f, -, ¨-en = workshop; garage
Reifen/m, -s, - = tyre
Mechaniker/m, -s, - = mechanic
Mechanikerin/f, -, Mechanikerinnen = mechanic (female)
Erzieher/m, -s, - = nursery teacher (male); educator
Erzieherin/f, -, Erzieherinnen = nursery teacher (female); educator
Abschied/m, -es, -e = parting; farewell
Abreise/f, -, -n = departure
Heimreise/f, -, -n = journey home
Unterkunft/f, -, ¨-e = accommodation
Gastfamilie/f, -, -n = host family
Gastfreundschaft/f, -, 0 = hospitality
Begegnung/f, -, -en = encounter; meeting
Visum/n, -s, Visa = visa
Gebühr/f, -, -en = fee
Öffnungszeit/f, -, -en = opening hours (one period)
Bescheinigung/f, -, -en = certificate; confirmation
Wohnsitz/m, -es, -e = place of residence
Erlaubnis/f, -, -se = permission
Kaution/f, -, -en = deposit (on a flat)
Nebenkosten/pl = additional costs; running costs
Baustelle/f, -, -n = building site; roadworks
Schicht/f, -, -en = shift (at work); layer
Pflege/f, -, 0 = care; nursing
Nachtdienst/m, -es, -e = night duty; night shift
Kredit/m, -es, -e = loan; credit
Verständnis/n, -ses, -se = understanding
// ── people, the story and the fairy-tale shelf (the b1-bridge)
Meister/m, -s, - = master; champion; master craftsman
Prinz/m, -en, -en = prince [weak]
Prinzessin/f, -, Prinzessinnen = princess
Ritter/m, -s, - = knight
Riese/m, -n, -n = giant [weak]
Zwerg/m, -es, -e = dwarf
Hexe/f, -, -n = witch
Höhle/f, -, -n = cave
Drache/m, -n, -n = dragon [weak]
Ente/f, -, -n = duck
Papagei/m, -s, -en = parrot
Schmetterling/m, -s, -e = butterfly
Kita/f, -, -s = day-care centre (Kindertagesstätte)
Bürgeramt/n, -es, ¨-er = citizens' office; registration office
U-Bahn/f, -, -en = underground; metro
S-Bahn/f, -, -en = suburban train
T-Shirt/n, -s, -s = T-shirt
// places that take an article (an die Ostsee, die Türkei): common nouns for the noun phrase, as the dictionaries print them
Ostsee/f, -, 0 = the Baltic Sea
Nordsee/f, -, 0 = the North Sea
Elbe/f, -, 0 = the Elbe (river)
Donau/f, -, 0 = the Danube
Oder/f, -, 0 = the Oder (river)
Spree/f, -, 0 = the Spree (river)
Mosel/f, -, 0 = the Moselle (river)
Türkei/f, -, 0 = Turkey

# VERB
beruhigen = to calm; to soothe
zu|sagen = to accept (an invitation); to promise
kämmen = to comb
impfen = to vaccinate
aus|tauschen = to exchange; to swap
vermissen = to miss
sich gewöhnen = to get used to [reflexive]
möblieren = to furnish
verabreden = to arrange; to agree on
sich verabreden = to arrange to meet [reflexive]
überqueren = to cross
ab|stellen = to put down; to park; to turn off
lüften = to air; to ventilate
beachten = to notice; to observe; to pay attention to
ab|stimmen = to vote; to coordinate
organisieren = to organise
drucken = to print
aus|rauben = to rob
pflegen = to care for; to look after
beeindrucken = to impress
zurück|zahlen = to pay back
prägen = to shape; to coin; to mint
klettern = to climb | sein
basteln = to do handicrafts; to make things
weh|tun = to hurt; to be sore | tut, tat, getan [irregular]
leid|tun = to be sorry (es tut mir leid) | tut, tat, getan [irregular]

# ADJ
kaputt = broken; worn out
fest = firm; solid; fixed | fester, festest
weh = sore; painful [indeclinable]
leid = sorry [indeclinable]
anstrengend = tiring; strenuous
blond = blond
einsam = lonely; solitary
verantwortlich = responsible
ansteckend = contagious; infectious

# ADV
ungern = unwillingly; reluctantly

# PROPN
// first names (a few that are also German words are fine: a name is read only with a capital)
Sam = Sam (name)
Ben = Ben (name)
Tim = Tim (name)
Jan = Jan (name)
Tom = Tom (name)
Ute = Ute (name)
Marta = Marta (name)
Martha = Martha (name)
Elena = Elena (name)
Katharina = Katharina (name)
Markus = Markus (name)
Julia = Julia (name)
Mehmet = Mehmet (name)
Stefan = Stefan (name)
Petra = Petra (name)
Hannah = Hannah (name)
Felix = Felix (name)
Lisa = Lisa (name)
Karin = Karin (name)
Sophie = Sophie (name)
Emma = Emma (name)
Leon = Leon (name)
Nico = Nico (name)
Karla = Karla (name)
Sarah = Sarah (name)
Sara = Sara (name)
Esther = Esther (name)
Lydia = Lydia (name)
Simon = Simon (name)
Tobias = Tobias (name)
Jörg = Jörg (name)
Heike = Heike (name)
Frank = Frank (name)
Ingrid = Ingrid (name)
Gerhard = Gerhard (name)
Jens = Jens (name)
Uwe = Uwe (name)
Dirk = Dirk (name)
Wolfgang = Wolfgang (name)
Jürgen = Jürgen (name)
Matthias = Matthias (name)
Sebastian = Sebastian (name)
Florian = Florian (name)
Philipp = Philipp (name)
Fabian = Fabian (name)
Moritz = Moritz (name)
Niklas = Niklas (name)
Elias = Elias (name)
Noah = Noah (name)
Finn = Finn (name)
Miriam = Miriam (name)
Rebekka = Rebekka (name)
Rahel = Rahel (name)
Lea = Lea (name)
Susanne = Susanne (name)
Monika = Monika (name)
Andrea = Andrea (name)
Claudia = Claudia (name)
Anja = Anja (name)
Nina = Nina (name)
Laura = Laura (name)
Clara = Clara (name)
Johanna = Johanna (name)
Mia = Mia (name)
Lara = Lara (name)
Marie = Marie (name)
Charlotte = Charlotte (name)
Elisabeth = Elisabeth (name)
Matthäus = Matthew (biblical personal name)
Timotheus = Timothy (biblical personal name)
Lazarus = Lazarus (biblical personal name)
Mose = Moses (biblical personal name)
Moses = Moses (biblical personal name)
Josua = Joshua (biblical personal name)
Elia = Elijah (biblical personal name)
Jesaja = Isaiah (biblical personal name)
// surnames
Müller = Müller (surname)
Fischer = Fischer (surname)
Meyer = Meyer (surname)
Meier = Meier (surname)
Maier = Maier (surname)
Wagner = Wagner (surname)
Becker = Becker (surname)
Schulz = Schulz (surname)
Hoffmann = Hoffmann (surname)
Hofmann = Hofmann (surname)
Schneider = Schneider (surname)
Koch = Koch (surname)
Bauer = Bauer (surname)
Richter = Richter (surname)
Klein = Klein (surname)
Wolf = Wolf (surname)
Neumann = Neumann (surname)
Braun = Braun (surname)
Zimmermann = Zimmermann (surname)
Hartmann = Hartmann (surname)
Schäfer = Schäfer (surname)
Schröder = Schröder (surname)
Lehmann = Lehmann (surname)
Krüger = Krüger (surname)
Schmitt = Schmitt (surname)
Schmid = Schmid (surname)
Werner = Werner (surname)
Krause = Krause (surname)
Huber = Huber (surname)
Bach = Bach (surname)
Berg = Berg (surname)
// places
Hannover = Hanover (city)
Bremen = Bremen (city)
Erfurt = Erfurt (city)
Halle = Halle (city)
Jena = Jena (city)
Nürnberg = Nuremberg
Freiburg = Freiburg (city)
Magdeburg = Magdeburg (city)
Chemnitz = Chemnitz (city)
Potsdam = Potsdam (city)
Rostock = Rostock (city)
Kiel = Kiel (city)
Mainz = Mainz (city)
Düsseldorf = Düsseldorf (city)
Dortmund = Dortmund (city)
Heidelberg = Heidelberg (city)
Augsburg = Augsburg (city)
Regensburg = Regensburg (city)
Weimar = Weimar (city)
Wittenberg = Wittenberg (city)
Salzburg = Salzburg (city)
Bern = Bern (city)
Basel = Basel (city)
Graz = Graz (city)
Linz = Linz (city)
Innsbruck = Innsbruck (city)
Brandenburg = Brandenburg (state)
Thüringen = Thuringia
Hessen = Hesse
Niedersachsen = Lower Saxony
Amerika = America
Texas = Texas
England = England
Frankreich = France
Italien = Italy
Spanien = Spain
Polen = Poland
Russland = Russia
Israel = Israel
Jerusalem = Jerusalem
Bethlehem = Bethlehem
Nazareth = Nazareth
Ägypten = Egypt
Asien = Asia
Afrika = Africa
// towns and countries a text of the ladder names (read as nouns before: Meißen → Meiß / Meiße, Dänemark → a noun the list lacks)
Meißen = Meissen (city)
Naumburg = Naumburg (city)
Bamberg = Bamberg (city)
Würzburg = Würzburg (city)
Görlitz = Görlitz (city)
Bautzen = Bautzen (city)
Quedlinburg = Quedlinburg (city)
Zwickau = Zwickau (city)
Plauen = Plauen (city)
Gera = Gera (city)
Eisenach = Eisenach (city)
Gotha = Gotha (city)
Mühlhausen = Mühlhausen (city)
Stralsund = Stralsund (city)
Greifswald = Greifswald (city)
Lübeck = Lübeck (city)
Schwerin = Schwerin (city)
Wismar = Wismar (city)
Trier = Trier (city)
Koblenz = Koblenz (city)
Passau = Passau (city)
Ulm = Ulm (city)
Tübingen = Tübingen (city)
Konstanz = Konstanz (city)
Karlsruhe = Karlsruhe (city)
Mannheim = Mannheim (city)
Darmstadt = Darmstadt (city)
Kassel = Kassel (city)
Göttingen = Göttingen (city)
Münster = Münster (city)
Bielefeld = Bielefeld (city)
Paderborn = Paderborn (city)
Osnabrück = Osnabrück (city)
Oldenburg = Oldenburg (city)
Hildesheim = Hildesheim (city)
Braunschweig = Braunschweig (city)
Wolfsburg = Wolfsburg (city)
Saarbrücken = Saarbrücken (city)
Bremerhaven = Bremerhaven (city)
Wiesbaden = Wiesbaden (city)
Aachen = Aachen (city)
Duisburg = Duisburg (city)
Bochum = Bochum (city)
Gelsenkirchen = Gelsenkirchen (city)
Leverkusen = Leverkusen (city)
Pforzheim = Pforzheim (city)
Reutlingen = Reutlingen (city)
Ingolstadt = Ingolstadt (city)
Fulda = Fulda (city)
Marburg = Marburg (city)
Gießen = Giessen (city)
Coburg = Coburg (city)
Bayreuth = Bayreuth (city)
Meiningen = Meiningen (city)
Altenburg = Altenburg (city)
Pirna = Pirna (city)
Freiberg = Freiberg (city)
Zittau = Zittau (city)
Cottbus = Cottbus (city)
Dänemark = Denmark
Schweden = Sweden
Norwegen = Norway
Finnland = Finland
Holland = Holland
Belgien = Belgium
Griechenland = Greece
Ungarn = Hungary
Tschechien = the Czech Republic
Rumänien = Romania
Bulgarien = Bulgaria
Kroatien = Croatia
Serbien = Serbia
Portugal = Portugal
Irland = Ireland
Schottland = Scotland
Japan = Japan
China = China
Indien = India
Brasilien = Brazil
Kanada = Canada
Mexiko = Mexico
Syrien = Syria
Iran = Iran
Irak = Iraq
Afghanistan = Afghanistan
Eritrea = Eritrea
Kenia = Kenya
Ghana = Ghana
Nigeria = Nigeria
Südafrika = South Africa
Australien = Australia
Korea = Korea
Vietnam = Vietnam
Luxemburg = Luxembourg
Litauen = Lithuania
Lettland = Latvia
Estland = Estonia
Slowakei = Slovakia
Slowenien = Slovenia
Albanien = Albania
Westfalen = Westphalia
Tirol = Tyrol
Kärnten = Carinthia
Mecklenburg = Mecklenburg
Pommern = Pomerania

# NOUN
// the second pass over the ladder (adapter-de@8)
Rad/n, -es, ¨-er = wheel; bicycle (Rad fahren)
Tor/n, -es, -e = gate; goal

# VERB
behüten = to protect; to guard (Gott behüte dich)
hüten = to look after; to guard; to mind
drehen = to turn; to rotate
dazu|legen = to add (to put with)
zusammen|brechen = to collapse; to break down | bricht, brach, gebrochen, sein
zusammen|halten = to stick together; to hold together | hält, hielt, gehalten

# ADJ
nächst = next; nearest (nächste Woche, der nächste Zug)
kompliziert = complicated
dicht = dense; thick; tight; close | dichter, dichtest
unverändert = unchanged
streng = strict; severe
vorsichtig = careful; cautious
deutlich = clear; distinct
klar = clear; obvious
fair = fair
nervös = nervous
großzügig = generous
verständlich = understandable; comprehensible
gültig = valid
niedrig = low
selbstständig = independent; self-employed
selbständig = independent; self-employed
riesig = huge; enormous
sprachlos = speechless
gleichzeitig = simultaneous; at the same time
gütig = kind; gracious
vernünftig = sensible; reasonable
sorgfältig = careful; thorough
ungewöhnlich = unusual
abhängig = dependent
egal = all the same; not important [indeclinable]
oft = often | öfter, öftest

# ADV
ohnehin = anyway; in any case
zugleich = at the same time
drin = inside; in it
los = off; going on (was ist los?)
jederzeit = at any time
beieinander = together; next to one another
längst = long ago; for a long time
nachmittags = in the afternoon; afternoons
erstens = firstly
zweitens = secondly
drittens = thirdly
viertens = fourthly
fünftens = fifthly

# DET
paar = a few; a couple of (ein paar)
`;
