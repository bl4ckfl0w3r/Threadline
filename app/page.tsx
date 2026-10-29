'use client';
import { ArrowUpRight, ArrowRight } from '@/components/threadline/icons';
import { Brand } from '@/components/threadline/brand';

export default function Home() {
  return <main className="entry">
    <header className="entry-header"><Brand/><span>Investigation, with cultural intelligence.</span></header>
    <div className="entry-layout">
      <section className="entry-message">
        <h1>Follow the<br/>thread.</h1>
        <p>Cultural clues reorder the places worth checking. Records decide what happened.</p>
        <div className="entry-actions">
          <a className="entry-demo" href="/demo"><span>Show me the demo</span><ArrowRight size={28}/></a>
          <a className="entry-workspace" href="/workspace"><span>Open workspace</span><ArrowUpRight size={24}/></a>
        </div>
      </section>
      <section className="entry-evidence" aria-label="A glimpse of the fictional demonstration">
        <div className="evidence-clip"><span>From a fictional case</span><span>London · 8 September</span></div>
        <div className="memory-sheet"><p className="slip-text"><span>R41</span><span>17:__</span></p><span className="missing-caption">The slip that came with screening drive SD-2716. Its venue line is torn off, and five cinemas handled similar cases that afternoon.</span></div>
        <div className="reference-strips"><span>Interstellar <small>Film</small></span><span>Inception <small>Film</small></span><span>Daft Punk <small>Music</small></span></div>
        <div className="unknown-place"><span className="unknown-glyph" aria-hidden="true">?</span><span>Which site’s records<br/>should we inspect first?</span></div>
      </section>
    </div>
    <footer className="entry-footer"><span>Built with Qloo</span><span>A clue → an order to check → a record to request</span></footer>
  </main>;
}
