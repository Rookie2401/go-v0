// Which everyday words does the word list not hold at all? (lists written by the auditor: common words every A1–B1 learner meets)
import { lexiconFor } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/norwegian/lexicon';
const NB = `
altså nemlig selvfølgelig naturligvis absolutt deretter derimot vekk unna videre fremover framover stadig særlig vanligvis tydeligvis trolig antakelig forresten riktignok knapt neppe nokså temmelig altfor meget iblant hittil foreløpig herfra derfra desto dess imot igjennom imellom ifra istedenfor oppå inni utenom ovenfor nedenfor angående tross hos blant ifølge
kort voksen lyst skyld stund kø størrelse renten budsjett fornuft samvittighet evighet fristelse vilje luft mobil film pose sjokolade universitet ettermiddag helg kommune person innbrudd ulykke tilbud forslag regjering politi minister opposisjon nyhet støvel genser tannlege størrelse erfaring mening valg stemme parti debatt avis kunde sjef stilling lønn kontrakt skatt regning leie strøm nett internett passord skjerm melding epost lege sykepleier resept smerte feber hoste forkjølelse influensa allergi ulykke brann fare hjelp nød ambulanse
virke starte hate love låne eie mangle blåse fylle pusse orke gidde greie føde tvile ødelegge brenne endre skaffe tape veie kutte føre styre motta hviske prate ende skynde snø regne varsle ramme opplyse pågripe etterforske utstyre hellige liste anbefale ane skjønne passe handle bestille betale levere kalle klare nevne tenne fortjene nøle hyle bevare lure hende skylde pleie lage bøye rope lete knekke henge slippe lande fly kjøre parkere bytte velge stemme delta oppleve utvikle samarbeide diskutere forklare beskrive oversette gjenta uttale stave
rask frisk søt hvit flat falsk fersk tom dum morsom ensom lokal nasjonal sosial sentral digital normal travel alvorlig trolig daglig årlig ukentlig offentlig privat personlig mulig umulig nødvendig forskjellig lignende felles egen eneste enkelte hel halv dobbel tilfreds fornøyd skuffet overrasket redd sint lei stolt sjenert høflig frekk ærlig snill slem flink lat sterk svak tykk tynn bred smal dyp grunn skarp sløv våt tørr ren skitten
elleve tolv tretten fjorten femten seksten sytten atten nitten tjue tretti førti femti seksti sytti åtti nitti hundre tusen million milliard null halvannen ellevte tolvte tjuende hundrede første andre tredje fjerde
hallo morn farvel adjø skål au oi ok okei unnskyld beklager gratulerer velkommen
`;
const NN = `
att attende elles au jau dokker kvarandre hos åt altså nemleg sjølvsagt særleg truleg stundom dessutan derfor vekk unna mens korkje einkvan somme orsak eigentleg nett alvorleg mogleg einsam rein keisam
universitet film sjokolade pose mobil ettermiddag helg måndag tysdag onsdag torsdag fredag laurdag sundag søndag kommune person luft støvel regjering politi nyhende framlegg tilbod innbrot ulukke fridom fornuft samvit soge forteljing høve rente budsjett menneskerett
handle liste prate auke varsle råke opplyse etterforske tilrå arbeide tale flyge møtast snø ringje hende skade pågripe
elleve tolv tretten fjorten femten seksten sytten atten nitten tjue tretti førti femti seksti sytti åtti nitti hundre tusen million null
`;
for (const [std, list] of [['nb', NB], ['nn', NN]] as const) {
  const lex = lexiconFor(std);
  const words = [...new Set(list.split(/\s+/).filter(Boolean))];
  const missing = words.filter((w) => !lex.has(w));
  console.log(`${std}: ${words.length} everyday words checked; ${missing.length} are not in the word list (${(100 * missing.length / words.length).toFixed(0)} %)\n  missing: ${missing.join(' ')}\n  held: ${words.filter((w) => lex.has(w)).join(' ')}`);
}
