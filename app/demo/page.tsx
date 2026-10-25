'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Minus, Plus, X } from '@phosphor-icons/react';
import { Brand } from '@/components/threadline/brand';
import type { DemoData } from '@/lib/demo';
import type { Query } from '@/lib/contracts';

const chapters=['The gap','The references','The comparison','The source','The enquiry'];
function ResultList({data,query}:{data:DemoData;query:Query}) {
  const list=useRef<HTMLOListElement>(null);
  const positions=useRef<Map<string,number>>(new Map());
  const signature=query.leadIds.join('|');
  useLayoutEffect(()=>{
    if(!list.current)return;
    const next=new Map<string,number>();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.current.querySelectorAll<HTMLElement>('[data-place]').forEach(row=>{
      const id=row.dataset.place!,top=row.offsetTop;
      next.set(id,top);
      const previous=positions.current.get(id);
      if(!reduced&&positions.current.size){
        row.getAnimations().forEach(a=>a.cancel());
        if(previous!==undefined&&previous!==top)row.animate([{transform:`translateY(${previous-top}px)`},{transform:'translateY(0)'}],{duration:620,easing:'cubic-bezier(.22,1,.36,1)'});
        else if(previous===undefined)row.animate([{opacity:0,transform:'translateX(26px)'},{opacity:1,transform:'translateX(0)'}],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'});
      }
    });
    positions.current=next;
  },[signature]);
  return <div className="demo-results"><div className="result-heading"><span>{query.label}</span><span>{query.leadIds.length} returned</span></div><ol ref={list}>{query.leadIds.slice(0,5).map((id,i)=>{const lead=data.leads.find(l=>l.id===id);return <li key={id} data-place={id} className={id===data.candidateId?'highlighted':''}><span className="rank">{i+1}</span><span>{lead?.name||'Unnamed place'}</span>{id===data.candidateId&&<ArrowUpRight size={20}/>}</li>;})}</ol><p>First five results · Position is not visit probability</p></div>;
}

export default function Demo() {
  const [data,setData]=useState<DemoData|null>(null),[error,setError]=useState('');
  const [stage,setStage]=useState(0),[single,setSingle]=useState(false);
  const [answer,setAnswer]=useState<'supported'|'conflict'|'unknown'|null>(null);
  const title=useRef<HTMLHeadingElement>(null),previousStage=useRef(0);
  async function load(){setError('');try{const r=await fetch('/api/demo');const d=await r.json() as {demo?:DemoData;error?:string};if(!r.ok||!d.demo)throw new Error(d.error||'The demonstration could not be loaded.');setData(d.demo);}catch(e){setError(e instanceof Error?e.message:'The demonstration could not be loaded.');}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(previousStage.current!==stage){title.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});previousStage.current=stage;}},[stage]);
  const joint=data?.queries.find(q=>q.id===data.jointId),subset=data?.queries.find(q=>q.id===data.singleId);
  const query=single?subset:joint;
  const candidate=data?.leads.find(l=>l.id===data.candidateId);
  const activeClue=data?.clues.find(c=>subset?.clueIds.includes(c.id));
  const withdrawn=data?.clues.find(c=>joint?.clueIds.includes(c.id)&&!subset?.clueIds.includes(c.id));
  const candidateRank=subset&&data?subset.leadIds.indexOf(data.candidateId)+1:0;
  const titles=['One stop. No name.','Two references.','Change one input.','Check the source.','A next enquiry.'];
  function go(next:number){setStage(next);if(next<2)setSingle(false);}
  return <div className={`demo-shell scene-${stage}`}>
    <header className="demo-header"><Brand/><a className="text-button" href="/workspace">Open workspace <ArrowUpRight size={18}/></a><a className="icon-button" href="/" aria-label="Close demonstration"><X size={22}/></a></header>
    <main className="demo-main">
      {!data?<section className="demo-loading"><h1>{error?'Demo unavailable':'Opening the case'}</h1><p>{error||'Loading recorded research.'}</p>{error&&<button className="button primary" onClick={load}>Try again <ArrowRight size={18}/></button>}</section>:<>
      <div className="demo-story"><h1 ref={title} tabIndex={-1}>{titles[stage]}</h1>
        {stage===0&&<><p>A missing camera bag. A remembered evening. Which place’s records could help reconstruct it?</p><div className="demo-location"><span>{data.area}</span><span>1–21 September · 5–10 pm</span></div></>}
        {stage===1&&<><p>Two listening interests, explicitly supplied by the witness, give Qloo a starting point.</p><p className="demo-note">The place still needs to fit the account.</p></>}
        {stage===2&&<><p>Could combining the references hide a useful place? Remove one and compare.</p>{single&&<p className="demo-finding" role="status"><strong>{candidate?.name}</strong> appears at position {candidateRank}. It was absent from the combined query and area-only top {joint?.leadIds.length}.</p>}</>}
        {stage===3&&<><p>The place’s own website supports books and music. The date still needs checking.</p><div className="source-verdict"><Check size={20}/><span>Activity supported</span></div><div className="source-verdict unresolved"><span>?</span><span>Date and visit unresolved</span></div></>}
        {stage===4&&<><p>A lead becomes useful when it points to a record someone can check.</p><p className="demo-note">No visit or place of loss has been established.</p></>}
      </div>
      <div className="demo-evidence">
        {stage===0&&<section className="demo-account"><div className="document-meta"><span>Fictional reported account</span><span>{data.area}</span></div><h2>{data.title}</h2><p className="remembered-activity">{data.activity}</p><div className="missing-timeline"><span>Bag packed</span><span className="missing-interval">Unknown stop</span><span>Loss noticed</span></div><details><summary>Read the account <Plus size={17}/></summary><p>{data.notes}</p></details></section>}
        {(stage===1||stage===2)&&<div className="comparison-exhibit"><div className="demo-clues"><button className={`clue-strip ${single?'removed':''}`} disabled={stage!==2} aria-pressed={!single} onClick={()=>setSingle(!single)} aria-label={`${single?'Restore':'Withdraw'} ${withdrawn?.label}`}><span className="clue-text" aria-hidden="true">{withdrawn?.label.split(' ').map((word,i)=><span key={word} style={{'--fragment':i} as React.CSSProperties}>{word} </span>)}</span>{stage===2?(single?<Plus size={20}/>:<Minus size={20}/>):<Check size={18}/>}</button><div className="clue-strip kept"><span>{activeClue?.label}</span><Check size={18}/></div></div>{stage===2&&<span className="comparison-hint">{single?'One reference withdrawn — click to restore it.':'Click the first reference to withdraw it.'}</span>}{query&&<ResultList data={data} query={query}/>}</div>}
        {stage===3&&<article className="demo-source"><div className="document-meta"><span>Recorded public source</span><span>{data.source.capturedAt}</span></div><h2>{candidate?.name}</h2><p className="source-passage">{data.source.excerpt.replace(/^Recorded research summary:\s*/,'')}</p><div className="source-caveat"><h3>Still unverified</h3><p>{data.source.note}</p></div><a className="text-button" href={data.source.url} target="_blank" rel="noopener noreferrer">Open the source <ArrowUpRight size={18}/></a></article>}
        {stage===4&&<section className="demo-enquiry"><h2>{candidate?.name}</h2><p className="enquiry-question">Which event listings could confirm a books-and-live-music evening during the reported dates?</p><p>If the date fits, look for a receipt, booking or other case-linked record.</p><fieldset className="answer-branches"><legend>Suppose the record…</legend><button aria-pressed={answer==='supported'} onClick={()=>setAnswer('supported')}>Supports it <ArrowUpRight size={17}/></button><button aria-pressed={answer==='conflict'} onClick={()=>setAnswer('conflict')}>Conflicts <ArrowUpRight size={17}/></button><button aria-pressed={answer==='unknown'} onClick={()=>setAnswer('unknown')}>Is unavailable <ArrowUpRight size={17}/></button></fieldset>{answer&&<div className="branch-response" key={answer} role="status">{answer==='supported'?'Next: seek a case-linked record. An event listing alone does not establish attendance.':answer==='conflict'?'Next: recheck the date recollection and inspect another candidate. Keep the conflicting source.':'Next: keep this lead unresolved and try another source or candidate.'}</div>}</section>}
      </div>
      </>}
    </main>
    {data&&<footer className="demo-controls"><div className="demo-provenance"><span>Fictional case · Recorded Qloo responses</span><details><summary>Evidence details</summary><div className="demo-provenance-body"><p>This walkthrough replays recorded queries. It is not a live agent run.</p><p>The shortlist changed. A visit, recovered property and comparative time saving were not established.</p>{data.queries.map(q=><div key={q.id}><strong>{q.label}</strong><code>{q.receiptId}</code></div>)}</div></details></div><nav className="chapter-nav" aria-label="Demo chapters">{chapters.map((chapter,i)=><button key={chapter} className={stage===i?'active':''} aria-current={stage===i?'step':undefined} aria-label={chapter} onClick={()=>{if(i>=3)setSingle(true);go(i);}}><span>{chapter}</span></button>)}</nav><div className="demo-step-actions"><button className="icon-button" aria-label="Previous chapter" disabled={stage===0} onClick={()=>go(stage-1)}><ArrowLeft size={23}/></button>{stage<4?<button className="button primary" disabled={stage===2&&!single} onClick={()=>go(stage+1)}>{stage===0?'Follow the detail':stage===1?'Test the references':stage===2?'Inspect the new place':'Form an enquiry'}<ArrowRight size={20}/></button>:<a className="button primary" href="/workspace">Open workspace <ArrowUpRight size={20}/></a>}</div></footer>}
  </div>;
}
