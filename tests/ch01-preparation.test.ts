import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingFinding,readableStudyText,inspectionReason,decisionReason } from '../scripts/prepare-ch01-demo.mjs';
const expected={date:'2026-09-08',customer:'Fictional Customer',item:'TEST-2716',slip:'R41'};
function ledger(item:string,date='2026-09-08',customer='Fictional Customer') {
 return [{id:'fictional-record',type:'receiving ledger',text:`row | date | time | customer | item | bay | slip\n13 | ${date} | 17:16 | ${customer} | ${item} | P4 | R41\nMargin: orange latch noted on B8.`}];
}
test('receiving findings follow the item and corroborating fields, independent of venue IDs',()=>{
 assert.equal(receivingFinding(ledger('TEST-2716'),expected),'match');
 assert.equal(receivingFinding(ledger('TEST-2716','2026-09-07','Other customer'),expected),'related');
 assert.equal(receivingFinding(ledger('TEST-2176'),expected),'nothing_relevant');
 assert.equal(receivingFinding(ledger('TEST-2719'),expected),'nothing_relevant');
 assert.equal(receivingFinding(ledger('TEST-2718'),expected),'nothing_relevant');
 assert.equal(receivingFinding([],expected),'nothing_relevant');
 // A neighbouring non-matching row cannot conceal a true match elsewhere.
 const docs=ledger('TEST-2176');docs[0].text+='\n14 | 2026-09-08 | 17:20 | Fictional Customer | TEST-2716 | P5 | R41';
 assert.equal(receivingFinding(docs,expected),'match');
});
test('the shared latch note alone never promotes a different serial to a related finding',()=>{
 assert.equal(receivingFinding(ledger('OTHER-1'),expected),'nothing_relevant');
});
test('reader-facing study text uses venue names and inspection purposes omit score noise',()=>{
 const candidates=[{id:'L01',name:'Cinema One'},{id:'L04',name:'Cinema Four'}];
 assert.equal(readableStudyText('L04 moved ahead of L01.',candidates),'Cinema Four moved ahead of Cinema One.');
 assert.equal(readableStudyText('L04: record CH01-L04-D01.',candidates),'Cinema Four: record CH01-L04-D01.');
 const reason=inspectionReason('L04 is first (affinity 0.814441); inspect its receiving records for a matching item.',candidates);
 assert.equal(reason,'Inspect its receiving records for a matching item.');
 assert.doesNotMatch(reason,/L0[14]|affinity|0\.814441/);
 assert.equal(inspectionReason('L01 contained another item; continue to the next candidate in the listed order.',candidates),'Continue to the next candidate in the listed order.');
 assert.equal(decisionReason('Interpret the assigned intake','Proceed to resolve exact names',candidates),'Interpret the assigned intake. Proceed to resolve exact names.');
});
