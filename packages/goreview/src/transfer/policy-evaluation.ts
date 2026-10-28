/** Chronological-prefix, descriptive comparison of the shipped planner policy controls. */
import { selectReviewEvidenceEvents, type GoEvent } from '../../../repository-contract/src';
import { chooseMicrodeckTarget } from '../planner/microdeck';
import { workloadAwareAdmission, type WorkloadAdmissionInput } from '../planner/admission-policy';
import { microdeckObservations, orderQueueCandidates } from '../planner/planner';
import type { PlannedItem } from '../types';

export interface PolicyQueueCandidate { planned: PlannedItem; tier: number; score: number; due: number }
export interface PrefixPolicyContext {
  learnerId: string;
  languageId: string;
  configuredMaximum: number;
  admission: Omit<WorkloadAdmissionInput, 'policy'>;
  queueCandidates: readonly PolicyQueueCandidate[];
}
export interface PolicyPrefixSnapshot { at: string; context: PrefixPolicyContext }
export interface PolicyPrefixResult {
  at: string;
  evidenceEventsAvailable: number;
  fixedTarget: number;
  adaptiveTarget: number;
  fixedAdmission: number;
  workloadAwareAdmission: number;
  strictQueueOrder: string[];
  boundedQueueOrder: string[];
  /** Outcomes actually observed before the next supplied cutoff; not outcomes caused by these alternatives. */
  observedWindow: { start: string; end: string; reviews: number; delayedAttempts: number; delayedSuccesses: number } | null;
}

/**
 * At each cutoff, decisions see only selected review evidence at or before that time. `snapshots` must represent
 * the deck/planner inputs known at each cutoff. Next-window outcomes are reported as observed history and are never
 * attributed to an alternative policy: the alternatives were not run as randomized counterfactuals.
 */
export function evaluateChronologicalPrefixes(rawEvents: readonly GoEvent[], snapshots: readonly PolicyPrefixSnapshot[]): PolicyPrefixResult[] {
  const ordered = [...snapshots].filter(s => Number.isFinite(Date.parse(s.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  return ordered.map((snapshot,index) => {
    const cutoff=Date.parse(snapshot.at), context=snapshot.context;
    assertSnapshotIsAsOf(snapshot);
    const rawPrefix=rawEvents.filter(e=>e.learnerId===context.learnerId&&e.languageId===context.languageId&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=cutoff);
    const prefixSelection=selectReviewEvidenceEvents(rawPrefix);
    const prefix=qualifyingPolicyEvidence(prefixSelection.events,prefixSelection.assistedIds);
    const prefixIds=new Set(prefix.map(e=>e.id));
    const observations=microdeckObservations(rawPrefix,context.languageId,snapshot.at,{...prefixSelection,events:prefix,
      canonicalIds:new Set([...prefixSelection.canonicalIds].filter(id=>prefixIds.has(id))),independentSiblingIds:new Set([...prefixSelection.independentSiblingIds].filter(id=>prefixIds.has(id)))});
    const targetInput={configuredMaximum:context.configuredMaximum,observations};
    const fixedTarget=chooseMicrodeckTarget({...targetInput,policy:{adaptive:false}}).targetQuestions;
    const adaptiveTarget=chooseMicrodeckTarget(targetInput).targetQuestions;
    const fixedAdmission=workloadAwareAdmission({...context.admission,policy:{mode:'fixed',expectedReturnRatio:0}}).limit;
    const workloadLimit=workloadAwareAdmission({...context.admission,policy:{mode:'workload-aware'}}).limit;
    const queue=(candidates:readonly PolicyQueueCandidate[],policy:'strict-due'|'bounded-remediation')=>orderQueueCandidates([...candidates],policy).map(x=>x.planned.item.itemId);
    const next=ordered[index+1];
    let observedWindow: PolicyPrefixResult['observedWindow']=null;
    if(next){
      const end=Date.parse(next.at), start=cutoff;
      const rawThrough=rawEvents.filter(e=>e.learnerId===context.learnerId&&e.languageId===context.languageId&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=end);
      const throughSelection=selectReviewEvidenceEvents(rawThrough);
      const allThrough=qualifyingPolicyEvidence(throughSelection.events,throughSelection.assistedIds);
      const window=prefixForWindow(allThrough,context.learnerId,context.languageId,start,end);
      const previous=new Map<string,GoEvent>(); let delayedAttempts=0,delayedSuccesses=0;
      for(const event of allThrough){
        const card=event.subject.cardId; if(!card) continue;
        const prior=previous.get(card), at=Date.parse(event.at);
        if(at>start&&at<=end&&prior&&at-Date.parse(prior.at)>=86_400_000&&reliableOutcome(event)){
          delayedAttempts++; if(successfulOutcome(event)) delayedSuccesses++;
        }
        previous.set(card,event);
      }
      observedWindow={start:snapshot.at,end:next.at,reviews:window.length,delayedAttempts,delayedSuccesses};
    }
    return {at:snapshot.at,evidenceEventsAvailable:prefix.length,fixedTarget,adaptiveTarget,fixedAdmission,workloadAwareAdmission:workloadLimit,
      strictQueueOrder:queue(context.queueCandidates,'strict-due'),boundedQueueOrder:queue(context.queueCandidates,'bounded-remediation'),observedWindow};
  });
}

function prefixForWindow(events:GoEvent[],learnerId:string,languageId:string,start:number,end:number):GoEvent[]{
  return events.filter(e=>e.learnerId===learnerId&&e.languageId===languageId&&Date.parse(e.at)>start&&Date.parse(e.at)<=end);
}
function qualifyingPolicyEvidence(events:GoEvent[],assistedIds:ReadonlySet<string>):GoEvent[]{
  return events.filter(e=>!assistedIds.has(e.id)&&typeof e.subject.cardId==='string'&&e.subject.cardId.length>0&&
    (e.evidence?.quality==='moderate'||e.evidence?.quality==='strong')&&
    (e.evidence.sourceReliability===undefined||e.evidence.sourceReliability>=.8)&&!e.evidence.assisted&&
    e.payload.hinted!==true&&e.payload.answerShownBefore!==true&&e.payload.transcriptShownBefore!==true&&e.payload.retrievalAttempted!==false&&
    (e.kind!=='ListeningAssessed'||validListeningAttempt(e)));
}
function reliableOutcome(event:GoEvent):boolean{return (event.evidence?.quality==='moderate'||event.evidence?.quality==='strong')&&(event.evidence.sourceReliability===undefined||event.evidence.sourceReliability>=.8)&&!event.evidence.assisted&&(event.kind!=='ListeningAssessed'||validListeningAttempt(event));}
function successfulOutcome(event:GoEvent):boolean{
  const p=event.payload as Record<string,unknown>;
  return reliableOutcome(event)&&p.correct===true&&((p.outcome==='correct'&&Number(p.rating)>1)||(p.outcome==='partial'&&Number(p.rating)===2));
}
function assertSnapshotIsAsOf(snapshot:PolicyPrefixSnapshot):void{
  const cutoff=Date.parse(snapshot.at);
  for(const candidate of snapshot.context.queueCandidates){
    if(Number.isFinite(Date.parse(candidate.planned.item.addedAt))&&Date.parse(candidate.planned.item.addedAt)>cutoff)
      throw new RangeError(`queue item ${candidate.planned.item.itemId} was added after the policy cutoff`);
    if(candidate.planned.item.history.some(row=>Number.isFinite(Date.parse(row.at))&&Date.parse(row.at)>cutoff))
      throw new RangeError(`queue item ${candidate.planned.item.itemId} contains review history after the policy cutoff`);
  }
}
function validListeningAttempt(event:GoEvent):boolean{
  return event.payload.voice==='recorded'&&event.payload.responseMode==='typed'&&event.payload.answerShownBefore===false&&
    event.payload.audioPlayed!==false&&event.payload.audioFailed!==true&&event.payload.transcriptShownBefore!==true;
}
