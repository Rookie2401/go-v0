import type { GoEvent } from '../../../repository-contract/src';
export interface AdmissionBudgetInput { learnerId: string; languageId: string; now: string; maxNew: number; dailyNewLimit: number }
export interface AdmissionBudgetResult { used: number; remaining: number }
const REVIEW = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed']);
const utcDay = (at: string) => new Date(Date.parse(at)).toISOString().slice(0, 10);
/**
 * Units whose first answers do not consume the day's allowance: the allowance bounds how much GoLearn VOCABULARY is introduced a day,
 * and the Class Essentials phrases (`class:<lang>:<phrase>`, the app's built-in deck, which no learner met in a text) are not that.
 * Before 2026-10-29 a first Class Essentials session of twenty cards spent the whole allowance (default 5), and the home then said
 * "0 eligible new admissions" for the rest of the UTC day with no vocabulary introduced at all.
 */
export const NEW_ALLOWANCE_EXEMPT_UNIT_PREFIXES: readonly string[] = ['class:'];
const exemptUnit = (e: GoEvent): boolean => {
  const unitId = e.subject.itemIds?.[0] ?? (typeof e.payload.unitId === 'string' ? e.payload.unitId : undefined);
  return !!unitId && NEW_ALLOWANCE_EXEMPT_UNIT_PREFIXES.some((p) => unitId.startsWith(p));
};
/** One durable introduction per canonical scheduling card consumes the UTC-day allowance.
 * New creation events record the actual first-answer time and typed intent. Legacy histories
 * use the first recorded response. Assistance or a later grade correction does not refund
 * an introduction. Dashboard loads and bare legacy CardAdded events consume nothing.
 * A creation counts whatever asked for it: a word first met in a saved deck or picked from
 * My Vocabulary is an introduction too (the owner's brief, 2026-10-29: a saved automatic deck
 * practised later must not be a way round the daily limit). Only an explicit re-review of a
 * card that already exists, and a legacy explicit response, are free.
 * Replicas converge on union; disconnected devices can temporarily exceed a global cap.
 */
export function admissionBudget(events: readonly GoEvent[], x: AdmissionBudgetInput): AdmissionBudgetResult {
  const now = Date.parse(x.now);
  if (!Number.isFinite(now)) return { used: 0, remaining: 0 };
  const rows: Array<{cardId:string;at:string;intent:unknown;id:string;creation:boolean}> = [];
  for (const e of events) {
    if(e.learnerId!==x.learnerId || e.languageId!==x.languageId || !e.subject.cardId || e.correctionOf || exemptUnit(e))continue;
    const admission=e.payload.admission as {at?:unknown;intent?:unknown}|undefined;
    const creation=e.kind==='CardAdded' && e.payload.lifecycle==='create' && admission && typeof admission.at==='string';
    const rating=e.payload.rating;
    const response=REVIEW.has(e.kind) && (rating===null || typeof rating==='number' && [1,2,3,4].includes(rating));
    if(!creation && !response)continue;
    const at=creation ? admission.at as string:e.at;
    if(!Number.isFinite(Date.parse(at)) || Date.parse(at)>now)continue;
    rows.push({cardId:e.subject.cardId,at,intent:creation?admission.intent:e.payload.practiceIntent,id:e.id,creation:!!creation});
  }
  // at the same instant the creation row decides before the response row, whatever their ids
  rows.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||Number(b.creation)-Number(a.creation)||(a.id<b.id?-1:a.id>b.id?1:0));
  const seen=new Set<string>();let used=0;
  for(const row of rows){
    if(seen.has(row.cardId))continue;seen.add(row.cardId);
    const explicit=(row.intent as {kind?:string}|undefined)?.kind==='explicit' || row.intent==='explicit';
    if(utcDay(row.at)!==utcDay(x.now) || (!row.creation && explicit))continue;
    used++;
  }
  const safeCap=(n:number)=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
  return {used,remaining:Math.max(0,Math.min(safeCap(x.maxNew),safeCap(x.dailyNewLimit)-used))};
}
