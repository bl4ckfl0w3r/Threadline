import type{ComparisonIntake}from'../../lib/comparison-case.ts';
export function comparisonFixture():ComparisonIntake {
 const proof={receiptId:'synthetic-identity-fixture',capturedAt:'2026-10-25T18:00:00Z'};
 return {version:1,studyId:'CH01',fictional:true,title:'Fictional test intake',question:'Which records should be checked?',notes:'Fictional test intake. No venue or outcome is known.',known:'Five supplied sites. No preference-to-booking link is established.',gap:'Identify a case-linked record.',area:'London',latitude:51.515,longitude:-0.095,radius:8000,date:'2026-09-08',activity:'Cinema preview',category:'all_places',
 references:[['Interstellar','movie',2014],['Inception','movie',2010],['Daft Punk','artist',undefined]].map(([label,kind,year],i)=>({label:label as string,entityName:label as string,kind:kind as 'movie'|'artist',entityId:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,...(year?{year:Number(year)}:{}),origin:'Fictional self-report; no preference-to-booking link observed.',reliability:'Self-report; attendance unknown.',proof:{...proof}})),
 candidates:Array.from({length:5},(_,i)=>({entityId:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:`Test cinema ${i+1}`,address:`${i+1} Test Road`,proof:{...proof}}))};
}
