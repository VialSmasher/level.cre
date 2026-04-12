import test from 'node:test';
import assert from 'node:assert/strict';

import type { Prospect } from '@level-cre/shared/schema';

import {
  buildDataQualityReview,
  buildFollowUpReview,
  type ToolAReviewInteraction,
} from './toolAReview';

function makeProspect(overrides: Partial<Prospect> & Pick<Prospect, 'id' | 'name'>): Prospect {
  return {
    id: overrides.id,
    name: overrides.name,
    status: overrides.status ?? 'prospect',
    notes: overrides.notes ?? '',
    geometry: overrides.geometry ?? { type: 'Point', coordinates: [-113.5, 53.5] },
    createdDate: overrides.createdDate ?? '2026-01-01T12:00:00.000Z',
    submarketId: overrides.submarketId,
    lastContactDate: overrides.lastContactDate,
    followUpTimeframe: overrides.followUpTimeframe,
    followUpDueDate: overrides.followUpDueDate,
    contactName: overrides.contactName,
    contactEmail: overrides.contactEmail,
    contactPhone: overrides.contactPhone,
    contactCompany: overrides.contactCompany,
    buildingSf: overrides.buildingSf,
    lotSizeAcres: overrides.lotSizeAcres,
    aiMetadata: overrides.aiMetadata,
    businessName: overrides.businessName,
    websiteUrl: overrides.websiteUrl,
  };
}

function makeInteraction(overrides: Partial<ToolAReviewInteraction> & Pick<ToolAReviewInteraction, 'id' | 'prospectId'>): ToolAReviewInteraction {
  return {
    id: overrides.id,
    prospectId: overrides.prospectId,
    date: overrides.date ?? '2026-02-01T12:00:00.000Z',
    createdAt: overrides.createdAt ?? overrides.date ?? '2026-02-01T12:00:00.000Z',
    nextFollowUp: overrides.nextFollowUp ?? null,
    listingId: overrides.listingId ?? null,
    userId: overrides.userId ?? null,
    type: overrides.type ?? 'call',
    outcome: overrides.outcome ?? 'contacted',
    notes: overrides.notes ?? '',
  };
}

test('buildFollowUpReview uses latest interaction to compute overdue follow-ups', () => {
  const prospect = makeProspect({
    id: 'p-1',
    name: '123 Example Ave',
    followUpTimeframe: '1_month',
    createdDate: '2026-01-01T12:00:00.000Z',
  });
  const interactions = [
    makeInteraction({
      id: 'i-1',
      prospectId: 'p-1',
      date: '2026-02-01T12:00:00.000Z',
    }),
  ];

  const review = buildFollowUpReview({
    prospects: [prospect],
    interactions,
    now: new Date('2026-03-10T12:00:00.000Z'),
  });

  assert.equal(review.summary.overdue, 1);
  assert.equal(review.items[0]?.flags.includes('overdue'), true);
  assert.equal(review.items[0]?.dueDate, '2026-03-01T12:00:00.000Z');
  assert.equal(review.items[0]?.lastInteractionAt, '2026-02-01T12:00:00.000Z');
});

test('buildFollowUpReview treats interaction nextFollowUp as an explicit schedule', () => {
  const prospect = makeProspect({
    id: 'p-2',
    name: '456 Queue St',
    notes: 'Needs a check-in',
  });
  const interactions = [
    makeInteraction({
      id: 'i-2',
      prospectId: 'p-2',
      date: '2026-03-01T12:00:00.000Z',
      nextFollowUp: '2026-03-05T12:00:00.000Z',
    }),
  ];

  const review = buildFollowUpReview({
    prospects: [prospect],
    interactions,
    now: new Date('2026-03-03T12:00:00.000Z'),
    dueSoonDays: 3,
  });

  assert.equal(review.summary.dueSoon, 1);
  assert.equal(review.summary.missingSchedule, 0);
  assert.deepEqual(review.items[0]?.flags, ['due_soon']);
});

test('buildFollowUpReview flags missing schedules and no engagement, but skips no-go records', () => {
  const prospects = [
    makeProspect({
      id: 'p-3',
      name: '789 Missing Ln',
    }),
    makeProspect({
      id: 'p-4',
      name: 'Should Stay Hidden',
      status: 'no_go',
    }),
  ];

  const review = buildFollowUpReview({
    prospects,
    interactions: [],
    now: new Date('2026-03-03T12:00:00.000Z'),
  });

  assert.equal(review.summary.totalReviewed, 1);
  assert.equal(review.summary.missingSchedule, 1);
  assert.equal(review.summary.noEngagement, 1);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0]?.name, '789 Missing Ln');
});

test('buildDataQualityReview flags high-signal cleanup issues', () => {
  const prospects = [
    makeProspect({
      id: 'p-5',
      name: 'New rectangle',
      notes: '',
      contactEmail: 'bad-email',
      contactPhone: '12345',
      websiteUrl: 'notaurl',
    }),
  ];

  const review = buildDataQualityReview({
    prospects,
    interactions: [],
  });

  const codes = review.items[0]?.issues.map((issue) => issue.code) ?? [];
  assert.equal(review.summary.flagged, 1);
  assert.equal(codes.includes('placeholder_name'), true);
  assert.equal(codes.includes('missing_notes'), true);
  assert.equal(codes.includes('missing_submarket'), true);
  assert.equal(codes.includes('invalid_email'), true);
  assert.equal(codes.includes('invalid_phone'), true);
  assert.equal(codes.includes('invalid_website'), true);
  assert.equal(codes.includes('missing_follow_up_strategy'), true);
});
