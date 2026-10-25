export function ThreadMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M5 5h24M17 5v24M5 17h12L29 29" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" /></svg>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label="Threadline home"><ThreadMark /><span>threadline</span></a>;
}
