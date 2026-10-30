// Providers sometimes wrap JSON in a code fence despite response_format.
export function parseModelJson(content:string):unknown {
  const text=content.trim();
  try{return JSON.parse(text);}catch{}
  const fenced=text.match(/^```[a-z]*\s*([\s\S]*?)\s*```$/i)?.[1];
  if(fenced!==undefined)return JSON.parse(fenced);
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)throw new SyntaxError('No JSON object in the model reply.');
  return JSON.parse(text.slice(start,end+1));
}

const place='(?:your|this|the)\\s+(?:[a-z-]+\\s+)?(?:venue|premises|shop|store|bookshop|cinema|theatre|gallery|bar|cafe|site|branch|location|museum)';
const overclaims=[
  new RegExp(`\\b(?:hosted|held|staged|took place|happened|occurred)\\s+(?:at|in|by)\\s+(?:${place}|you\\b)`,'i'),
  new RegExp(`\\b(?:delivered|dropped off|handed over|signed for|left)\\s+(?:[a-z0-9-]+\\s+){0,3}?(?:to|at|with|by)\\s+(?:${place}|you\\b|your\\b)`,'i'),
  /\b(?:you|your\s+[a-z-]+)\s+(?:hosted|held|received|accepted|signed for|took delivery)\b/i,
  /\b(?:courier|driver|note|worksheet|records?|log|invoice|receipt|manifest)s?\s+(?:confirm|confirms|confirmed|prove|proves|proved|establish|establishes|established|show|shows|showed|reported delivering|reports delivering)\b/i,
];
const hedge=/\b(?:whether|if|might|may|possibly|perhaps|appears?|suggests?|unconfirmed|unverified|not established|or not|do not|does not|did not|has not|have not|cannot)\b/i;
const asked=/^\s*(?:and\s+)?(?:was|were|did|do|does|has|have|is|are|had)\b/i;

// Sentences that state an unverified link between this place and the case.
// Checked per clause: a hedge elsewhere in the sentence does not excuse a claim.
export function draftOverclaims(draft:string):string[] {
  const found:string[]=[];
  for(const sentence of draft.split(/(?<=[.!?])\s+|\n+/)){
    const question=sentence.trim().endsWith('?');
    const clauses=sentence.split(/[,;:]|\s[—–-]\s/);
    if(clauses.some(clause=>overclaims.some(p=>p.test(clause))&&!hedge.test(clause)&&!(question&&asked.test(clause))))found.push(sentence.trim());
  }
  return found;
}
