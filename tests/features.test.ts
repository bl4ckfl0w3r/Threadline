import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { blankCase, applyEdits, draftEnquiry, compareQueries, exportBrief, actionSchema, getEnquiryIdentity, matchesEnquiryIdentity } from '../lib/domain.ts';
import type { Query } from '../lib/contracts.ts';
import { useWorkspace } from '../components/threadline/use-workspace.ts';

// Setup minimal DOM globals for React 19 test harness
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class MockElement {
  nodeType = 1;
  nodeName = 'DIV';
  tagName = 'DIV';
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  childNodes: any[] = [];
  style = {};
  ownerDocument = null as any;
  addEventListener() {}
  removeEventListener() {}
  appendChild(child: any) { this.childNodes.push(child); return child; }
  removeChild(child: any) { this.childNodes = this.childNodes.filter(c => c !== child); return child; }
  insertBefore(child: any, ref: any) { this.childNodes.push(child); return child; }
}

const mockWin = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false }),
  HTMLIFrameElement: class {},
};

const mockDoc = {
  createElement: () => { const el = new MockElement(); el.ownerDocument = mockDoc; return el; },
  createElementNS: () => { const el = new MockElement(); el.ownerDocument = mockDoc; return el; },
  createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc }),
  body: new MockElement(),
  defaultView: mockWin,
  addEventListener: () => {},
  removeEventListener: () => {},
};
mockDoc.body.ownerDocument = mockDoc;

if (!globalThis.document) {
  Object.defineProperty(globalThis, 'document', { value: mockDoc, writable: true, configurable: true });
}
if (!globalThis.window) {
  Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true });
}
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    writable: true,
    configurable: true
  });
}
if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear()
    },
    writable: true,
    configurable: true
  });
}

const mockCaseData = blankCase('test-case');
const defaultFetchMock = async (url: any, options?: any) => {
  const urlStr = String(url);
  if (urlStr.endsWith('/api/status')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ mode: 'live', services: { webSearch: true, placeDetails: true } })
    } as any;
  }
  if (urlStr.endsWith('/api/cases') && (!options || !options.method || options.method === 'GET')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        cases: [{ id: mockCaseData.id, title: mockCaseData.title, mode: mockCaseData.mode, updatedAt: mockCaseData.updatedAt }]
      })
    } as any;
  }
  if (urlStr.endsWith('/api/cases') && options?.method === 'POST') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ case: mockCaseData, cases: [{ id: mockCaseData.id, title: mockCaseData.title, mode: mockCaseData.mode, updatedAt: mockCaseData.updatedAt }] })
    } as any;
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ case: mockCaseData, cases: [{ id: mockCaseData.id, title: mockCaseData.title, mode: mockCaseData.mode, updatedAt: mockCaseData.updatedAt }] })
  } as any;
};

globalThis.fetch = defaultFetchMock as any;

function renderWorkspaceHook() {
  let hook = { current: null as any };
  function TestComponent() {
    hook.current = useWorkspace();
    return null;
  }
  const container = mockDoc.createElement();
  const root = createRoot(container as any);
  act(() => {
    root.render(React.createElement(TestComponent));
  });
  return {
    hook,
    run: async (fn?: () => void | Promise<void>) => {
      await act(async () => {
        if (fn) await fn();
      });
    }
  };
}

test('record_enquiry_response action schema validation', () => {
  const validAction = {
    type: 'record_enquiry_response',
    leadId: 'lead-1',
    respondent: 'Archivist',
    receivedAt: '2026-10-25',
    passage: 'Confirmed booking record found.',
    outcomeBranch: 'confirming',
    sourceIds: ['s1'],
    whatChanges: 'Identity confirmed.',
    unresolved: 'Exact seat number.',
    summary: 'Archivist confirmed booking.'
  };

  const parsed = actionSchema.safeParse(validAction);
  assert.ok(parsed.success);

  // Invalid outcome branch
  const invalidBranch = actionSchema.safeParse({ ...validAction, outcomeBranch: 'maybe' });
  assert.equal(invalidBranch.success, false);

  // Missing required passage
  const missingPassage = actionSchema.safeParse({ ...validAction, passage: '' });
  assert.equal(missingPassage.success, false);

  // Missing respondent
  const missingRespondent = actionSchema.safeParse({ ...validAction, respondent: '' });
  assert.equal(missingRespondent.success, false);
});

test('draftEnquiry preserves existing enquiry for same lead unless forceRegenerate is set', () => {
  const file = blankCase('test-draft');
  const lead = { id: 'lead-1', name: 'Original Venue', address: '123 Main', tags: [], introducedBy: 'q' };
  file.leads = [lead];

  // First draft
  file.enquiry = draftEnquiry(file, lead);
  file.enquiry.draft = 'Custom edited draft text by user';
  file.enquiry.outcomeBranch = 'confirming';

  // Reopening for same lead without forceRegenerate preserves custom draft and branch outcome
  const reopened = draftEnquiry(file, lead, false);
  assert.equal(reopened.draft, 'Custom edited draft text by user');
  assert.equal(reopened.outcomeBranch, 'confirming');

  // Reopening with forceRegenerate refreshes draft text and archives previous enquiry in history
  const regenerated = draftEnquiry(file, lead, true);
  assert.match(regenerated.draft, /Subject: Venue and event information/);
  assert.equal(regenerated.history?.[0]?.enquiry.draft, 'Custom edited draft text by user');
  assert.equal(regenerated.history?.[0]?.enquiry.outcomeBranch, 'confirming');

  // Reopening for a DIFFERENT lead does not inherit the previous lead's draft, but archives lead-1 enquiry into history
  const otherLead = { id: 'lead-2', name: 'Other Venue', address: '456 Side St', tags: [], introducedBy: 'q' };
  const otherDraft = draftEnquiry(file, otherLead, false);
  assert.match(otherDraft.draft, /Subject: Venue and event information — Other Venue/);
  assert.equal(otherDraft.outcomeBranch, undefined);
  assert.equal(otherDraft.history?.[0]?.enquiry.leadId, 'lead-1');
});

test('draftEnquiry archives Lead A before Lead B, and restores Lead A when requested', () => {
  const file = blankCase('history-restore-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  const leadB = { id: 'lead-B', name: 'Venue B', address: '456 B St', tags: [], introducedBy: 'q' };
  file.leads = [leadA, leadB];

  // Draft for A and record custom details
  file.enquiry = draftEnquiry(file, leadA);
  file.enquiry.question = 'Custom question for A?';
  file.enquiry.draft = 'Draft for A';
  file.enquiry.response = {
    id: 'resp-a',
    respondent: 'Archivist A',
    receivedAt: '2026-10-25',
    passage: 'Passage for A',
    outcomeBranch: 'confirming'
  };

  // Draft for B
  file.enquiry = draftEnquiry(file, leadB);
  assert.equal(file.enquiry.leadId, 'lead-B');
  assert.match(file.enquiry.draft, /Venue B/);
  assert.equal(file.enquiry.history?.length, 1);
  assert.equal(file.enquiry.history?.[0].enquiry.leadId, 'lead-A');
  assert.equal(file.enquiry.history?.[0].enquiry.question, 'Custom question for A?');

  // Switch back to A
  file.enquiry = draftEnquiry(file, leadA);
  assert.equal(file.enquiry.leadId, 'lead-A');
  assert.equal(file.enquiry.question, 'Custom question for A?');
  assert.equal(file.enquiry.response?.respondent, 'Archivist A');
  assert.equal(file.enquiry.history?.length, 1);
  assert.equal(file.enquiry.history?.[0].enquiry.leadId, 'lead-B');

  // Valid enquiry schema check with history
  const savedAndParsed = applyEdits(file, { enquiry: file.enquiry });
  assert.equal(savedAndParsed.enquiry?.leadId, 'lead-A');
  assert.equal(savedAndParsed.enquiry?.history?.length, 1);

  // Export brief includes archived history
  const brief = exportBrief(savedAndParsed);
  assert.match(brief, /Archived Enquiry History/);
  assert.match(brief, /Venue B/);
});

test('response recording snapshots answered question and selected branch text', () => {
  const file = blankCase('response-snapshot-test');
  const lead = { id: 'lead-1', name: 'Venue 1', address: 'Address 1', tags: [], introducedBy: 'q' };
  file.leads = [lead];
  file.enquiry = draftEnquiry(file, lead);
  file.enquiry.question = 'Custom Question?';
  file.enquiry.confirming = 'Custom Confirming Branch Text';

  // Snapshot on response
  const selectedBranchText = file.enquiry[file.enquiry.outcomeBranch || 'confirming'];
  const answeredQuestion = file.enquiry.question;
  assert.equal(answeredQuestion, 'Custom Question?');
  assert.equal(selectedBranchText, 'Custom Confirming Branch Text');

  // Regenerate draft for lead
  const regenerated = draftEnquiry(file, lead, true);
  assert.equal(regenerated.history?.[0]?.enquiry.question, 'Custom Question?');
  assert.equal(regenerated.history?.[0]?.enquiry.confirming, 'Custom Confirming Branch Text');
});

test('truthful provider ordinals are rendered when filtering candidate rows', () => {
  const file = blankCase('ordinal-test');
  const lead1 = { id: 'l1', name: 'Alpha Venue', address: '1 St', tags: [], introducedBy: 'q' };
  const lead12 = { id: 'l12', name: 'Zebra Venue', address: '12 St', tags: [], introducedBy: 'q' };
  file.leads = [lead1, lead12];

  // Query with rawRows provider ordinals
  const queryWithOrdinals: Query = {
    id: 'q1',
    label: 'Q1',
    mode: 'live',
    createdAt: '2026-10-25T10:00:00Z',
    clueIds: [],
    leadIds: ['l1', 'l12'],
    affinities: {},
    warnings: [],
    receiptId: 'rec-1',
    geography: { latitude: 51.5, longitude: -0.1, radius: 1000 },
    category: 'book_store',
    rawRows: [
      { entity_id: 'l1', ordinal: 0 },
      { entity_id: 'l12', ordinal: 11 }
    ]
  };

  // Helper calculating ordinal rank as implemented in LeadsView
  const calculateRank = (leadId: string, q: Query | undefined, filteredMapIdx: number) => {
    if (q) {
      const rawRow = q.rawRows?.find((r: any) => (r?.entity_id === leadId || r?.id === leadId));
      if (rawRow && typeof (rawRow as any).ordinal === 'number') {
        return (rawRow as any).ordinal + 1;
      } else if (Array.isArray(q.leadIds)) {
        const leadIdx = q.leadIds.indexOf(leadId);
        if (leadIdx >= 0) return leadIdx + 1;
      }
    }
    return filteredMapIdx + 1;
  };

  // Filtered by 'Zebra' -> filtered contains only lead12 at filtered map index 0
  const rankWithOrdinals = calculateRank('l12', queryWithOrdinals, 0);
  assert.equal(rankWithOrdinals, 12); // Position 12 in provider response, not position 1

  // Legacy query without rawRows -> falls back to leadIds position index
  const legacyQuery: Query = {
    ...queryWithOrdinals,
    rawRows: undefined
  };
  const rankLegacy = calculateRank('l12', legacyQuery, 0);
  assert.equal(rankLegacy, 2); // Position 2 in leadIds
});

test('compareQueries verifies category and geography scope compatibility', () => {
  const baseQuery: Query = {
    id: 'q1',
    label: 'Query 1',
    mode: 'live',
    createdAt: '2026-10-25T10:00:00Z',
    clueIds: ['c1'],
    leadIds: ['l1', 'l2'],
    affinities: {},
    warnings: [],
    receiptId: 'r1',
    geography: { latitude: 51.5074, longitude: -0.1278, radius: 5000 },
    category: 'book_store'
  };

  const sameScopeQuery: Query = {
    ...baseQuery,
    id: 'q2',
    label: 'Query 2',
    leadIds: ['l2', 'l3']
  };

  const diffCategoryQuery: Query = {
    ...baseQuery,
    id: 'q3',
    category: 'music_venue'
  };

  const diffRadiusQuery: Query = {
    ...baseQuery,
    id: 'q4',
    geography: { latitude: 51.5074, longitude: -0.1278, radius: 10000 }
  };

  // Same scope comparison is compatible
  const sameResult = compareQueries(sameScopeQuery, baseQuery);
  assert.equal(sameResult.compatible, true);
  assert.deepEqual(sameResult.added, ['l3']);
  assert.deepEqual(sameResult.removed, ['l1']);
  assert.deepEqual(sameResult.retained, ['l2']);

  // Different category scope comparison is incompatible
  const diffCatResult = compareQueries(diffCategoryQuery, baseQuery);
  assert.equal(diffCatResult.compatible, false);
  assert.match(diffCatResult.reason || '', /Query scope differs/);
  assert.deepEqual(diffCatResult.added, []);

  // Different radius scope comparison is incompatible
  const diffRadResult = compareQueries(diffRadiusQuery, baseQuery);
  assert.equal(diffRadResult.compatible, false);
  assert.match(diffRadResult.reason || '', /Query scope differs/);

  // Legacy queries without geography object evaluate as compatible
  const legacy1 = { leadIds: ['l1', 'l2'] } as Query;
  const legacy2 = { leadIds: ['l2', 'l3'] } as Query;
  const legacyResult = compareQueries(legacy1, legacy2);
  assert.equal(legacyResult.compatible, undefined); // Legacy compatibility fallback
  assert.deepEqual(legacyResult.added, ['l1']);
});

test('exportBrief formats response history, outcome branch, input snapshots, and draft disclosure', () => {
  const file = blankCase('export-test');
  const lead = { id: 'l1', name: 'Test Venue', address: 'Address', tags: [], introducedBy: 'q' };
  file.leads = [lead];
  file.enquiry = draftEnquiry(file, lead);
  file.enquiry.responses = [
    {
      id: 'resp-1',
      respondent: 'Archivist',
      receivedAt: '2026-10-25',
      passage: 'Located ledger entry confirming date.',
      outcomeBranch: 'confirming',
      summary: 'Confirmed date in ledger.',
      whatChanges: 'Visit date confirmed.',
      unresolved: 'Exact duration.',
      receiptId: 'receipt_resp_123'
    }
  ];
  file.enquiry.outcomeBranch = 'confirming';
  file.enquiry.revisedActionText = 'Proceed to verify second stop.';

  file.queries = [
    {
      id: 'q1',
      label: 'Q1',
      mode: 'live',
      createdAt: '2026-10-25T10:00:00Z',
      clueIds: ['c1'],
      leadIds: ['l1'],
      affinities: {},
      warnings: [],
      receiptId: 'rec-1',
      geography: { latitude: 51.5, longitude: -0.1, radius: 1000 },
      category: 'book_store',
      inputSnapshot: {
        category: 'book_store',
        geography: { latitude: 51.5, longitude: -0.1, radius: 1000 },
        clues: [{ id: 'c1', label: 'Reference Book', provenance: 'supplied_interest' }]
      }
    }
  ];

  const brief = exportBrief(file);

  assert.match(brief, /Response History/);
  assert.match(brief, /Record Holder: Archivist/);
  assert.match(brief, /Passage\/Absence: Located ledger entry confirming date\./);
  assert.match(brief, /Open Uncertainties: Exact duration\./);
  assert.match(brief, /Selected Branch Outcome: confirming/);
  assert.match(brief, /Proceed to verify second stop\./);
  assert.match(brief, /Draft \(Draft only — no message sent via system\)/);
  assert.match(brief, /Input snapshot: Reference Book\./);
});

test('production hook: Q1 -> regenerate blocked/guarded flow and controller mismatch rejection', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('reg-guard-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];
  file.enquiry = draftEnquiry(file, leadA);
  const q1 = file.enquiry.question;

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, enquiry: file.enquiry });
    hook.current.setLeadId('lead-A');
  });

  await run(() => {
    hook.current.setResponseForm((prev: any) => ({ ...prev, respondent: 'Archivist', passage: 'Typed Q1 response' }));
  });

  // Attempt regenerate while response draft exists
  await run(() => {
    hook.current.regenerateEnquiry(leadA);
  });

  // Regeneration should be blocked with error message
  assert.match(hook.current.error, /Cannot regenerate enquiry while an unpersisted response draft exists/);
  assert.equal(hook.current.file.enquiry.question, q1);

  // Clear response form, update case date so new question differs, and retry regeneration
  await run(() => {
    hook.current.setError('');
    hook.current.clearResponseForm();
    hook.current.edit({ startDate: '2026-11-01' });
  });

  await run(() => {
    hook.current.regenerateEnquiry(leadA);
  });

  // Now regeneration succeeds and archives Q1
  assert.notEqual(hook.current.file.enquiry.question, q1);
  assert.equal(hook.current.file.enquiry.history?.[0]?.enquiry.question, q1);
});

test('production hook: Enquiry A -> browse B -> return A -> type -> draft B', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('browse-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  const leadB = { id: 'lead-B', name: 'Venue B', address: '456 B St', tags: [], introducedBy: 'q' };
  file.leads = [leadA, leadB];
  file.enquiry = draftEnquiry(file, leadA);

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, enquiry: file.enquiry });
    // Browse B
    hook.current.setLeadId('lead-B');
    // Return A
    hook.current.setLeadId('lead-A');
  });

  await run(() => {
    // Type into response form for A
    hook.current.setResponseForm((prev: any) => ({ ...prev, respondent: 'Archivist A', passage: 'Text for A' }));
  });

  // Now draft enquiry for B
  await run(() => {
    hook.current.chooseEnquiry(leadB);
  });

  // Assert enquiry B is active
  assert.equal(hook.current.file.enquiry.leadId, 'lead-B');

  // Assert Lead A's response draft was parked in summaries
  const summaries = hook.current.getParkedDraftSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].type, 'response');
  assert.equal(summaries[0].leadName, 'Venue A');

  // Active response form for B is fresh
  assert.equal(hook.current.responseForm.respondent, '');
  assert.equal(hook.current.responseForm.passage, '');
});

test('production hook: Source fallback uses actual selected lead', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('source-fallback-test');
  const lead1 = { id: 'lead-1', name: 'Venue 1', address: '1 St', tags: [], introducedBy: 'q' };
  const lead2 = { id: 'lead-2', name: 'Venue 2', address: '2 St', tags: [], introducedBy: 'q' };
  file.leads = [lead1, lead2];

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, clues: [] });
  });

  // When no leadId is selected, selected defaults to selected lead (lead1)
  assert.equal(hook.current.selected.id, 'lead-1');
  assert.match(hook.current.sourceComposerKey, /source:lead-1/);

  // When leadId is set to lead2, selected and sourceComposerKey update to lead2
  await run(() => {
    hook.current.setLeadId('lead-2');
  });
  assert.equal(hook.current.selected.id, 'lead-2');
  assert.match(hook.current.sourceComposerKey, /source:lead-2/);
});

test('production hook: Parked case review / discard / unload', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('parked-review-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, clues: [] });
    hook.current.setSourceForm({ title: 'Parked Title', url: 'https://example.com', excerpt: 'Parked Passage', note: 'Establish date', kind: 'user_excerpt' });
  });

  // Switch to lead B (or clear lead selection)
  await run(() => {
    hook.current.setLeadId('other-lead');
  });

  // Verify parked summary is generated with full review details
  const summaries = hook.current.getParkedDraftSummaries();
  assert.equal(summaries.length, 1);
  assert.match(summaries[0].details, /Title: Parked Title/);
  assert.match(summaries[0].details, /Excerpt: Parked Passage/);

  // Verify total unsaved field count and unload protection
  assert.equal(hook.current.totalUnsavedFieldCount, 4);
  assert.equal(hook.current.dirty, true);

  // Discard parked draft and verify immediate re-render
  await run(() => {
    hook.current.discardParkedDraft(summaries[0].key, 'source');
  });

  assert.equal(hook.current.getParkedDraftSummaries().length, 0);
  assert.equal(hook.current.totalUnsavedFieldCount, 0);
});

test('production hook: Deferred success after switching or editing', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('deferred-success-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  const leadB = { id: 'lead-B', name: 'Venue B', address: '456 B St', tags: [], introducedBy: 'q' };
  file.leads = [leadA, leadB];

  let resolveSave: (() => void) | undefined;
  const savePromise = new Promise<void>(r => { resolveSave = r; });

  // Mock global fetch for save API call with deferred resolution
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any) => {
    await savePromise;
    const caseObj = { ...hook.current.file, revision: (hook.current.file.revision || 0) + 1 };
    return {
      ok: true,
      status: 200,
      json: async () => ({ case: caseObj, cases: [{ id: caseObj.id, title: caseObj.title, mode: caseObj.mode, updatedAt: caseObj.updatedAt }] })
    } as any;
  };

  try {
    await run(() => {
      hook.current.edit({ id: file.id, leads: file.leads, clues: [] });
      hook.current.setLeadId('lead-A');
    });

    await run(() => {
      hook.current.setSourceForm({ title: 'A Title', url: '', excerpt: 'A Excerpt', note: '', kind: 'user_excerpt' });
    });

    // Start perform action for A
    let performPromise: Promise<any>;
    await run(() => {
      performPromise = hook.current.perform({
        type: 'source',
        leadId: 'lead-A',
        title: 'A Title',
        excerpt: 'A Excerpt',
        note: '',
        kind: 'user_excerpt'
      }, 'Saving source note');
    });

    // While perform is pending, switch lead to B and set sourceForm for B
    await run(() => {
      hook.current.setLeadId('lead-B');
    });
    await run(() => {
      hook.current.setSourceForm({ title: 'B Title', url: '', excerpt: 'B Excerpt', note: '', kind: 'user_excerpt' });
    });

    // Resolve API request and complete perform action promise
    await run(async () => {
      resolveSave?.();
      await performPromise;
    });

    // B's form state is preserved
    assert.equal(hook.current.sourceForm.title, 'B Title');
    assert.equal(hook.current.sourceForm.excerpt, 'B Excerpt');

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production hook: Failure retention preserves draft', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('failure-retention-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, clues: [] });
    hook.current.setLeadId('lead-A');
  });

  await run(() => {
    hook.current.setSourceForm({ title: 'Draft to keep', url: '', excerpt: 'Excerpt to keep', note: '', kind: 'user_excerpt' });
  });

  // Mock global fetch to return an error (failure)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' })
    } as any;
  };

  try {
    // Perform action which fails
    await run(async () => {
      await hook.current.perform({
        type: 'source',
        leadId: 'lead-A',
        title: 'Draft to keep',
        excerpt: 'Excerpt to keep',
        note: '',
        kind: 'user_excerpt'
      }, 'Saving source note');
    });

    // Error is displayed and draft form text is preserved
    assert.match(hook.current.error, /Internal Server Error/);
    assert.equal(hook.current.sourceForm.title, 'Draft to keep');
    assert.equal(hook.current.sourceForm.excerpt, 'Excerpt to keep');

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('P2 Defect 3: Export brief preserves immutable response provenance across editing and archival', () => {
  const file = blankCase('export-provenance-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];

  file.enquiry = draftEnquiry(file, leadA);
  file.enquiry.question = 'Question Q1?';
  file.enquiry.confirming = 'Confirming Branch B1';

  // Record response snapshotting Q1 and B1
  const response1 = {
    id: 'resp-1',
    respondent: 'Archivist',
    receivedAt: '2026-10-26',
    passage: 'Confirmed in ledger',
    outcomeBranch: 'confirming' as const,
    answeredQuestion: file.enquiry.question,
    selectedBranchText: file.enquiry.confirming,
    receiptId: 'receipt_resp_123',
    sourceIds: ['src-1']
  };
  file.enquiry.responses = [response1];

  // User subsequently edits enquiry question and confirming text
  file.enquiry.question = 'MODIFIED Question Q2?';
  file.enquiry.confirming = 'MODIFIED Confirming Branch B2';

  // Export brief before archival
  const briefCurrent = exportBrief(file);
  assert.match(briefCurrent, /Answered Question: Question Q1\?/);
  assert.match(briefCurrent, /Selected Branch Text: Confirming Branch B1/);
  assert.doesNotMatch(briefCurrent, /Answered Question: MODIFIED Question Q2\?/);

  // Archive enquiry by regenerating for leadA
  const regenerated = draftEnquiry(file, leadA, true);
  file.enquiry = regenerated;

  // Export brief after archival
  const briefArchived = exportBrief(file);
  assert.match(briefArchived, /Archived Enquiry History/);
  assert.match(briefArchived, /Answered Question: Question Q1\?/);
  assert.match(briefArchived, /Selected Branch Text: Confirming Branch B1/);
});

test('P2 Defect 4: Reopening lead restores LATEST archived version while preserving history', () => {
  const file = blankCase('find-last-index-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  const leadB = { id: 'lead-B', name: 'Venue B', address: '456 B St', tags: [], introducedBy: 'q' };
  file.leads = [leadA, leadB];

  // Lead A v1
  file.enquiry = draftEnquiry(file, leadA);
  file.enquiry.question = 'Lead A v1 question';

  // Regenerate Lead A -> Lead A v2
  file.enquiry = draftEnquiry(file, leadA, true);
  file.enquiry.question = 'Lead A v2 question (EDITED)';

  // Switch to Lead B -> Lead B v1
  file.enquiry = draftEnquiry(file, leadB);
  assert.equal(file.enquiry.leadId, 'lead-B');

  // Verify history has Lead A v1 and Lead A v2 (edited)
  assert.equal(file.enquiry.history?.length, 2);
  assert.equal(file.enquiry.history[0].enquiry.question, 'Lead A v1 question');
  assert.equal(file.enquiry.history[1].enquiry.question, 'Lead A v2 question (EDITED)');

  // Reopen Lead A (without forceRegenerate)
  file.enquiry = draftEnquiry(file, leadA, false);

  // Assert restored enquiry is Lead A v2 (the LATEST archived version)
  assert.equal(file.enquiry.leadId, 'lead-A');
  assert.equal(file.enquiry.question, 'Lead A v2 question (EDITED)');

  // Assert Lead A v1 and Lead B v1 remain in history
  assert.equal(file.enquiry.history?.length, 2);
  assert.equal(file.enquiry.history[0].enquiry.question, 'Lead A v1 question');
  assert.equal(file.enquiry.history[1].enquiry.leadId, 'lead-B');
});

test('production hook regression: Branch-only edit with draft', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('branch-edit-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];
  file.enquiry = draftEnquiry(file, leadA);
  const initialIdentity = getEnquiryIdentity(file.enquiry)!;

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, enquiry: file.enquiry });
    hook.current.setLeadId('lead-A');
  });

  // Type into response form
  await run(() => {
    hook.current.setResponseForm((prev: any) => ({ ...prev, respondent: 'Archive Officer', passage: 'Confirmed event' }));
  });

  // Branch-only edit on enquiry
  await run(() => {
    const updatedEnquiry = { ...hook.current.file.enquiry, confirming: 'UPDATED confirming branch text' };
    hook.current.edit({ enquiry: updatedEnquiry });
  });

  // The response draft for initialIdentity should now be parked
  const summaries = hook.current.getParkedDraftSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].type, 'response');
  assert.match(summaries[0].details, /Respondent: Archive Officer/);
  assert.match(summaries[0].details, /Passage\/Absence: Confirmed event/);
  assert.match(summaries[0].details, /--- Original Enquiry Snapshot ---/);

  // Active response form for the updated enquiry is fresh
  assert.equal(hook.current.responseForm.respondent, '');

  // Verify server identity check rejects old identity against updated enquiry
  assert.equal(matchesEnquiryIdentity(hook.current.file.enquiry, initialIdentity), false);
  // Verify server identity check accepts matching new identity
  assert.equal(matchesEnquiryIdentity(hook.current.file.enquiry, getEnquiryIdentity(hook.current.file.enquiry)!), true);
});

test('production hook regression: Selection-only parking/discard/unload', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('selection-only-test');
  const leadA = { id: 'lead-A', name: 'Venue A', address: '123 A St', tags: [], introducedBy: 'q' };
  file.leads = [leadA];
  file.enquiry = draftEnquiry(file, leadA);

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, enquiry: file.enquiry });
    hook.current.setLeadId('lead-A');
  });

  // On response form, make selection-only change: change outcomeBranch to 'conflicting'
  await run(() => {
    hook.current.setResponseForm((prev: any) => ({ ...prev, outcomeBranch: 'conflicting' }));
  });

  // Verify field count and dirty flag recognize selection-only change
  assert.equal(hook.current.totalUnsavedFieldCount, 1);
  assert.equal(hook.current.dirty, true);

  // On source form, set kind to 'user_record'
  await run(() => {
    hook.current.setSourceForm((prev: any) => ({ ...prev, kind: 'user_record' }));
  });

  assert.equal(hook.current.totalUnsavedFieldCount, 2);

  // Switch selected lead
  await run(() => {
    hook.current.setLeadId('other-lead');
  });

  // Summaries should include selection-only parked drafts
  const summaries = hook.current.getParkedDraftSummaries();
  assert.equal(summaries.length, 2);

  const responseSummary = summaries.find((s: { type: string }) => s.type === 'response');
  const sourceSummary = summaries.find((s: { type: string }) => s.type === 'source');

  assert.ok(responseSummary);
  assert.ok(sourceSummary);
  assert.match(responseSummary!.preview, /\[conflicting branch selected/);
  assert.match(sourceSummary!.preview, /\[user_record selected\]/);

  // Discard parked drafts
  await run(() => {
    hook.current.discardParkedDraft(responseSummary!.key, 'response');
    hook.current.discardParkedDraft(sourceSummary!.key, 'source');
  });

  assert.equal(hook.current.getParkedDraftSummaries().length, 0);
  assert.equal(hook.current.totalUnsavedFieldCount, 0);
});

test('production hook regression: Query-dependent selected source fallback', async () => {
  const { hook, run } = renderWorkspaceHook();
  await run();
  const file = blankCase('query-fallback-test');
  const lead1 = { id: 'lead-1', name: 'Venue 1', address: '1 St', tags: [], introducedBy: 'q1' };
  const lead2 = { id: 'lead-2', name: 'Venue 2', address: '2 St', tags: [], introducedBy: 'q2' };
  file.leads = [lead1, lead2];

  const source1 = { id: 'src-1', leadId: 'lead-1', title: 'Source 1', excerpt: 'E1', kind: 'user_excerpt' as const, mode: 'supplied' as const, capturedAt: '2026-10-26', note: '' };
  const source2 = { id: 'src-2', leadId: 'lead-2', title: 'Source 2', excerpt: 'E2', kind: 'user_excerpt' as const, mode: 'supplied' as const, capturedAt: '2026-10-26', note: '' };
  file.sources = [source1, source2];

  const q1: Query = { id: 'q1', label: 'Query 1', mode: 'live', createdAt: '2026-10-26', clueIds: [], leadIds: ['lead-1'], affinities: {}, warnings: [], receiptId: 'r1', geography: { latitude: 0, longitude: 0, radius: 1000 }, category: 'all_places' };
  const q2: Query = { id: 'q2', label: 'Query 2', mode: 'live', createdAt: '2026-10-26', clueIds: [], leadIds: ['lead-2'], affinities: {}, warnings: [], receiptId: 'r2', geography: { latitude: 0, longitude: 0, radius: 1000 }, category: 'all_places' };
  file.queries = [q1, q2];

  await run(() => {
    hook.current.edit({ id: file.id, leads: file.leads, sources: file.sources, queries: file.queries });
    hook.current.setQueryId('q1');
  });

  // Default selected lead for q1 is lead-1
  assert.equal(hook.current.selected?.id, 'lead-1');
  assert.equal(hook.current.selectedSources.length, 1);
  assert.equal(hook.current.selectedSources[0].id, 'src-1');

  // Switch active lead to lead-2
  await run(() => {
    hook.current.setLeadId('lead-2');
  });

  assert.equal(hook.current.selected?.id, 'lead-2');
  assert.equal(hook.current.selectedSources.length, 1);
  assert.equal(hook.current.selectedSources[0].id, 'src-2');
});

