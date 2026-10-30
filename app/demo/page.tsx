'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowUpRight, Check, Minus, Plus, X } from '@/components/threadline/icons';
import { Brand } from '@/components/threadline/brand';
import type { DemoDataV2, DemoQuery, DemoRecord } from '@/lib/contracts';
import { buildDemoV2 } from '@/lib/demo-v2';
import { humanDate } from '@/components/threadline/format';

const chapters = ['The drive', 'The sites', 'The organiser', 'The reorder', 'The inspections', 'The record', 'The next request'];
const titles = ['One drive. No venue.', 'Five sites. Three checks.', 'She chose the cinema.', 'Add her favourites.', 'Three orders.', 'The entry matches.', 'One record to request.'];
type Branch = 'confirming' | 'conflicting' | 'unavailable';
const fieldOrder = ['item', 'customer', 'date', 'slip', 'time'];

function siteName(data: DemoDataV2, leadId: string) { return data.candidates.find(c => c.leadId === leadId)?.name || leadId; }
/** Record text uses site IDs ("L04"); readers see the site's name. */
function named(data: DemoDataV2, text: string) { return text.replace(/(?<![\w-])L\d{2}(?![\w-])/g, id => data.candidates.find(c => c.leadId === id)?.name || id); }
const key = (label: string) => label.trim().toLowerCase();
const sentenceCase = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
function receiving(data: DemoDataV2, leadId: string) { return data.records.find(r => r.leadId === leadId && key(r.type) === 'receiving ledger'); }
function field(record: DemoRecord | undefined, name: string) { return record?.fields.find(f => key(f.label) === name); }
/** The serial an inspection found, plus the first other detail that disagrees when the serial itself is right. */
function slotDetail(data: DemoDataV2, leadId: string) {
  const record = receiving(data, leadId), item = field(record, 'item')?.value;
  const off = item === data.intake.item ? record?.fields.find(f => f.matchesIntake === false) : undefined;
  return { item, off: off ? (key(off.label) === 'date' ? humanDate(off.value, false) : off.value) : undefined, differs: !!item && item !== data.intake.item };
}
/** The slip keeps the hour ("17:__"), so a recorded time can be checked against it. */
function timeCheck(data: DemoDataV2, value: string) {
  const partial = data.intake.slip.visible.find(v => /^\d{1,2}:_+$/.test(v));
  return partial ? value.startsWith(partial.split(':')[0] + ':') : undefined;
}

/** The five sites in Qloo's order, with sites the response didn't return listed beneath. */
function Ranking({ data, query }: { data: DemoDataV2; query: DemoQuery }) {
  const list = useRef<HTMLOListElement>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const returned = query.order.map(o => o.leadId);
  const missing = data.candidates.map(c => c.leadId).filter(id => !returned.includes(id));
  const signature = query.id;
  useLayoutEffect(() => {
    if (!list.current) return;
    const next = new Map<string, number>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.current.querySelectorAll<HTMLElement>('[data-place]').forEach(row => {
      const id = row.dataset.place!, top = row.offsetTop;
      next.set(id, top);
      const previous = positions.current.get(id);
      if (!reduced && positions.current.size && previous !== undefined && previous !== top) {
        row.getAnimations().forEach(a => a.cancel());
        row.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    });
    positions.current = next;
  }, [signature]);
  return <div className="demo-results">
    <div className="result-heading"><span>{query.label}</span><span>{returned.length} of {data.candidates.length} returned</span></div>
    <ol ref={list}>
      {[...returned, ...missing].map(id => {
        const rank = query.order.find(place => place.leadId === id)?.rank || 0, before = data.control.order.find(place => place.leadId === id)?.rank || 0;
        const moved = query.role === 'seeded' && rank && before && before !== rank;
        return <li key={id} data-place={id} className={`${id === data.highlightedLeadId ? 'highlighted' : ''} ${rank ? '' : 'not-returned'}`}>
          <span className="rank">{rank || '–'}</span>
          <span>{siteName(data, id)}</span>
          {rank ? moved ? <span className="movement">{before > rank ? `↑ from ${before}` : `↓ from ${before}`}</span> : null : <span className="movement">Not returned</span>}
        </li>;
      })}
    </ol>
    <p>Position in Qloo’s response, not a likelihood of a visit. A site that wasn’t returned is not ruled out.</p>
  </div>;
}

function Inspections({ data }: { data: DemoDataV2 }) {
  const [listed, qloo] = data.arms;
  // The unrun queue is shown as an order only: no inspection outcomes are drawn for it.
  const queue = data.control.order.slice(0, data.inspectionBudget).map((o, i) => ({ order: i + 1, leadId: o.leadId, found: undefined }));
  const rows = [
    { key: 'listed', label: listed.label, note: 'Recorded run', slots: listed.inspections, outcome: named(data, listed.outcome) },
    { key: 'control', label: 'Qloo order without the references', note: 'Not run · the order only', slots: queue, outcome: named(data, data.provenance.counterfactual) },
    { key: 'qloo', label: qloo.label, note: 'Recorded run', slots: qloo.inspections, outcome: named(data, qloo.outcome) },
  ];
  return <div className="inspection-board">
    {rows.map((row, r) => <section key={row.key} className={`inspection-row ${row.key}`} style={{ '--row': r } as React.CSSProperties} aria-label={row.label}>
      <div className="inspection-label"><strong>{row.label}</strong><span>{row.note}</span></div>
      <ol>{row.slots.map((slot, i) => {
        const d = slotDetail(data, slot.leadId);
        return <li key={slot.order} className={`slot ${slot.found || 'queued'} ${slot.found && (d.differs || d.off) ? 'differs' : ''}`} style={{ '--slot': r * 3 + i } as React.CSSProperties}>
          <span className="slot-number">{slot.order}</span>
          <span className="slot-site">{siteName(data, slot.leadId)}</span>
          {slot.found && <span className="slot-item">{slot.found === 'match' && <Check size={15} weight="bold" />}{d.item}</span>}{slot.found && d.off && <span className="slot-off">{d.off}</span>}
        </li>;
      })}</ol>
      <p>{row.outcome}</p>
    </section>)}
  </div>;
}

/** Checks until the record, one line per order: counts from the recorded runs; the unrun Qloo order shows its position only. */
function Scoreboard({ data }: { data: DemoDataV2 }) {
  const [listed, qloo] = data.arms, target = data.highlightedLeadId;
  const reached = (arm: typeof listed) => arm.inspections.find(i => i.leadId === target && i.found === 'match')?.order;
  const listedAt = reached(listed), qlooAt = reached(qloo);
  const controlAt = data.control.order.findIndex(o => o.leadId === target) + 1;
  const rows = [
    { label: 'Listed order', value: listedAt ? `Check ${listedAt}` : 'Not reached', note: listedAt ? 'Recorded run' : `In ${data.inspectionBudget} checks · recorded run` },
    { label: 'Qloo, no favourites', value: controlAt > 0 && controlAt <= data.inspectionBudget ? `Check ${controlAt}` : 'Not reached', note: 'Order only · not run' },
    { label: 'Qloo, with favourites', value: qlooAt ? `Check ${qlooAt}` : 'Not reached', note: 'Recorded run' },
  ];
  return <dl className="checks-score" aria-label={`Checks until the ${siteName(data, target)} record`}>
    {rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd><strong>{r.value}</strong><span>{r.note}</span></dd></div>)}
  </dl>;
}

function Ledger({ data }: { data: DemoDataV2 }) {
  const record = receiving(data, data.highlightedLeadId);
  if (!record) return null;
  // Rendered from the structured fields; lines of the excerpt that aren't table rows are shown as notes.
  const notes = record.excerpt.split('\n').filter(l => l.trim() && !l.includes('|'));
  const checks = record.fields.map(f => ({ ...f, matchesIntake: f.matchesIntake ?? (key(f.label) === 'time' ? timeCheck(data, f.value) : undefined) }))
    .filter(f => f.matchesIntake !== undefined).sort((x, y) => fieldOrder.indexOf(key(x.label)) - fieldOrder.indexOf(key(y.label)));
  const matches = record.fields.some(f => f.matchesIntake !== undefined) && record.fields.every(f => f.matchesIntake !== false);
  return <article className="demo-ledger">
    <div className="document-meta"><span>Fictional record · {record.type}</span><span>{record.id}</span></div>
    <h2>{siteName(data, record.leadId)}</h2>
    <div className="ledger-scroll" tabIndex={0} role="region" aria-label="Receiving ledger rows">
      <table>
        <thead><tr>{record.fields.map(f => <th key={f.label} scope="col">{sentenceCase(f.label)}</th>)}</tr></thead>
        <tbody><tr className={matches ? 'match-row' : ''}>{record.fields.map(f => <td key={f.label}>{f.value}</td>)}</tr></tbody>
      </table>
    </div>
    {notes.map(n => <p key={n} className="ledger-note">{n}</p>)}
    <ul className="field-checks">{checks.map((f, i) => <li key={f.label} className={f.matchesIntake ? 'agrees' : 'differs'} style={{ '--field': i } as React.CSSProperties}>
      {f.matchesIntake ? <Check size={16} weight="bold" /> : <X size={16} weight="bold" />}<span>{sentenceCase(f.label)}</span><strong>{f.value}</strong>
    </li>)}</ul>
  </article>;
}

export default function Demo() {
  const [data, setData] = useState<DemoDataV2 | null>(null), [error, setError] = useState('');
  const [stage, setStage] = useState(0), [seeded, setSeeded] = useState(false), [branch, setBranch] = useState<Branch | null>(null);
  const title = useRef<HTMLHeadingElement>(null), previousStage = useRef(0);
  async function load() {
    setError('');
    try {
      const r = await fetch('/api/demo?version=2');
      const d = await r.json() as { demo?: unknown; error?: string; code?: string };
      if (r.status === 503 || d.code === 'demo_unavailable') throw new Error('The recorded case isn’t installed in this environment yet.');
      const demo = r.ok ? buildDemoV2(d.demo) : null;
      if (!demo) throw new Error(d.error || 'The demonstration could not be loaded.');
      setData(demo);
    } catch (e) { setError(e instanceof Error ? e.message : 'The demonstration could not be loaded.'); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (previousStage.current !== stage) { title.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); previousStage.current = stage; } }, [stage]);
  function go(next: number) { setStage(next); setSeeded(next > 3); if (next !== 6) setBranch(null); }
  const last = chapters.length - 1;
  const highlighted = data ? siteName(data, data.highlightedLeadId) : '';
  const controlRank = data?.control.order.find(o => o.leadId === data.highlightedLeadId)?.rank || 0;
  const seededRank = data?.seeded.order.find(o => o.leadId === data.highlightedLeadId)?.rank || 0;
  const position = (rank:number) => ['', 'first', 'second', 'third'][rank] || `position ${rank}`;
  const next = stage === 3 && !seeded
    ? { label: 'Add her favourites', run: () => setSeeded(true) }
    : { label: ['Meet the sites', 'Who chose the venue', 'Ask Qloo', 'Inspect three sites', 'Read the entry', 'What’s still open'][stage], run: () => go(stage + 1) };

  return <div className={`demo-shell scene-${stage}`}>
    <header className="demo-header"><Brand /><a className="text-button" href="/workspace">Open workspace <ArrowUpRight size={18} /></a><a className="icon-button" href="/" aria-label="Close demonstration"><X size={22} /></a></header>
    <main className="demo-main">
      {!data ? <section className="demo-loading"><h1>{error ? 'Demo unavailable' : 'Opening the case'}</h1><p>{error || 'Loading the recorded case.'}</p>{error && <button className="button primary" onClick={load}>Try again <ArrowRight size={18} /></button>}</section> : <>
        <div className="demo-story"><h1 ref={title} tabIndex={-1}>{titles[stage]}</h1>
          {stage === 0 && <><p>{data.intake.summary}</p><p className="demo-note">Which site’s records should be checked first?</p></>}
          {stage === 1 && <><p>The courier’s export names five London cinemas. Each keeps the same three records, and there’s time to inspect three sites.</p><p className="demo-note">Nothing in the case tells them apart.</p></>}
          {stage === 2 && <><p>{data.bridge}</p><p className="demo-note">So her taste can change which site we check first. It can’t tell us where the drive went.</p></>}
          {stage === 3 && <><p>Same five sites, same area. Qloo ranks them without her favourites, then with them.</p>{seeded ? <p className="demo-finding" role="status"><strong>{highlighted}</strong> moves from {position(controlRank)} to {position(seededRank)}.</p> : <p className="demo-note">Without her favourites, {siteName(data, data.control.order[0].leadId)} comes first.</p>}</>}
          {stage === 4 && <><p>Both recorded runs inspect three sites. Most misses list a different serial; one lists the right serial on another day for another customer.</p><Scoreboard data={data} /></>}
          {stage === 5 && <><p>The receiving entry agrees with the intake on item, customer, date and slip. The time fits the torn “17:__”.</p><p className="demo-note">The orange-latch note refers to bay B8, not this entry’s bay P4.</p></>}
          {stage === 6 && <><p>The handover to the site is supported. Where the drive went next isn’t.</p><p className="demo-note">Onward delivery and recovery remain unestablished.</p></>}
        </div>
        <div className="demo-evidence">
          {stage === 0 && <section className="demo-account intake">
            <div className="document-meta"><span>Fictional intake</span><span>{data.intake.area}</span></div>
            <h2>{data.title}</h2>
            <p className="remembered-activity">{data.intake.item}</p>
            <dl className="intake-facts"><div><dt>Handover</dt><dd>{humanDate(data.intake.handoverDate)}</dd></div><div><dt>Case</dt><dd>{data.intake.caseDescription}</dd></div></dl>
            <div className="torn-slip" aria-label={`Torn slip reading ${data.intake.slip.visible.join(' and ')}; the ${data.intake.slip.missing} is missing`}>
              <div className="slip-line">{data.intake.slip.visible.map(v => <span key={v}>{v}</span>)}</div>
              <div className="slip-missing" aria-hidden="true">Venue ··········</div>
            </div>
            <span className="slip-caption">The {data.intake.slip.missing} is torn off.</span>
          </section>}
          {stage === 1 && <section className="site-roster">
            <div className="result-heading"><span>Courier’s export, as listed</span><span>{data.candidates.length} sites</span></div>
            <ol>{data.candidates.map(c => <li key={c.leadId}><span className="rank">{c.listedPosition}</span><span><strong>{c.name}</strong><small>{c.address}</small></span></li>)}</ol>
            <div className="budget"><span>Inspections available</span><div aria-label={`${data.inspectionBudget} inspections available`}>{Array.from({ length: data.inspectionBudget }, (_, i) => <span key={i} className="empty-slot" />)}</div></div>
          </section>}
          {stage === 2 && <section className="organiser">
            <div className="organiser-card"><span className="paper-label">The organiser</span><p>Chose and booked the cinema</p><span className="missing-caption">Booking email: not recovered</span></div>
            <div className="reference-strips">{data.references.map((r, i) => <span key={r.id} style={{ '--strip': i } as React.CSSProperties}>{r.label}<small>{r.kind === 'movie' ? 'Film' : 'Music'} · her favourite</small></span>)}</div>
            <p className="organiser-link">Link from favourites to booking: <strong>not established</strong></p>
          </section>}
          {stage === 3 && <div className="comparison-exhibit">
            <button className={`clue-strip ${seeded ? 'kept' : 'removed'}`} aria-pressed={seeded} onClick={() => setSeeded(!seeded)}>
              <span>{seeded ? 'With her favourites' : 'Without her favourites'}<small>{data.references.map(r => r.label).join(' · ')}</small></span>{seeded ? <Minus size={20} /> : <Plus size={20} />}
            </button>
            <Ranking data={data} query={seeded ? data.seeded : data.control} />
          </div>}
          {stage === 4 && <><Inspections data={data} /><details className="agent-decisions"><summary>How the investigator decided <Plus size={17} /></summary><p className="muted">{data.provenance.runLabel}</p><ol>{data.agentDecisions.map(d => <li key={d.step}><strong>{named(data, d.action)}</strong><span>{named(data, d.reason)}</span></li>)}</ol></details></>}
          {stage === 5 && <Ledger data={data} />}
          {stage === 6 && <section className="demo-enquiry">
            <h2>Still open</h2>
            <p className="open-gap">{named(data, data.openQuestion)}</p>
            <p className="enquiry-question">{named(data, data.nextRequest.request)}</p>
            <fieldset className="answer-branches"><legend>Suppose the answer…</legend>
              {(['confirming', 'conflicting', 'unavailable'] as Branch[]).map(b => <button key={b} aria-pressed={branch === b} onClick={() => setBranch(b)}>{b === 'confirming' ? `Lists ${data.intake.item}` : b === 'conflicting' ? 'Doesn’t list it' : 'Isn’t available'} <ArrowUpRight size={17} /></button>)}
            </fieldset>
            {branch && <div className="branch-response" key={branch} role="status">{named(data, data.nextRequest[branch])}</div>}
          </section>}
        </div>
      </>}
    </main>
    {data && <footer className="demo-controls">
      <div className="demo-provenance"><span>Fictional case · Real venues and Qloo responses</span><details><summary>Evidence details</summary><div className="demo-provenance-body">
        <p>{data.provenance.realData} {data.provenance.fictionalData}</p>
        <p>{data.provenance.runLabel}</p>
        <p>{named(data, data.provenance.caveat)} {named(data, data.provenance.counterfactual)}</p>
        <p>Requests in the recorded run: {data.usage.qlooAttempts} to Qloo ({data.usage.qlooFailed} failed), {data.usage.webRequests} to the web.</p>
        {[data.control, data.seeded].map(q => <div key={q.id}><strong>{q.label}</strong><code>{q.receiptId} · {humanDate(q.capturedAt)}</code></div>)}
      </div></details></div>
      <nav className="chapter-nav" aria-label="Demo chapters">{chapters.map((chapter, i) => <button key={chapter} className={stage === i ? 'active' : ''} aria-current={stage === i ? 'step' : undefined} onClick={() => go(i)}><span>{chapter}</span></button>)}</nav>
      <div className="demo-step-actions">
        <button className="icon-button" aria-label="Previous chapter" disabled={stage === 0} onClick={() => go(stage - 1)}><ArrowLeft size={23} /></button>
        {stage < last
          ? <button className="button primary" onClick={next.run}>{next.label}<ArrowRight size={20} /></button>
          : <><button className="icon-button" aria-label="Replay from the start" onClick={() => go(0)}><ArrowClockwise size={22} /></button><a className="button primary" href="/workspace">Open the workspace <ArrowUpRight size={20} /></a></>}
      </div>
      {stage === last && <p className="handover-note">The demo reordered five known sites. The workspace finds places in an area you choose.</p>}
    </footer>}
  </div>;
}
