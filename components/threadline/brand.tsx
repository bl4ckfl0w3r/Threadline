import { useId } from 'react';

export function ThreadMark({ className = '' }: { className?: string }) {
  // An investigator's board: pins joined by sagging threads. The mask stops each thread at the edge of its pin.
  const mask = useId();
  return <svg className={className} width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><mask id={mask}><rect width="34" height="34" fill="white" /><circle cx="6" cy="8" r="3.4" fill="black" /><circle cx="25" cy="5" r="3.4" fill="black" /><circle cx="15" cy="17" r="3.4" fill="black" /><circle cx="29" cy="22" r="3.4" fill="black" /><circle cx="9" cy="28" r="3.4" fill="black" /></mask><path d="M6 8Q15.5 10.5 25 5M6 8Q9 14.5 15 17M25 5Q22 13 15 17M25 5Q30.5 13 29 22M15 17Q22.5 18 29 22M15 17Q14 24.5 9 28" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" mask={`url(#${mask})`} /><g stroke="currentColor" strokeWidth="2.2"><circle cx="6" cy="8" r="2.4" /><circle cx="25" cy="5" r="2.4" /><circle cx="15" cy="17" r="2.4" /><circle cx="29" cy="22" r="2.4" /><circle cx="9" cy="28" r="2.4" /></g></svg>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label="Threadline home"><ThreadMark /><span>threadline</span></a>;
}
