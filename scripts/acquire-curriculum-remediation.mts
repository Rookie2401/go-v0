/** Isolated, repeatable text-only acquisition. Never edits published output. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAdapterRegistry } from '../src/adapters';
import { buildLibrary, parseBuildManifest } from '../src/library/build';
import type { LanguageCode } from '../src/core';
const date = '2026-10-04';
const base = path.resolve('data/sources/curriculum-remediation');
const reviewDir = path.resolve('data/review/curriculum-remediation');
const adapters = createAdapterRegistry();
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), {recursive:true}); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n'); };
const download = async (url: string, file: string) => { const r = await fetch(url,{signal:AbortSignal.timeout(25000)}); if(!r.ok) throw Error(`${r.status}: ${url}`); const s = await r.text(); await write(file,s); return s; };
if(process.argv.includes('--build-check')){
 const results:any[]=[];
 for(const [lang,relative] of [['de','de/library-manifest.json'],['de','modern/de-library-manifest.json'],['es','modern/es-library-manifest.json'],['hi','modern/hi-library-manifest.json'],['sq','modern/sq-library-manifest.json']]){
  const file=path.join(base,relative),raw=JSON.parse(await fs.readFile(file,'utf8')),manifest=parseBuildManifest(raw,lang as LanguageCode),input=path.dirname(file);
  let files=0;
  const result=await buildLibrary({lang:lang as LanguageCode,manifest,adapters,date,io:{async readSource(f){const buffer=await fs.readFile(path.join(input,f));return{text:buffer.toString('utf8'),sha256:hash(buffer)};},async write(relative,content){await write(path.join(reviewDir,'pure-build',relative.startsWith('modern')?'modern':'',lang,path.basename(input),relative),content);files++;}}});
  results.push({lang,manifest:relative,built:result.built.length,published:result.built.reduce((n,b)=>n+b.published,0),tokens:result.built.reduce((n,b)=>n+b.words,0),files,refused:result.refused});
 }
 await write(path.join(reviewDir,'pure-build-validation.json'),{date,results});
 console.log(JSON.stringify(results));if(results.some(r=>r.refused.length))process.exitCode=1;
}else{
function decode(html: string) {
  return html.replace(/<a\b[^>]*class="(?:pagenum|fnanchor)[^"]*"[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]*>/g,'').replace(/&#x([\da-f]+);/gi,(_,s)=>String.fromCodePoint(parseInt(s,16))).replace(/&#(\d+);/g,(_,s)=>String.fromCodePoint(Number(s))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}
function metrics(lang: LanguageCode, text: string) {
 const a=adapters.get(lang), words=a.tokenize(text).filter(t=>t.isWord), types=new Set(words.map(t=>t.normalized));
 const analyses=a.analyze(words), lemmas=new Set(analyses.flatMap(x=>x.candidates[0]?.lemma ? [x.candidates[0].lemma] : []));
 const sentences=text.split(/[.!?।。]+/u).filter(s=>s.trim()), lengths=sentences.map(s=>a.tokenize(s).filter(t=>t.isWord).length).sort((x,y)=>x-y);
 return {adapter:lang,tokenCount:words.length,typeCount:types.size,observedLemmaCount:lemmas.size,analyzerUnresolvedTokens:analyses.filter(x=>!x.candidates.length).length,lexicalDiversity:types.size/Math.max(1,words.length),sentenceCount:lengths.length,medianSentenceTokens:lengths[Math.floor(lengths.length/2)]??0,maxSentenceTokens:lengths.at(-1)??0,limitations:'Adapter lexicon is incomplete; unresolved analyzer tokens are not learner unknown words. No frequency corpus, native review, CEFR, or personalized coverage inferred.'};
}
await fs.mkdir(base,{recursive:true}); await fs.mkdir(reviewDir,{recursive:true});
const queue: any[]=[];
const policyUrls={pg:'https://www.gutenberg.org/policy/license.html',gv:'https://globalvoices.org/about/global-voices-attribution-policy/',sw:'https://storyweaver.org.in/attributions',cc:'https://creativecommons.org/licenses/by/4.0/legalcode'};
const evidence: any[]=[];
for(const [key,url] of Object.entries(policyUrls)) {try{const raw=await download(url,path.join(base,'evidence',`${key}.html`)); evidence.push({key,url,acquiredAt:date,sha256:hash(raw)});}catch(e){evidence.push({key,url,status:'fetch-blocked',reason:String(e)});} }
const entries: any[]=[];
for(const [id,volume] of [[35794,1],[45189,2]]) {
 const url=`https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`;
 const html=await download(url,path.join(base,'de',`pg${id}.html`));
 const pgPage=await download(`https://www.gutenberg.org/ebooks/${id}`,path.join(base,'evidence',`pg${id}-catalogue.html`));
 if(!/Public domain in the USA/i.test(pgPage)) throw Error(`Edition ${id} has no official US PD statement`);
 const raw=await download(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,path.join(base,'de',`pg${id}.txt`));
 const headings=[...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
 let count=0;
 for(let j=0;j<headings.length;j++) {
  const h=headings[j], title=decode(h[0]);
  if(!/id="Text\d+"/.test(h[0]) || !/^\d+\./.test(title)) continue;
  const number=Number(title.match(/^\d+/)![0]);
  const block=html.slice(h.index!+h[0].length,headings[j+1]?.index??html.length);
  const paragraphs=[...block.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map(p=>decode(p[0])).filter(Boolean);
  if(!paragraphs.length) throw Error(`No paragraphs ${id}/${number}`);
  const text=paragraphs.join('\n\n')+'\n', slug=`guerber-v${volume}-story-${String(number).padStart(2,'0')}`, file=`${slug}.txt`;
  if(/PROJECT GUTENBERG|VOCABULARY|TRANSCRIBER/i.test(text)) throw Error(`Apparatus leaked ${slug}`);
  await write(path.join(base,'de',file),text);
  const measured=metrics('de',text), stage=volume===2?'s6':number<=4?'s2':[5,6,7,8,10,15].includes(number)?'s3':'s4';
  entries.push({slug,title:title.replace(/^\d+\.\s*/,''),author:'H. A. Guerber',stage,courseId:'germany-de',variety:'de',streams:['library'],contentType:'story',genre:'graded-historical-narrative',era:'historical',pedagogicalRole:volume===1?'graded':'bridge',registers:['historical_spelling','literary'],releaseState:'ready',nativeReview:'pending',difficulty:measured,rights:{state:'verified-public-domain',copyrightStatus:'public-domain',permission:'not-needed',canBundle:true,canModify:false,canStoreOffline:true,canBundleAudio:false,verified:true,verifiedBy:'Official Project Gutenberg edition catalogue and exact source comparison',verifiedAt:date,basis:`Project Gutenberg #${id} identifies this exact edition as public domain in the USA; no clearance outside the USA is asserted.`,statusByJurisdiction:{US:'public-domain'},evidence:[`https://www.gutenberg.org/ebooks/${id}`,policyUrls.pg,url]},source:{file,kind:'plain',url:`${url}#Text${number}`,edition:`D. C. Heath, ${volume===1?'1897 imprint':'undated imprint; copyright 1896'}; ${volume===1?'Erster':'Zweiter'} Teil; Project Gutenberg #${id}`,acquiredAt:date,sha256:hash(text),originalSourceSha256:hash(html),plainEditionSha256:hash(raw),attribution:`${title} — H. A. Guerber, Märchen und Erzählungen für Anfänger, volume ${volume}, D. C. Heath ${volume===1?'1897':'undated imprint, copyright 1896'}; Project Gutenberg #${id}. Source: ${url}#Text${number}. US public domain; original wording and historical spelling retained.`,provenance:'Numbered prose story only; English preface, poems, vocabulary, questions, advertisements and PG wrapper excluded at HTML h2 boundaries. Paragraphs unwrapped; page and footnote anchor markers removed; no modernization, translation, rescue text, illustrations or audio.'},convert:{stripBoilerplate:false,unwrap:false},review:{status:'reviewed',reviewedBy:'curriculum-remediation deterministic source-boundary and edition check',reviewedAt:date,coversSourceSha256:hash(text),notes:'Source-fidelity check only. Historical learner reader, not generated language. Native-speaker and placement validation pending; s2/s3/s4/s6 are provisional measured placements.'}});
  queue.push({id:slug,lang:'de',status:'native_review',sourceSha256:hash(text),checks:['historical spelling burden','source-to-render comparison','stage difficulty and rescue needs'],reviewer:null}); count++;
 }
 if(count<10) throw Error(`Unexpected story count ${id}: ${count}`);
}
await write(path.join(base,'de','library-manifest.json'),{schema:1,lang:'de',entries});
await write(path.join(base,'de','metrics.json'),{date,works:entries.map(e=>({slug:e.slug,stage:e.stage,...e.difficulty})),totalTokens:entries.reduce((n,e)=>n+e.difficulty.tokenCount,0)});
// Official RSS supplies text and creator provenance. Hold every extraction for
// article-level byline/translation and third-party-quote review before import.
const modern:any[]=[];
for(const lang of ['de','es','hi','sq'] as LanguageCode[]) {
 try {
  const url=`https://${lang}.globalvoices.org/feed/`, rss=await download(url,path.join(base,'modern',`${lang}-feed.xml`));
  const items=[...rss.matchAll(/<item>[\s\S]*?<\/item>/g)];
  let selected=0;
  for(const item of items) {
   const field=(tag:string)=>item[0].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g,'')??'';
   const title=decode(field('title')), articleUrl=decode(field('link')), creator=decode(field('dc:creator'));
   if(/Podcast|Gaza|Spendenkampagne|हत्या|polit|Gefängnis|cárcel|Azerbajxhan|bandat/i.test(title)) continue;
   let content=field('content:encoded');
   if(!creator||!articleUrl||!content) continue;
   content=content.replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi,'').replace(/<div\b[^>]*class="[^"]*wp-caption[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'').replace(/<p\b[^>]*class=["'][^"']*(?:caption|originally-published)[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,'').replace(/<(?:script|style|iframe|figure)\b[\s\S]*?<\/(?:script|style|iframe|figure)>/gi,'');
   const paragraphs=[...content.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map(p=>decode(p[0])).filter(Boolean);
   if(paragraphs.length<3) continue;
   const text=paragraphs.join('\n\n')+'\n', id=`gv-${lang}-${hash(articleUrl).slice(0,12)}`;
   await write(path.join(base,'modern',`${id}.txt`),text);
   let pageStatus='not-fetched';
   try {await download(articleUrl,path.join(base,'modern',`${id}.html`));pageStatus='cached';} catch(e){pageStatus=String(e);}
   const candidate={id,lang,title,sourceUrl:articleUrl,sourceFile:`${id}.txt`,sourceSha256:hash(text),feedSourceSha256:hash(rss),feedCreator:creator,publicationDate:field('pubDate'),license:'CC BY 3.0 unless otherwise stated',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',policyUrl:policyUrls.gv,author:null,translator:null,originalStoryUrl:null,status:'linguistic_review',canBundle:false,pageStatus,pedagogicalRole:'authentic',registers:['modern_standard','journalistic'],metrics:metrics(lang,text),changeNotice:'Text-only extraction; images, captions, embeds and blockquotes removed; HTML markup removed and paragraphs unwrapped. Linked references retained in cached source, not learner text.',requiredReview:['Resolve original author versus translator from article page, retain original-story link','Check article-level licensing exceptions and inline third-party quotations; RSS creator is not assumed original author','Verify extraction against complete article and retain references','Native register/difficulty review before any published placement'],attributionDraft:`${title} — ${creator} (RSS creator; role pending). Originally on Global Voices: ${articleUrl}. CC BY 3.0 subject to article exception check. Text-only extraction; media and blockquotes removed.`};
   modern.push(candidate); queue.push(candidate); if(++selected>=3)break;
  }
 }catch(e){modern.push({lang,status:'acquisition_blocked',reason:String(e),canBundle:false});}
}
await write(path.join(base,'modern','candidates.json'),{schema:1,date,entries:modern});
// One source-authored, licensed narrative/explanatory excerpt per language.
// Explicit source paragraph selections avoid quoted third-party prose and embeds.
const clearSelections: Record<string,{id:string;paragraphs:number[]}>={
 es:{id:'gv-es-dae11aaaf264',paragraphs:[2,3,4,5]},
 hi:{id:'gv-hi-467925c35d73',paragraphs:[1,2,4]},
 sq:{id:'gv-sq-adc3e64cb681',paragraphs:[4,5,8,9,11]},
};
// German arts/culture reader is preferable to the general feed's conflict reports.
const deCultureFeed=await download('https://de.globalvoices.org/category/topics/arts-culture/feed/',path.join(base,'modern','de-culture-feed.xml'));
const deItem=[...deCultureFeed.matchAll(/<item>[\s\S]*?<\/item>/g)].find(x=>/Eine kolumbianische Sicht/.test(x[0]));
if(deItem){
 const f=(tag:string)=>deItem[0].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g,'')??'';
 const url=decode(f('link')),id=`gv-de-${hash(url).slice(0,12)}`,page=await download(url,path.join(base,'modern',`${id}.html`));
 let content=f('content:encoded').replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi,'').replace(/<div\b[^>]*class="[^"]*wp-caption[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
 const text=[...content.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map(p=>decode(p[0])).filter(Boolean).join('\n\n')+'\n';
 await write(path.join(base,'modern',`${id}.txt`),text);
 clearSelections.de={id,paragraphs:[2,3,4,5,6]};
 modern.push({id,lang:'de',title:decode(f('title')),sourceUrl:url,sourceFile:`${id}.txt`,sourceSha256:hash(text),feedSourceSha256:hash(deCultureFeed),publicationDate:f('pubDate'),pageSha256:hash(page),canBundle:false,status:'linguistic_review'});
}
const modernReady:any[]=[];
for(const [lang,selection] of Object.entries(clearSelections)) {
 const candidate=modern.find(e=>e.id===selection.id);if(!candidate)throw Error(selection.id);
 const html=await fs.readFile(path.join(base,'modern',`${candidate.id}.html`),'utf8');
 const header=html.slice(html.indexOf("id='post-header-credit'"),html.indexOf("class='post-translations-container'",html.indexOf("id='post-header-credit'")));
 const names=[...header.matchAll(/<div class='contributor-name'>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g)].map(x=>decode(x[1]));
 const original=html.match(new RegExp(`post-translation-${lang==='de'?'es':'en'}[^>]*><a href='([^']+)'`))?.[1];
 if(names.length<2||!original||!/creativecommons.org\/licenses\/by\/3.0/.test(html))throw Error(`Unresolved GV credits/license ${selection.id}`);
 if(names.length>2)names[1]=names.slice(1).join('; ');
 const all=(await fs.readFile(path.join(base,'modern',`${candidate.id}.txt`),'utf8')).trim().split(/\n\s*\n/);
 const paragraphs=selection.paragraphs.map(i=>all[i]);if(paragraphs.some(p=>!p))throw Error(`Missing excerpt paragraph ${selection.id}`);
 const text=paragraphs.join('\n\n')+'\n',file=`${candidate.id}-excerpt.txt`,sha=hash(text);
 await write(path.join(base,'modern',file),text);
 modernReady.push({slug:`${candidate.id}-excerpt`,title:`${candidate.title} — excerpt`,author:names[0],translator:names[1],stage:lang==='hi'?'c6':lang==='sq'?'6':lang==='es'?'s4':'s6',streams:['library'],contentType:'nonfiction',genre:'contemporary-nonfiction',era:'modern',pedagogicalRole:'authentic',registers:['modern_standard','journalistic'],releaseState:'ready',nativeReview:'source-authored; placement review pending',difficulty:metrics(lang as LanguageCode,text),rights:{state:'verified-open-licence',copyrightStatus:'licensed',permission:'not-needed',canBundle:true,canModify:true,canStoreOffline:true,canBundleAudio:false,verified:true,verifiedBy:'Exact Global Voices article credits, license footer and official republication policy',verifiedAt:date,licensing:'CC BY 3.0',statusByJurisdiction:{'*':'licensed'},basis:'GV-created author narrative/explanatory paragraphs in this exact credited translation; article/footer CC BY 3.0, current official policy permits redistribution and adaptation. Selected excerpt excludes third-party quoted prose and all media.',evidence:[candidate.sourceUrl,original,policyUrls.gv,'https://creativecommons.org/licenses/by/3.0/']},source:{file,kind:'plain',url:candidate.sourceUrl,edition:`Global Voices ${lang} edition, ${candidate.publicationDate}`,sha256:sha,originalSourceSha256:hash(html),originalStoryUrl:original,author:names[0],translator:names[1],attribution:`${candidate.title} — ${names[0]}, translated by ${names[1]}. Originally on Global Voices: ${candidate.sourceUrl}; original story: ${original}. CC BY 3.0: https://creativecommons.org/licenses/by/3.0/. Changes: selected text-only excerpt; HTML/links unwrapped, other paragraphs, images, captions, quoted prose and media omitted; source wording preserved.`,provenance:`Exact paragraphs ${selection.paragraphs.map(i=>i+1).join(',')} from cached text-only extraction; this is a labeled excerpt, not complete article. Original author/translator identified from exact article byline. Native placement pending; no generated content.`},convert:{stripBoilerplate:false,unwrap:false},review:{status:'reviewed',reviewedBy:'curriculum-remediation exact article credits and excerpt source-fidelity check',reviewedAt:date,coversSourceSha256:sha,notes:'Source-authored authentic prose. Article credit/license and excerpt comparison only; no native placement or rescue-text approval invented.'}});
}
for(const lang of Object.keys(clearSelections))await write(path.join(base,'modern',`${lang}-library-manifest.json`),{schema:1,lang,entries:modernReady.filter(e=>e.slug.startsWith(`gv-${lang}-`))});
await write(path.join(base,'modern','ready-excerpts.json'),modernReady);
await write(path.join(base,'modern','candidates.json'),{schema:1,date,entries:modern});
// Substantial translation-ready packet: exact, edition-credited CC BY stories already acquired.
const hiCoverage=JSON.parse(await fs.readFile('data/sources/hi/gdl/coverage.json','utf8'));
const translations: any[]=[];
for(const b of hiCoverage.books.filter((b:any)=>b.licence?.includes('CC-BY-4.0')&&b.credits?.some((c:string)=>/Story Attribution/.test(c))).slice(0,40)) {
 const source=await fs.readFile(path.join('data/sources/hi/gdl',b.extractedFile),'utf8');
 const id=`sq-translation-${b.apiPostId}`;
 await write(path.join(base,'sq-translation',`${id}.source-hi.txt`),source);
 translations.push({id,status:'translation_needed',sourceLanguage:'hi',targetLanguage:'sq',targetVariety:'Standard Albanian',title:b.title,sourceUrl:b.sourceUrl,sourceSha256:hash(source),originalEpubSha256:b.epubSha256,sourceFile:`${id}.source-hi.txt`,licence:'CC BY 4.0',licenceUrl:policyUrls.cc,credits:b.credits,translator:null,translationSha256:null,nativeReviewer:null,nativeReviewSha256:null,canPublish:false,requiredAttribution:'Retain all supplied story/translation/publisher/donor credits and license notices; add Albanian translator, original story link and explicit translation/adaptation notice.',sourceMetrics:metrics('hi',source),acceptance:['Named translator competent in source Hindi and Standard Albanian or licensed original language source obtained','Connected story translated faithfully without added doctrine or factual claims','Independent native Standard Albanian review of every sentence','English rescue reviewed separately','Hash-bound translation, reviewer identity, date, register and stage evidence','Source credit renderer checked and rights gate passes']});
}
await write(path.join(base,'sq-translation','packet.json'),{schema:1,date,licence:'CC BY 4.0',sourceStatus:'Rights-cleared cached StoryWeaver/GDL editions; original credits retained. No Albanian translation produced or native review claimed.',entries:translations});
queue.push(...translations);
const topics=['greetings and introductions','family and daily routines','travel and transport','food and hospitality','shopping and prices','health and asking for help','church and community invitations','respectful testimony and personal experience','school and work','directions and practical safety','asking for clarification and checking understanding','Bible discussion and respectful questions about an actual passage','Honduran geography and local place descriptions','Honduran community biography and everyday life history'];
await write(path.join(reviewDir,'honduras-commission.json'),{date,status:'commission_needed',regionalVariety:'Honduran/Central American Spanish',entries:topics.map((topic,i)=>({id:`hn-commission-${i+1}`,topic,status:'commission_needed',author:null,nativeReviewer:null,rightsAgreement:null,required:'Commission original connected modern Honduran narratives/dialogues with documented commercial/derivative/offline permission; competent Honduran writer plus independent native review; beginner through intermediate variants; no automatic vos claims or labeling existing Spanish heritage texts Honduran.'}))});
const thai=JSON.parse(await fs.readFile('data/sources/th-gap-recovery/source-manifest.json','utf8'));
await write(path.join(reviewDir,'thai-aesop-review.json'),{date,status:'native_review',edition:'นิทานอีสป, 1956/2499 funeral reprint',rights:'Root official Wikisource PD template is Thailand-specific; US/offline global release requires separate edition clearance. CC BY-SA transcription contribution recorded independently.',evidence:['https://th.wikisource.org/wiki/นิทานอีสป','https://th.wikisource.org/wiki/ดัชนี:นิทานอีสป_(2499).pdf','https://th.wikisource.org/wiki/นิทานอีสป/คำชี้แจงของผู้แต่ง'],proofreadingStatus:'Official scan index reports all pages proofread but not independently validated (Thai index status); independent scan comparison by this project not completed. Root includes restored-text category; do not infer validated proofreading.',checks:['Compare all 45 cached fables with 1956 scan; record page numbers and corrected/restored passages','Native Central Thai reviewer assess historical vocabulary, orthography, segmentation and beginner suitability','Keep exact historical text separate from any explicitly attributed adaptation','Review 1911 author preface claim of simple sentences after primer against actual difficulty; preface alone is not pedagogical approval'],entries:thai.entries.map((e:any)=>({...e,status:'native_review',reviewer:null}))});
await write(path.join(reviewDir,'review-queue.json'),{schema:1,date,entries:queue});
await write(path.join(base,'evidence','index.json'),evidence);
const readyManifests=[{schema:1,lang:'de',entries},...Object.keys(clearSelections).map(lang=>({schema:1,lang,entries:modernReady.filter(e=>e.slug.startsWith(`gv-${lang}-`))}))];
for(const manifest of readyManifests)parseBuildManifest(manifest,manifest.lang as LanguageCode);
const signatures=new Set<string>();
for(const entry of [...entries,...modernReady]){
 if(entry.source.sha256!==entry.review.coversSourceSha256)throw Error(`Review hash mismatch: ${entry.slug}`);
 if(signatures.has(entry.source.sha256))throw Error(`Duplicate source: ${entry.slug}`);
 signatures.add(entry.source.sha256);
}
await write(path.join(reviewDir,'acquisition-validation.json'),{date,validatedBuildManifests:readyManifests.length,uniqueReadySourceHashes:signatures.size,reviewHashMatches:signatures.size,heldModernFullArticles:modern.filter(e=>e.canBundle===false).length,heldTranslations:translations.length,nativeReviewClaims:0,mediaImported:0,audioImported:0,standaloneLibraryBuild:'Conversion completed but final atomic directory rename failed with EPERM twice on Windows; not a passing build.'});
console.log(JSON.stringify({guerberWorks:entries.length,guerberTokens:entries.reduce((n,e)=>n+e.difficulty.tokenCount,0),albanianTranslationSources:translations.length,thaiReviews:thai.entries.length,reviewEntries:queue.length}));
}
