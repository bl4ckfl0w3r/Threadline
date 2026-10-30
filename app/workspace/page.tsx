'use client';
import { ArrowRight, ArrowUpRight, Check, ClipboardText, Compass, DownloadSimple, FileText, FolderOpen, MagnifyingGlass, Plus, Quotes, X } from '@/components/threadline/icons';
import { Brand, ThreadMark } from '@/components/threadline/brand';
import { useWorkspace } from '@/components/threadline/use-workspace';
import { AgentPanel, CaseView, LeadsView, SourcesView, EnquiryView } from '@/components/threadline/workspace-views';
import type { Step } from '@/lib/contracts';

const stages = [
  { id:'case' as Step, label:'Case', icon:FileText },
  { id:'leads' as Step, label:'Leads', icon:Compass },
  { id:'sources' as Step, label:'Sources', icon:Quotes },
  { id:'enquiry' as Step, label:'Enquiry', icon:ArrowUpRight },
];
export default function Workspace() {
  const w = useWorkspace();
  const { file, disabled, step } = w;
  return <div className="workbench">
    <a className="skip-link" href="#work-area">Skip to case</a>
    <nav className="work-rail" aria-label="Investigation stages">
      <a className="rail-brand" href="/" aria-label="Threadline home"><ThreadMark/></a>
      <div className="rail-stages">{stages.map(s=><button key={s.id} className={step===s.id?'active':''} onClick={()=>w.goToStep(s.id)} disabled={!file} aria-current={step===s.id?'step':undefined}><s.icon size={23}/><span>{s.label}</span></button>)}</div>
      <button className="rail-cases" onClick={()=>w.menuRef.current?.showModal()} aria-label="Open cases"><FolderOpen size={23}/><span>Cases</span></button>
    </nav>
    <div className="work-body">
      <header className="work-header"><Brand/><button className="case-switch" onClick={()=>w.menuRef.current?.showModal()}><FolderOpen size={18}/><span>{file?.title||'Your cases'}</span></button><div className="work-utilities"><span className="save-status">{w.dirty?'Unsaved changes':file?'Saved':''}</span><button className="text-button" disabled={disabled||!w.dirty} onClick={w.saveClick}><Check size={17}/>Save</button><button className="icon-button" disabled={disabled||!file} onClick={w.download} aria-label="Export case brief"><DownloadSimple size={20}/></button><a className="text-button demo-shortcut" href="/demo">Demo <ArrowUpRight size={17}/></a></div></header>
      <main id="work-area" className="work-canvas" aria-busy={disabled}>
        {w.error&&<div className="feedback error" role="alert"><span>{w.error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>w.setError('')}><X size={18}/></button></div>}
        {w.notice&&<div className="feedback" role="status">{w.notice}</div>}
        {w.busy&&<div className="working-status" role="status"><span className="working-mark"/>{w.busy}</div>}
        {!file?<section className="workspace-empty"><h1>{w.busy?'Opening your workspace':'Workspace unavailable'}</h1>{!w.busy&&<button className="button primary" onClick={w.boot}>Try again <ArrowRight size={18}/></button>}</section>:<>
          <div className="work-heading" ref={w.headingRef}><div><h1>{step==='case'?file.title:step==='leads'?'Places to investigate':step==='sources'?'Source review':'The next enquiry'}</h1>{step==='case'&&<p>{file.question}</p>}</div><span className="case-mode">{file.mode==='recorded'?'Fictional case':'Working case'}</span></div>
          {step==='case'&&<CaseView w={w}/>}
          {step==='leads'&&<LeadsView w={w}/>}
          {step==='sources'&&<SourcesView w={w}/>}
          {step==='enquiry'&&<EnquiryView w={w}/>}
          <AgentPanel w={w}/>
          {!!file.activityLog.length&&<details className="activity-log"><summary>Research history <span>{file.activityLog.length} actions</span></summary>{file.activityLog.slice(-16).reverse().map(a=><div className="history-row" key={a.id}><div><strong>{a.title}</strong><p>{a.detail}</p></div><time>{new Date(a.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div>)}</details>}
        </>}
      </main>
    </div>
    <dialog className="cases-dialog" ref={w.menuRef} aria-labelledby="cases-title" onClick={e=>{if(e.target===e.currentTarget)w.menuRef.current?.close();}}><div className="dialog-heading"><h2 id="cases-title">Your cases</h2><button className="icon-button" aria-label="Close cases" onClick={()=>w.menuRef.current?.close()}><X size={23}/></button></div><button className="button primary" disabled={disabled} onClick={()=>w.create()}>New case <Plus size={18}/></button><nav className="case-list" aria-label="Saved cases">{w.cases.map(c=><button key={c.id} disabled={disabled} aria-current={file?.id===c.id?true:undefined} onClick={()=>w.switchCase(c.id)}><span>{c.title}<small>{c.mode==='recorded'?'Fictional example':'Working case'}</small></span><ArrowUpRight size={20}/></button>)}</nav><button className="text-button" disabled={disabled} onClick={()=>w.create(true)}>Create example case <Plus size={17}/></button><div className="connection-status"><span>Qloo: {w.services?.qloo?'connected':'unavailable'}</span><span>Model: {w.services?.model?'connected':'not connected'}</span></div></dialog>
  </div>;
}
