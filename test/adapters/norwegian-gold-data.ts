/**
 * Gold sentences for the Norwegian analyzer. MACHINE-DRAFTED, pending native review: the sentences and the expected lemma and
 * part of speech were written by the model that built the analyzer (a development set: the analyzer's lexicon was written by the
 * same author, so the measured accuracy on it is optimistic; the independent holdout is a separate package). No native speaker has
 * checked either the sentences or the annotations.
 *
 * Notation: `surface=lemma/POS` annotates one word (a lemma with a space is written with `_`: stå_opp). Words without an
 * annotation are not scored. Punctuation stays attached. The text of the sentence is the line with the annotations stripped.
 * Conventions: ikke, aldri are ADV; ha is AUX before a participle and VERB otherwise; bli is AUX before a participle and VERB
 * otherwise; være is AUX; the pieces of a particle verb carry the unit's lemma (verb VERB, particle ADV).
 */
export interface GoldSentence { id: string; kind: string; line: string }

export const NB_GOLD: GoldSentence[] = [
  // ── daily life ──
  { id: 'nb01', kind: 'daily', line: 'Jeg=jeg/PRON bor=bo/VERB i Oslo=Oslo/PROPN.' },
  { id: 'nb02', kind: 'daily', line: 'Vi=vi/PRON spiser=spise/VERB frokost=frokost/NOUN klokka=klokke/NOUN sju=sju/NUM.' },
  { id: 'nb03', kind: 'daily', line: 'Hun=hun/PRON drikker=drikke/VERB kaffe=kaffe/NOUN hver=hver/DET dag=dag/NOUN.' },
  { id: 'nb04', kind: 'daily', line: 'Barna=barn/NOUN leker=leke/VERB i hagen=hage/NOUN.' },
  { id: 'nb05', kind: 'daily', line: 'Mora=mor/NOUN mi=min/DET lager=lage/VERB middag=middag/NOUN.' },
  { id: 'nb06', kind: 'daily', line: 'Faren=far/NOUN min=min/DET jobber=jobbe/VERB på kontoret=kontor/NOUN.' },
  { id: 'nb07', kind: 'daily', line: 'Etter skolen=skole/NOUN går=gå/VERB jeg=jeg/PRON hjem=hjem/ADV.' },
  { id: 'nb08', kind: 'daily', line: 'Det=det/PRON regner=regne/VERB i dag=dag/NOUN.' },
  { id: 'nb09', kind: 'daily', line: 'Bussen=buss/NOUN kommer=komme/VERB snart=snart/ADV.' },
  { id: 'nb10', kind: 'daily', line: 'Vi=vi/PRON kjøper=kjøpe/VERB brød=brød/NOUN og melk=melk/NOUN i butikken=butikk/NOUN.' },
  { id: 'nb11', kind: 'daily', line: 'Ola=Ola/PROPN og Kari=Kari/PROPN reiser=reise/VERB til Bergen=Bergen/PROPN.' },
  { id: 'nb12', kind: 'daily', line: 'Telefonen=telefon/NOUN ligger=ligge/VERB på bordet=bord/NOUN.' },
  // ── both feminine paradigms ──
  { id: 'nb13', kind: 'fem', line: 'Jeg=jeg/PRON leser=lese/VERB boka=bok/NOUN hver=hver/DET kveld=kveld/NOUN.' },
  { id: 'nb14', kind: 'fem', line: 'Jeg=jeg/PRON leser=lese/VERB boken=bok/NOUN hver=hver/DET kveld=kveld/NOUN.' },
  { id: 'nb15', kind: 'fem', line: 'Jenta=jente/NOUN går=gå/VERB på skolen=skole/NOUN.' },
  { id: 'nb16', kind: 'fem', line: 'Jenten=jente/NOUN har=ha/AUX mistet=miste/VERB nøkkelen=nøkkel/NOUN.' },
  { id: 'nb17', kind: 'fem', line: 'Han=han/PRON kastet=kaste/VERB ballen=ball/NOUN over huset=hus/NOUN.' },
  { id: 'nb18', kind: 'fem', line: 'Han=han/PRON kasta=kaste/VERB ballen=ball/NOUN til hunden=hund/NOUN.' },
  { id: 'nb19', kind: 'fem', line: 'Husene=hus/NOUN er=være/AUX gamle=gammel/ADJ.' },
  { id: 'nb20', kind: 'fem', line: 'Husa=hus/NOUN er=være/AUX gamle=gammel/ADJ.' },
  // ── adjectives ──
  { id: 'nb21', kind: 'adjective', line: 'Det=det/DET store=stor/ADJ huset=hus/NOUN er=være/AUX gammelt=gammel/ADJ.' },
  { id: 'nb22', kind: 'adjective', line: 'Den=den/DET gamle=gammel/ADJ mannen=mann/NOUN er=være/AUX snill=snill/ADJ.' },
  { id: 'nb23', kind: 'adjective', line: 'Vi=vi/PRON bor=bo/VERB i et=en/DET lite=liten/ADJ hus=hus/NOUN.' },
  { id: 'nb24', kind: 'adjective', line: 'De=de/DET små=liten/ADJ barna=barn/NOUN sover=sove/VERB.' },
  { id: 'nb25', kind: 'adjective', line: 'Bilen=bil/NOUN er=være/AUX ny=ny/ADJ, men=men/CONJ huset=hus/NOUN er=være/AUX nytt=ny/ADJ.' },
  { id: 'nb26', kind: 'adjective', line: 'Kaffen=kaffe/NOUN er=være/AUX varm=varm/ADJ.' },
  { id: 'nb27', kind: 'adjective', line: 'Dette=dette/PRON er=være/AUX viktig=viktig/ADJ.' },
  { id: 'nb28', kind: 'comparison', line: 'Bergen=Bergen/PROPN er=være/AUX større=stor/ADJ enn Stavanger=Stavanger/PROPN.' },
  { id: 'nb29', kind: 'comparison', line: 'Hun=hun/PRON er=være/AUX eldre=gammel/ADJ enn=enn/SCONJ meg=jeg/PRON.' },
  { id: 'nb30', kind: 'comparison', line: 'Dette=dette/PRON er=være/AUX den=den/DET beste=god/ADJ boka=bok/NOUN.' },
  // ── pronouns and possessives ──
  { id: 'nb31', kind: 'possessive', line: 'Hun=hun/PRON tok=ta/VERB bilen=bil/NOUN sin=sin/DET.' },
  { id: 'nb32', kind: 'possessive', line: 'Han=han/PRON besøkte=besøke/VERB vennen=venn/NOUN sin=sin/DET.' },
  { id: 'nb33', kind: 'possessive', line: 'Min=min/DET bror=bror/NOUN bor=bo/VERB i Trondheim=Trondheim/PROPN.' },
  { id: 'nb34', kind: 'possessive', line: 'Vi=vi/PRON elsker=elske/VERB foreldrene=foreldre/NOUN våre=vår/DET.' },
  { id: 'nb35', kind: 'pronoun', line: 'Kan=kunne/AUX du=du/PRON hjelpe=hjelpe/VERB meg=jeg/PRON?' },
  // ── questions ──
  { id: 'nb36', kind: 'question', line: 'Hva=hva/PRON heter=hete/VERB du=du/PRON?' },
  { id: 'nb37', kind: 'question', line: 'Hvor=hvor/ADV bor=bo/VERB dere=dere/PRON?' },
  { id: 'nb38', kind: 'question', line: 'Kommer=komme/VERB du=du/PRON i morgen=morgen/NOUN?' },
  { id: 'nb39', kind: 'question', line: 'Hvorfor=hvorfor/ADV kommer=komme/VERB han=han/PRON ikke=ikke/ADV?' },
  { id: 'nb40', kind: 'question', line: 'Når=når/ADV åpner=åpne/VERB butikken=butikk/NOUN?' },
  // ── subordinate clauses ──
  { id: 'nb41', kind: 'subordinate', line: 'Jeg=jeg/PRON vet=vite/VERB at=at/SCONJ han=han/PRON ikke=ikke/ADV kommer=komme/VERB.' },
  { id: 'nb42', kind: 'subordinate', line: 'Hun=hun/PRON er=være/AUX trøtt=trøtt/ADJ fordi=fordi/SCONJ hun=hun/PRON ikke=ikke/ADV har=ha/AUX sovet=sove/VERB.' },
  { id: 'nb43', kind: 'subordinate', line: 'Når=når/SCONJ jeg=jeg/PRON er=være/AUX trøtt=trøtt/ADJ, sover=sove/VERB jeg=jeg/PRON.' },
  { id: 'nb44', kind: 'subordinate', line: 'Da=da/SCONJ jeg=jeg/PRON var=være/AUX liten=liten/ADJ, bodde=bo/VERB vi=vi/PRON i Bergen=Bergen/PROPN.' },
  { id: 'nb45', kind: 'subordinate', line: 'Hvis=hvis/SCONJ det=det/PRON regner=regne/VERB, blir=bli/VERB vi=vi/PRON hjemme=hjemme/ADV.' },
  // ── perfect, modal, passive, infinitive ──
  { id: 'nb46', kind: 'perfect', line: 'Jeg=jeg/PRON har=ha/AUX spist=spise/VERB frokost=frokost/NOUN.' },
  { id: 'nb47', kind: 'perfect', line: 'De=de/PRON hadde=ha/AUX bodd=bo/VERB der=der/ADV i ti=ti/NUM år=år/NOUN.' },
  { id: 'nb48', kind: 'modal', line: 'Jeg=jeg/PRON må=måtte/AUX gå=gå/VERB nå=nå/ADV.' },
  { id: 'nb49', kind: 'modal', line: 'Hun=hun/PRON vil=ville/AUX lære=lære/VERB norsk=norsk/NOUN.' },
  { id: 'nb50', kind: 'infinitive', line: 'Jeg=jeg/PRON liker=like/VERB å lese=lese/VERB.' },
  { id: 'nb51', kind: 'infinitive', line: 'Det=det/PRON er=være/AUX viktig=viktig/ADJ å hvile=hvile/VERB.' },
  { id: 'nb52', kind: 'passive', line: 'Boka=bok/NOUN leses=lese/VERB av mange=mange/PRON.' },
  { id: 'nb53', kind: 'passive', line: 'Huset=hus/NOUN ble=bli/AUX bygd=bygge/VERB i 1950.' },
  // ── particle verbs ──
  { id: 'nb54', kind: 'particle', line: 'Jeg=jeg/PRON står=stå_opp/VERB opp=stå_opp/ADV klokka=klokke/NOUN sju=sju/NUM.' },
  { id: 'nb55', kind: 'particle', line: 'Han=han/PRON slår=slå_på/VERB den=den/PRON på=slå_på/ADV.' },
  { id: 'nb56', kind: 'particle', line: 'Hun=hun/PRON tok=ta_på_seg/VERB på=ta_på_seg/ADV seg=ta_på_seg/PRON jakken=jakke/NOUN.' },
  { id: 'nb57', kind: 'particle', line: 'Vi=vi/PRON må=måtte/AUX finne=finne_ut/VERB ut=finne_ut/ADV hva=hva/PRON som skjedde.' },
  { id: 'nb58', kind: 'particle', line: 'Han=han/PRON kommer=komme_tilbake/VERB tilbake=komme_tilbake/ADV i morgen=morgen/NOUN.' },
  // ── compounds ──
  { id: 'nb59', kind: 'compound', line: 'Bilnøkkelen=bilnøkkel/NOUN ligger=ligge/VERB på kjøkkenbordet=kjøkkenbord/NOUN.' },
  { id: 'nb60', kind: 'compound', line: 'Barnehagen=barnehage/NOUN åpner=åpne/VERB klokka=klokke/NOUN åtte=åtte/NUM.' },
  { id: 'nb61', kind: 'compound', line: 'Hun=hun/PRON jobber=jobbe/VERB på sykehuset=sykehus/NOUN.' },
  { id: 'nb62', kind: 'compound', line: 'Fotballkampen=fotballkamp/NOUN begynner=begynne/VERB snart=snart/ADV.' },
  // ── testimony and Bible-style ──
  { id: 'nb63', kind: 'testimony', line: 'Jeg=jeg/PRON tror=tro/VERB på Gud=Gud/PROPN.' },
  { id: 'nb64', kind: 'testimony', line: 'Gud=Gud/PROPN har=ha/AUX hjulpet=hjelpe/VERB meg=jeg/PRON i vanskelige=vanskelig/ADJ tider=tid/NOUN.' },
  { id: 'nb65', kind: 'testimony', line: 'Jeg=jeg/PRON ba=be/VERB og Gud=Gud/PROPN svarte=svare/VERB på bønnen=bønn/NOUN min=min/DET.' },
  { id: 'nb66', kind: 'testimony', line: 'Han=han/PRON tilga=tilgi/VERB meg=jeg/PRON mine=min/DET synder=synd/NOUN.' },
  { id: 'nb67', kind: 'bible', line: 'Gud=Gud/PROPN er=være/AUX kjærlighet=kjærlighet/NOUN.' },
  { id: 'nb68', kind: 'bible', line: 'Så=så/ADV høyt=høy/ADJ elsket=elske/VERB Gud=Gud/PROPN verden=verden/NOUN.' },
  { id: 'nb69', kind: 'bible', line: 'Herren=Herren/PROPN er=være/AUX min=min/DET hyrde=hyrde/NOUN.' },
  { id: 'nb70', kind: 'bible', line: 'I begynnelsen=begynnelse/NOUN skapte=skape/VERB Gud=Gud/PROPN himmelen=himmel/NOUN og jorden=jord/NOUN.' },
  // ── historical spellings (the modern lemma is credited) ──
  { id: 'nb71', kind: 'historical', line: 'Han=han/PRON gik=gå/VERB efter=etter/ADP veien=vei/NOUN.' },
  { id: 'nb72', kind: 'historical', line: 'Nu=nå/ADV er=være/AUX sneen=snø/NOUN borte=borte/ADV.' },
  { id: 'nb73', kind: 'historical', line: 'Hvad=hva/PRON siger=si/VERB du=du/PRON?' },
  { id: 'nb74', kind: 'historical', line: 'Jeg=jeg/PRON gaar=gå/VERB paa=på/ADP gaden=gate/NOUN.' },
];

export const NN_GOLD: GoldSentence[] = [
  { id: 'nn01', kind: 'daily', line: 'Eg=eg/PRON bur=bu/VERB i Bergen=Bergen/PROPN.' },
  { id: 'nn02', kind: 'daily', line: 'Ho=ho/PRON les=lese/VERB boka=bok/NOUN.' },
  { id: 'nn03', kind: 'daily', line: 'Vi=vi/PRON et=ete/VERB middag=middag/NOUN klokka=klokke/NOUN seks=seks/NUM.' },
  { id: 'nn04', kind: 'daily', line: 'Dei=dei/PRON går=gå/VERB til skulen=skule/NOUN.' },
  { id: 'nn05', kind: 'daily', line: 'Guten=gut/NOUN kastar=kaste/VERB ballen=ball/NOUN.' },
  { id: 'nn06', kind: 'daily', line: 'Ho=ho/PRON kasta=kaste/VERB steinen=stein/NOUN i vatnet=vatn/NOUN.' },
  { id: 'nn07', kind: 'daily', line: 'Mor=mor/NOUN lagar=lage/VERB mat=mat/NOUN.' },
  { id: 'nn08', kind: 'daily', line: 'Vêret=vêr/NOUN er=vere/AUX fint=fin/ADJ i dag=dag/NOUN.' },
  { id: 'nn09', kind: 'adjective', line: 'Det=det/DET gamle=gammal/ADJ huset=hus/NOUN er=vere/AUX stort=stor/ADJ.' },
  { id: 'nn10', kind: 'adjective', line: 'Dei=dei/DET små=liten/ADJ borna=barn/NOUN søv=sove/VERB.' },
  { id: 'nn11', kind: 'question', line: 'Kva=kva/PRON heiter=heite/VERB du=du/PRON?' },
  { id: 'nn12', kind: 'question', line: 'Kvifor=kvifor/ADV kjem=kome/VERB han=han/PRON ikkje=ikkje/ADV?' },
  { id: 'nn13', kind: 'question', line: 'Kven=kven/PRON bur=bu/VERB der=der/ADV?' },
  { id: 'nn14', kind: 'subordinate', line: 'Eg=eg/PRON veit=vite/VERB at=at/SCONJ ho=ho/PRON ikkje=ikkje/ADV kjem=kome/VERB.' },
  { id: 'nn15', kind: 'subordinate', line: 'Når=når/SCONJ eg=eg/PRON er=vere/AUX trøytt=trøytt/ADJ, søv=sove/VERB eg=eg/PRON.' },
  { id: 'nn16', kind: 'perfect', line: 'Eg=eg/PRON har=ha/AUX kjøpt=kjøpe/VERB brød=brød/NOUN.' },
  { id: 'nn17', kind: 'modal', line: 'Du=du/PRON må=måtte/AUX hjelpe=hjelpe/VERB meg=eg/PRON.' },
  { id: 'nn18', kind: 'infinitive', line: 'Eg=eg/PRON likar=like/VERB å synge=syngje/VERB.' },
  { id: 'nn19', kind: 'testimony', line: 'Eg=eg/PRON trur=tru/VERB på Gud=Gud/PROPN.' },
  { id: 'nn20', kind: 'testimony', line: 'Han=han/PRON gav=gje/VERB meg=eg/PRON von=von/NOUN.' },
  { id: 'nn21', kind: 'bible', line: 'Gud=Gud/PROPN er=vere/AUX kjærleik=kjærleik/NOUN.' },
  { id: 'nn22', kind: 'particle', line: 'Eg=eg/PRON står=stå_opp/VERB opp=stå_opp/ADV tidleg=tidleg/ADV.' },
  { id: 'nn23', kind: 'daily', line: 'Veka=veke/NOUN har=ha/VERB sju=sju/NUM dagar=dag/NOUN.' },
  { id: 'nn24', kind: 'daily', line: 'Barnet=barn/NOUN søv=sove/VERB i senga=seng/NOUN.' },
];

/**
 * A second set, written AFTER the analyzer's lexicon and rules were fixed on the first, and scored before any change was made for it
 * (see the report of the build): the nearest this package comes to an unseen test. Still written by the same model, so still
 * optimistic, and still machine-drafted, pending native review.
 */
export const NB_FRESH: GoldSentence[] = [
  { id: 'fr01', kind: 'daily', line: 'Søsteren=søster/NOUN min=min/DET studerer=studere/VERB medisin=medisin/NOUN i Tromsø=Tromsø/PROPN.' },
  { id: 'fr02', kind: 'daily', line: 'Etter=etter/ADP middagen=middag/NOUN vasker=vaske_opp/VERB vi=vi/PRON opp=vaske_opp/ADV.' },
  { id: 'fr03', kind: 'daily', line: 'Han=han/PRON glemte=glemme/VERB paraplyen=paraply/NOUN på bussen=buss/NOUN.' },
  { id: 'fr04', kind: 'daily', line: 'Vi=vi/PRON må=måtte/AUX kjøpe=kjøpe/VERB melk=melk/NOUN og egg=egg/NOUN.' },
  { id: 'fr05', kind: 'daily', line: 'Barnebarnet=barnebarn/NOUN mitt=min/DET er=være/AUX fem=fem/NUM år=år/NOUN gammelt=gammel/ADJ.' },
  { id: 'fr06', kind: 'daily', line: 'Det=det/PRON snør=snø/VERB mye=mye/ADV i dag=dag/NOUN.' },
  { id: 'fr07', kind: 'daily', line: 'Lærerne=lærer/NOUN gir=gi/VERB oss=vi/PRON mange=mange/DET lekser=lekse/NOUN.' },
  { id: 'fr08', kind: 'daily', line: 'Hunden=hund/NOUN sover=sove/VERB under=under/ADP bordet=bord/NOUN.' },
  { id: 'fr09', kind: 'question', line: 'Hvor=hvor/ADV gammel=gammel/ADJ er=være/AUX datteren=datter/NOUN din=din/DET?' },
  { id: 'fr10', kind: 'question', line: 'Har=ha/AUX du=du/PRON spist=spise/VERB middag=middag/NOUN?' },
  { id: 'fr11', kind: 'question', line: 'Hvem=hvem/PRON har=ha/VERB nøkkelen=nøkkel/NOUN?' },
  { id: 'fr12', kind: 'subordinate', line: 'Jeg=jeg/PRON tror=tro/VERB at=at/SCONJ været=vær/NOUN blir=bli/VERB bedre=god/ADJ.' },
  { id: 'fr13', kind: 'subordinate', line: 'Hun=hun/PRON smilte=smile/VERB da=da/SCONJ han=han/PRON kom=komme_inn/VERB inn=komme_inn/ADV.' },
  { id: 'fr14', kind: 'particle', line: 'Vi=vi/PRON skriver=skrive_ned/VERB ordene=ord/NOUN ned=skrive_ned/ADV.' },
  { id: 'fr15', kind: 'particle', line: 'Hun=hun/PRON har=ha/AUX gitt=gi_opp/VERB opp=gi_opp/ADV.' },
  { id: 'fr16', kind: 'compound', line: 'Skolebussen=skolebuss/NOUN går=gå/VERB klokka=klokke/NOUN sju=sju/NUM.' },
  { id: 'fr17', kind: 'compound', line: 'Vi=vi/PRON spiser=spise/VERB frokost=frokost/NOUN på kjøkkenet=kjøkken/NOUN.' },
  { id: 'fr18', kind: 'testimony', line: 'Jeg=jeg/PRON takker=takke/VERB Gud=Gud/PROPN for=for/ADP hjelpen=hjelp/NOUN.' },
  { id: 'fr19', kind: 'testimony', line: 'Min=min/DET tro=tro/NOUN har=ha/AUX vokst=vokse/VERB i år=år/NOUN.' },
  { id: 'fr20', kind: 'testimony', line: 'Menigheten=menighet/NOUN ba=be/VERB for=for/ADP meg=jeg/PRON.' },
  { id: 'fr21', kind: 'bible', line: 'Herren=Herren/PROPN er=være/AUX nær=nær/ADJ alle=alle/PRON som kaller på ham.' },
  { id: 'fr22', kind: 'bible', line: 'Elsk=elske/VERB din=din/DET neste=neste/ADJ som deg=du/PRON selv.' },
  { id: 'fr23', kind: 'adjective', line: 'Maten=mat/NOUN er=være/AUX god=god/ADJ, men=men/CONJ suppa=suppe/NOUN er=være/AUX kald=kald/ADJ.' },
  { id: 'fr24', kind: 'adjective', line: 'De=de/DET nye=ny/ADJ bøkene=bok/NOUN ligger=ligge/VERB der=der/ADV.' },
  { id: 'fr25', kind: 'historical', line: 'Hun=hun/PRON saa=se/VERB paa=på/ADP Bogen=bok/NOUN.' },
];
