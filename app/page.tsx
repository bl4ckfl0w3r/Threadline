'use client';
import { ArrowUpRight, ArrowRight } from '@phosphor-icons/react';
import { Brand } from '@/components/threadline/brand';

export default function Home() {
  return <main className="entry">
    <header className="entry-header"><Brand/><span>Investigation, with cultural intelligence.</span></header>
    <div className="entry-layout">
      <section className="entry-message">
        <h1>Follow the<br/>thread.</h1>
        <p>Turn a remembered detail into a place worth checking.</p>
        <div className="entry-actions">
          <a className="entry-demo" href="/demo"><span>Show me the demo</span><ArrowRight size={28}/></a>
          <a className="entry-workspace" href="/workspace"><span>Open workspace</span><ArrowUpRight size={24}/></a>
        </div>
      </section>
      <section className="entry-evidence" aria-label="A glimpse of the fictional demonstration">
        <div className="evidence-clip"><span>From a fictional case</span><span>London</span></div>
        <div className="memory-sheet"><span className="paper-label">The remembered stop</span><p>Books.<br/>Live music.</p><span className="missing-caption">The place is still unknown.</span><div className="memory-cut"><span>1–21 September</span><span>5–10 pm</span></div></div>
        <div className="reference-strips"><span>Ryuichi Sakamoto <ArrowUpRight size={18}/></span><span>Ana Tijoux <ArrowUpRight size={18}/></span></div>
        <div className="unknown-place"><span className="unknown-glyph" aria-hidden="true">?</span><span>Which place’s records<br/>should we inspect next?</span></div>
      </section>
    </div>
    <footer className="entry-footer"><span>Built with Qloo</span><span>A detail → a place → a next enquiry</span></footer>
  </main>;
}
