import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftOverclaims,parseModelJson,readModelReply} from '../lib/agent-replies.ts';
import {isLeadHost} from '../lib/source-hosts.ts';

test('model JSON is read plain, fenced or with surrounding text, and truncated JSON is refused',()=>{
 assert.deepEqual(parseModelJson('{"a":1}'),{a:1});
 assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'),{a:1});
 assert.deepEqual(parseModelJson('Here it is: {"a":1} done'),{a:1});
 for(const bad of ['{"a":','not json','','```json\n{"a":\n```'])assert.throws(()=>parseModelJson(bad));
});
test('model reply metadata tolerates malformed envelopes and exposes only fixed stop labels',()=>{
 for(const body of [null,[],{}, {choices:null},{choices:[null]},{choices:[{message:{content:{text:'wrong shape'}}}]}]){
  assert.equal(readModelReply(body).content,undefined);assert.equal(readModelReply(body).finishReason,'missing');
 }
 assert.deepEqual(readModelReply({choices:[{finish_reason:'length',message:{content:'{}'}}]}),{content:'{}',finishReason:'length',refused:false});
 assert.equal(readModelReply({choices:[{finish_reason:'secret-provider-detail'}]}).finishReason,'unknown');
 assert.equal(readModelReply({choices:[{finish_reason:'content_filter'}]}).refused,true);
 assert.equal(readModelReply({choices:[{finish_reason:'stop',message:{refusal:'Cannot comply'}}]}).refused,true);
});
test('drafts asserting unverified links are flagged, including the wording found in testing',()=>{
 for(const claim of [
  'I am writing about a reading hosted at your venue on 15 October, and wondered if you hold a record.',
  'A courier reported delivering RP-104 to your shop.',
  'Your staff received the portfolio.',
  'You hosted the event on 15 October.',
  'Our courier note confirms the handover.',
  'The worksheet shows the item arrived.',
  'The portfolio was left with your team.',
  'Could you check the reading held at your bookshop?',
 ])assert.equal(draftOverclaims(claim).length,1,claim);
});
test('careful questions and attributed statements pass',()=>{
 for(const fine of [
  'Could you confirm whether a reading was hosted at your venue on 15 October?',
  'Was an event held at your venue on 15 October?',
  'Did you receive a portfolio that day?',
  'Do you hold a goods-inward record for RP-104?',
  'A supplied worksheet suggests a reading on 15 October, but it lists RP-140 rather than RP-104.',
  'A courier note records 17:40 but not the venue.',
  'The worksheet does not show a signed receipt.',
  'We do not know whether the item reached your venue.',
  'Please let me know if the portfolio was delivered to you.',
  'Whether this was the reported stop remains unresolved.',
  'Subject: Venue and event information — Libreria\n\nThank you.',
 ])assert.deepEqual(draftOverclaims(fine),[],fine);
});
test('only the place own public website counts as its host',()=>{
 const site='https://www.libreria.example.org/shop';
 for(const host of ['libreria.example.org','www.libreria.example.org','WWW.Libreria.Example.Org'])assert.equal(isLeadHost(host,site),true,host);
 for(const host of ['evil.example.org','libreria.example.org.evil.com','notlibreria.example.org','shop.libreria.example.org'])assert.equal(isLeadHost(host,site),false,host);
 assert.equal(isLeadHost('libreria.example.org',undefined),false);
 for(const site of ['http://localhost/','http://127.0.0.1/','https://[::1]/','https://printer.local/','http://intranet/','not a url'])assert.equal(isLeadHost(new URL('https://x.example.org').hostname,site),false,site);
 assert.equal(isLeadHost('127.0.0.1','http://127.0.0.1/'),false);assert.equal(isLeadHost('printer.local','https://printer.local/'),false);
});
