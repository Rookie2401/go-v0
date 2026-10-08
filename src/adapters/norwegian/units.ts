/**
 * Particle verbs as multiword units (recon B5; the German pattern, german/units.ts). MACHINE-DRAFTED list and rules, not
 * checked by a native speaker.
 *
 * "Jeg står opp klokka sju", "Hun slår den på", "Han tok på seg jakken": a verb and an adverbial particle that follows it
 * (possibly after a pronoun object, an adverb or a short noun phrase) are one lexical unit. A unit is found when a verb form
 * whose lemma is the unit's verb has the unit's particle (and `seg`, for the reflexive ones) within four words after it in the
 * same clause. A clause ends at a comma, sentence punctuation, a conjunction or another finite verb. Each piece carries the
 * unit's lemma ("stå opp") in its analysis; the unit is counted once, on the verb. A preposition + object that cannot split
 * (se på bilen, tenke på) is NOT a unit here. The inseparable prefixes be-, for-, mis-, er- do not split and are not units
 * (forstå, bestille, mislykkes): they get parts instead.
 */

export interface NoUnit { verb: string; particle: string; reflexive: boolean; display: string; gloss: string }

const UNIT_SOURCE = `
stå opp = get up
stå igjen = remain
stå over = skip
finne ut = find out
finne frem = find the way
gå ut = go out
gå inn = go in
gå opp = go up
gå ned = go down
gå bort = go away; pass away
gå videre = go on
komme tilbake = come back
komme inn = come in
komme ut = come out
komme fram = arrive; emerge
komme frem = arrive; emerge
komme opp = come up
komme med = bring; come along
komme igjen = come again
gi opp = give up
gi ut = publish
gi tilbake = give back
slå på = switch on
slå av = switch off
slå opp = look up
slå ned = strike down
slå sammen = combine
slå til = strike; accept
ta på = put on
ta på seg = put on (clothes)
ta av = take off
ta av seg = take off (clothes)
ta med = bring along
ta imot = receive
ta opp = take up; record
ta ut = take out
ta over = take over
ta ned = take down
skrive ned = write down
skrive opp = write down
skrive under = sign
skrive ut = print
se ut = look; appear
se opp = look out
se etter = look after
holde opp = stop
holde på = be busy; keep on
holde fast = hold on
holde ut = endure
sette seg ned = sit down
sette fram = put out
sette opp = put up
sette på = put on
sette inn = insert
legge ned = shut down; lay down
legge til = add
legge igjen = leave behind
legge fra seg = put down
legge ut = post; lay out
legge opp = plan
hente ut = pick up (collect)
kjøre bort = drive away
kjøre inn = drive in
kjøre ut = drive out
løpe bort = run away
sende inn = send in
sende ut = send out
sende tilbake = send back
sende bort = send away
ringe opp = phone
ringe på = ring (a bell)
vaske opp = wash up
vaske av = wash off
vaske ned = wash down
rydde opp = tidy up
rydde bort = clear away
lage til = prepare
bli med = come along
falle ned = fall down
falle av = fall off
falle ut = fall out
stenge av = switch off; close off
åpne opp = open up
lukke igjen = close
låse opp = unlock
låse inn = lock in
kle på = dress
kle av = undress
kle på seg = get dressed
kle av seg = get undressed
pakke ut = unpack
pakke inn = wrap
pakke ned = pack
trekke av = pull off
trekke fra = deduct
snu om = turn round
våkne opp = wake up
gjøre om = redo; convert
gjøre opp = settle
gjøre ferdig = finish
møte opp = turn up
møte fram = turn up
dra av = pull off; leave
dra bort = go away
dra ut = go out
dra hjem = go home
reise bort = travel away
reise hjem = travel home
bringe med = bring along
slippe inn = let in
slippe ut = let out
tenke ut = think up
tenke etter = think carefully
tenke over = think over
skru på = turn on
skru av = turn off
stille inn = set; adjust
stille opp = turn up; line up
stille ut = exhibit
bære inn = carry in
bære ut = carry out
hjelpe til = help
kaste ut = throw out
kaste bort = waste
vise fram = show
vise frem = show
spise opp = eat up
drikke opp = drink up
lese opp = read aloud
lese inn = record
bruke opp = use up
betale tilbake = pay back
hoppe over = skip
henge opp = hang up
sitte igjen = remain
sitte fast = be stuck
`;

/** The Nynorsk particle verbs: the same units with the Nynorsk verb (sjå ut, kome tilbake, seie ifrå). */
const UNIT_SOURCE_NN = `
stå opp = get up
finne ut = find out
gå ut = go out
gå inn = go in
kome tilbake = come back
kome inn = come in
kome ut = come out
gje opp = give up
slå på = switch on
slå av = switch off
ta på seg = put on (clothes)
ta av seg = take off (clothes)
ta med = bring along
ta imot = receive
skrive ned = write down
sjå ut = look; appear
sjå opp = look out
sjå etter = look after
halde opp = stop
halde på = be busy; keep on
setje seg ned = sit down
leggje ned = shut down; lay down
leggje til = add
sende inn = send in
sende ut = send out
vaske opp = wash up
rydde opp = tidy up
bli med = come along
dra bort = go away
`;

const REFLEXIVE = new Set(['seg', 'meg', 'deg', 'oss', 'dem']);
export const REFLEXIVE_PRONOUNS = REFLEXIVE;

export function parseUnits(src: string): NoUnit[] {
  const out: NoUnit[] = [];
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    const [lhs, gloss] = s.split('=').map((x) => x.trim());
    const words = lhs.split(/\s+/);
    const reflexive = words.includes('seg');
    const particle = words.filter((w, i) => i > 0 && w !== 'seg')[0];
    out.push({ verb: words[0], particle, reflexive, display: lhs, gloss });
  }
  return out;
}

export const NB_UNITS: readonly NoUnit[] = parseUnits(UNIT_SOURCE);
export const NN_UNITS: readonly NoUnit[] = parseUnits(UNIT_SOURCE_NN);

/** What the unit matcher needs to know about each token. */
export interface UnitToken {
  normalized: string;
  isWord: boolean;
  /** Lemmas of the token's verb readings (best first). */
  verbLemmas: string[];
  /** The token is a finite verb (some reading is finite) with a lemma other than the candidate unit verb. */
  finite: boolean;
  /** The token's best reading is a noun, name, determiner or adjective. */
  nominal: boolean;
  /** The token can be a conjunction or subordinator. */
  conj: boolean;
  /** Punctuation text for a non-word token. */
  punct?: string;
}

export interface UnitHit { unit: NoUnit; head: number; pieces: number[]; confidence: number }

const PREPOSITION_LIKE = new Set(['på', 'av', 'over', 'under', 'til', 'i', 'med', 'om', 'etter', 'fra', 'for']);
const MAX_GAP = 4;

export function findUnits(toks: readonly UnitToken[], units: readonly NoUnit[]): UnitHit[] {
  const hits: UnitHit[] = [];
  const byVerb = new Map<string, NoUnit[]>();
  for (const u of units) byVerb.set(u.verb, [...(byVerb.get(u.verb) ?? []), u]);
  const taken = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t.isWord || !t.verbLemmas.length) continue;
    const cands = t.verbLemmas.flatMap((l) => byVerb.get(l) ?? []);
    if (!cands.length) continue;
    // longest unit first: "ta på seg" before "ta på"
    cands.sort((a, b) => b.display.length - a.display.length);
    for (const u of cands) {
      let particleAt = -1;
      let reflexAt = -1;
      let gapNominal = false;
      for (let j = i + 1; j < toks.length && j <= i + 1 + MAX_GAP; j++) {
        const x = toks[j];
        if (!x.isWord) { if (/[,.;:!?…]/.test(x.punct ?? '')) break; continue; }
        if (x.conj && x.normalized !== u.particle) break;
        if (x.finite && !x.verbLemmas.includes(u.verb)) break;
        if (particleAt < 0 && x.normalized === u.particle && !taken.has(j)) particleAt = j;
        else if (u.reflexive && reflexAt < 0 && REFLEXIVE.has(x.normalized) && !taken.has(j)) reflexAt = j;
        else if (particleAt < 0 && x.nominal) gapNominal = true;
        if (particleAt >= 0 && (!u.reflexive || reflexAt >= 0)) break;
      }
      if (particleAt < 0) continue;
      if (u.reflexive && reflexAt < 0) continue;
      const pieces = [i, particleAt, reflexAt].filter((x) => x >= 0).sort((a, b) => a - b);
      if (pieces.some((p) => p !== i && taken.has(p))) continue;
      const gap = particleAt - i - 1;
      let confidence = 0.85;
      if (gap > 2 || gapNominal) confidence = 0.7;
      if (gapNominal && PREPOSITION_LIKE.has(u.particle) && gap >= 1) confidence = 0.6;
      hits.push({ unit: u, head: i, pieces, confidence });
      pieces.forEach((p) => taken.add(p));
      break;
    }
  }
  return hits;
}

/** Inseparable prefixes (recon B5): the verb is one word and never splits. */
export const INSEPARABLE_PREFIXES: readonly string[] = ['be', 'for', 'mis', 'er'];
