import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEmailCounterpartyEmails,
  resolveEmailProspectMatch,
  sanitizeCapturedEmailSnippet,
  type EmailProspectCandidate,
} from './emailProspectMatching';

const prospects: EmailProspectCandidate[] = [
  {
    id: 'clear-glass',
    name: '3905 101 Street NW',
    address: '3905 101 Street NW, Edmonton, AB',
    contactEmail: 'kent@clear-glass.ca',
    contactCompany: 'Clear Glass',
    websiteUrl: 'https://clear-glass.ca',
  },
  {
    id: 'daveta',
    name: 'Grande Prairie Fab Shop',
    address: '10735 214 Street NW',
    contactEmail: 'clint@davetaenergy.com',
    contactCompany: 'Daveta Energy',
    websiteUrl: 'davetaenergy.com',
  },
];

test('removes signatures and quoted history from captured email snippets', () => {
  const value = `Quick update on 10735 214 St.\n\nRegards,\nPatrick\nDirect: 780-555-0100\n-----Original Message-----\nOld thread`;
  assert.equal(sanitizeCapturedEmailSnippet(value), 'Quick update on 10735 214 St.');
});

test('uses the external recipient as the counterparty for sent BCC captures', () => {
  assert.deepEqual(getEmailCounterpartyEmails({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['clint@davetaenergy.com'],
    ccEmails: ['8feefe98@inbound.postmarkapp.com'],
  }), ['clint@davetaenergy.com']);
});

test('uses the sender as the counterparty for received mail', () => {
  assert.deepEqual(getEmailCounterpartyEmails({
    direction: 'received',
    senderEmail: 'clint@davetaenergy.com',
    recipientEmails: ['patrick@example.com'],
  }), ['clint@davetaenergy.com']);
});

test('auto-logs an exact contact email match', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['Clint@DavetaEnergy.com'],
    subject: 'Quick follow-up',
  }, prospects);

  assert.equal(result.status, 'auto_log');
  assert.equal(result.prospectId, 'daveta');
  assert.equal(result.reason, 'exact_contact_email');
  assert.equal(result.confidence, 100);
});

test('auto-logs a unique non-free company domain match', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['operations@clear-glass.ca'],
    subject: 'Checking in',
  }, prospects);

  assert.equal(result.status, 'auto_log');
  assert.equal(result.prospectId, 'clear-glass');
  assert.equal(result.reason, 'unique_company_domain');
});

test('auto-logs a unique exact address mention after normalizing street suffixes', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['buyer@gmail.com'],
    subject: '10735 214 St tour',
  }, prospects);

  assert.equal(result.status, 'auto_log');
  assert.equal(result.prospectId, 'daveta');
  assert.equal(result.reason, 'unique_exact_address');
});

test('keeps company-name-only evidence in review instead of auto-logging', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['buyer@gmail.com'],
    subject: 'Daveta Energy requirement',
  }, prospects);

  assert.equal(result.status, 'pending_review');
  assert.equal(result.prospectId, 'daveta');
  assert.equal(result.reason, 'unique_company_or_name_mention');
});

test('does not fan generic property language out to a prospect', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['buyer@gmail.com'],
    subject: 'Distribution center and industrial property requirement',
  }, [{
    id: 'generic',
    name: 'Distribution Center',
    contactCompany: 'Industrial Property Group',
  }]);

  assert.equal(result.status, 'needs_context');
  assert.equal(result.prospectId, null);
});

test('does not choose between prospects sharing the same contact email', () => {
  const result = resolveEmailProspectMatch({
    direction: 'sent',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['shared@example.com'],
  }, [
    { id: 'one', name: 'One', contactEmail: 'shared@example.com' },
    { id: 'two', name: 'Two', contactEmail: 'shared@example.com' },
  ]);

  assert.equal(result.status, 'pending_review');
  assert.equal(result.prospectId, null);
  assert.equal(result.reason, 'ambiguous_contact_email');
});
