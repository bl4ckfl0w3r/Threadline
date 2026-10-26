import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankCase, applyEdits, draftEnquiry, compareQueries, exportBrief, actionSchema } from '../lib/domain.ts';
import type { Query } from '../lib/contracts.ts';

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

  // Reopening with forceRegenerate refreshes draft text but keeps responses/outcomes
  const regenerated = draftEnquiry(file, lead, true);
  assert.match(regenerated.draft, /Subject: Venue and event information/);
  assert.equal(regenerated.outcomeBranch, 'confirming');

  // Reopening for a DIFFERENT lead does not inherit the previous lead's draft
  const otherLead = { id: 'lead-2', name: 'Other Venue', address: '456 Side St', tags: [], introducedBy: 'q' };
  const otherDraft = draftEnquiry(file, otherLead, false);
  assert.match(otherDraft.draft, /Subject: Venue and event information — Other Venue/);
  assert.equal(otherDraft.outcomeBranch, undefined);
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
