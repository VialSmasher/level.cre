export type EmailProspectCandidate = {
  id: string;
  name?: string | null;
  address?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactCompany?: string | null;
  businessName?: string | null;
  websiteUrl?: string | null;
  status?: string | null;
};

export type CapturedEmailEvidence = {
  direction?: string | null;
  subject?: string | null;
  snippet?: string | null;
  senderEmail?: string | null;
  recipientEmails?: Array<string | null | undefined>;
  ccEmails?: Array<string | null | undefined>;
};

export type EmailProspectMatchDecision = {
  prospectId: string | null;
  status: 'auto_log' | 'pending_review' | 'needs_context';
  confidence: number;
  reason: string;
  evidence: string[];
};

const FREE_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.ca',
  'live.com',
  'me.com',
  'msn.com',
  'outlook.ca',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.ca',
  'yahoo.com',
]);

const SYSTEM_EMAIL_DOMAINS = new Set([
  'agentmail.to',
  'inbound.postmarkapp.com',
]);

const GENERIC_ENTITY_TOKENS = new Set([
  'asset', 'assets', 'building', 'business', 'centre', 'center', 'commercial', 'company',
  'corp', 'corporation', 'development', 'distribution', 'group', 'holding', 'holdings',
  'industrial', 'industries', 'land', 'limited', 'ltd', 'office', 'park', 'properties',
  'property', 'real', 'realty', 'site', 'warehouse', 'warehousing', 'estate', 'inc',
]);

const ADDRESS_SUFFIXES: Record<string, string> = {
  av: 'avenue',
  ave: 'avenue',
  blvd: 'boulevard',
  cr: 'crescent',
  cres: 'crescent',
  ct: 'court',
  dr: 'drive',
  hwy: 'highway',
  pl: 'place',
  rd: 'road',
  st: 'street',
  tr: 'trail',
  trl: 'trail',
};

const ADDRESS_DIRECTIONS: Record<string, string> = {
  n: 'north',
  ne: 'northeast',
  nw: 'northwest',
  s: 'south',
  se: 'southeast',
  sw: 'southwest',
  e: 'east',
  w: 'west',
};

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function sanitizeCapturedEmailSnippet(value: string | null | undefined): string {
  const withLineBreaks = decodeBasicEntities(String(value || ''))
    .replace(/<(?:br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/mailto:[^\s>]+/gi, ' ')
    .replace(/\r\n?/g, '\n');

  const lines = withLineBreaks
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());

  const quoteOrSignatureIndex = lines.findIndex((line) => (
    /^-{2,}\s*(original message)?\s*-{2,}$/i.test(line)
    || /^on .+ wrote:$/i.test(line)
    || /^from:\s+.+/i.test(line)
    || /^(regards|thanks|thank you|best|sincerely|cheers),?$/i.test(line)
    || /^(direct|mobile|cell|office|main office|t):\s*/i.test(line)
  ));
  const visibleLines = quoteOrSignatureIndex >= 0 ? lines.slice(0, quoteOrSignatureIndex) : lines;
  const collapsed = visibleLines.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const inlineCutoff = [
    /\s+-{2,}\s*original message/i,
    /\s+on .+ wrote:/i,
    /\s+(?:regards|thanks|thank you|best|sincerely|cheers),\s+[A-Z]/,
    /\s+(?:direct|mobile|cell|main office):\s*/i,
  ]
    .map((pattern) => collapsed.search(pattern))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return (inlineCutoff === undefined ? collapsed : collapsed.slice(0, inlineCutoff).trim()).slice(0, 4000);
}

function normalizeEmail(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function emailDomain(value: string | null | undefined): string {
  return normalizeEmail(value).split('@')[1] || '';
}

function websiteDomain(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const hostname = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeText(value: string | null | undefined): string {
  return decodeBasicEntities(String(value || ''))
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddressTokens(value: string): string {
  return value
    .split(' ')
    .map((token) => ADDRESS_SUFFIXES[token] || ADDRESS_DIRECTIONS[token] || token)
    .join(' ')
    .trim();
}

function normalizeAddress(value: string | null | undefined): string {
  const firstLine = String(value || '').split(',')[0];
  return normalizeAddressTokens(normalizeText(firstLine));
}

function addressVariants(value: string | null | undefined): string[] {
  const normalized = normalizeAddress(value);
  if (!/^\d{2,6}\s+\S+/.test(normalized)) return [];
  const variants = new Set([normalized]);
  variants.add(normalized.replace(/\s+(?:north|south|east|west|northeast|northwest|southeast|southwest)$/i, ''));
  return [...variants].filter((variant) => variant.split(' ').length >= 3);
}

function phraseOccurs(text: string, phrase: string): boolean {
  return Boolean(phrase) && ` ${text} `.includes(` ${phrase} `);
}

function meaningfulEntityPhrase(value: string | null | undefined): string {
  const phrase = normalizeText(value);
  if (!phrase || /^\d{2,6}\s+/.test(phrase)) return '';
  const tokens = phrase.split(' ').filter(Boolean);
  const meaningful = tokens.filter((token) => !GENERIC_ENTITY_TOKENS.has(token));
  if (meaningful.length === 0) return '';
  if (tokens.length === 1 && tokens[0].length < 5) return '';
  return phrase;
}

function uniqueCandidate(matches: EmailProspectCandidate[]): EmailProspectCandidate | null {
  const byId = new Map(matches.map((candidate) => [candidate.id, candidate]));
  return byId.size === 1 ? [...byId.values()][0] : null;
}

export function getEmailCounterpartyEmails(message: CapturedEmailEvidence): string[] {
  const sender = normalizeEmail(message.senderEmail);
  const isReceived = String(message.direction || '').toLowerCase() === 'received';
  const candidates = isReceived
    ? [sender]
    : [...(message.recipientEmails || []), ...(message.ccEmails || [])].map(normalizeEmail);
  return [...new Set(candidates.filter((email) => {
    const domain = emailDomain(email);
    return Boolean(email && (isReceived || email !== sender) && !SYSTEM_EMAIL_DOMAINS.has(domain));
  }))];
}

export function resolveEmailProspectMatch(
  message: CapturedEmailEvidence,
  candidates: EmailProspectCandidate[],
): EmailProspectMatchDecision {
  const counterparties = getEmailCounterpartyEmails(message);
  const exactEmailMatches = candidates.filter((candidate) => {
    const candidateEmail = normalizeEmail(candidate.contactEmail);
    return Boolean(candidateEmail && counterparties.includes(candidateEmail));
  });
  const exactEmailCandidate = uniqueCandidate(exactEmailMatches);
  if (exactEmailCandidate) {
    return {
      prospectId: exactEmailCandidate.id,
      status: 'auto_log',
      confidence: 100,
      reason: 'exact_contact_email',
      evidence: [`Exact contact email: ${normalizeEmail(exactEmailCandidate.contactEmail)}`],
    };
  }
  if (exactEmailMatches.length > 1) {
    return {
      prospectId: null,
      status: 'pending_review',
      confidence: 72,
      reason: 'ambiguous_contact_email',
      evidence: ['The same contact email is attached to more than one prospect.'],
    };
  }

  const companyDomains = [...new Set(counterparties
    .map(emailDomain)
    .filter((domain) => domain && !FREE_EMAIL_DOMAINS.has(domain) && !SYSTEM_EMAIL_DOMAINS.has(domain)))];
  for (const domain of companyDomains) {
    const domainMatches = candidates.filter((candidate) => (
      emailDomain(candidate.contactEmail) === domain || websiteDomain(candidate.websiteUrl) === domain
    ));
    const domainCandidate = uniqueCandidate(domainMatches);
    if (domainCandidate) {
      return {
        prospectId: domainCandidate.id,
        status: 'auto_log',
        confidence: 94,
        reason: 'unique_company_domain',
        evidence: [`Unique company domain: ${domain}`],
      };
    }
    if (domainMatches.length > 1) {
      return {
        prospectId: null,
        status: 'pending_review',
        confidence: 68,
        reason: 'ambiguous_company_domain',
        evidence: [`Company domain ${domain} belongs to more than one prospect.`],
      };
    }
  }

  const messageText = normalizeAddressTokens(normalizeText(
    `${message.subject || ''} ${sanitizeCapturedEmailSnippet(message.snippet)}`,
  ));
  const addressMatches = candidates.filter((candidate) => {
    const variants = [
      ...addressVariants(candidate.address),
      ...addressVariants(candidate.name),
    ];
    return variants.some((variant) => phraseOccurs(messageText, variant));
  });
  const addressCandidate = uniqueCandidate(addressMatches);
  if (addressCandidate) {
    return {
      prospectId: addressCandidate.id,
      status: 'auto_log',
      confidence: 92,
      reason: 'unique_exact_address',
      evidence: [`Unique address mention: ${addressCandidate.address || addressCandidate.name || ''}`],
    };
  }
  if (addressMatches.length > 1) {
    return {
      prospectId: null,
      status: 'pending_review',
      confidence: 64,
      reason: 'ambiguous_address_mention',
      evidence: ['The email mentions an address shared by more than one prospect.'],
    };
  }

  const entityMatches = candidates.filter((candidate) => [
    candidate.contactCompany,
    candidate.businessName,
    candidate.name,
  ].some((value) => {
    const phrase = meaningfulEntityPhrase(value);
    return phraseOccurs(messageText, phrase);
  }));
  const entityCandidate = uniqueCandidate(entityMatches);
  if (entityCandidate) {
    return {
      prospectId: entityCandidate.id,
      status: 'pending_review',
      confidence: 62,
      reason: 'unique_company_or_name_mention',
      evidence: [`Possible company/name mention: ${entityCandidate.contactCompany || entityCandidate.businessName || entityCandidate.name || ''}`],
    };
  }
  if (entityMatches.length > 1) {
    return {
      prospectId: null,
      status: 'needs_context',
      confidence: 25,
      reason: 'ambiguous_company_or_name_mention',
      evidence: ['Company/name evidence points to more than one prospect.'],
    };
  }

  return {
    prospectId: null,
    status: 'needs_context',
    confidence: 0,
    reason: 'no_confident_prospect_match',
    evidence: [],
  };
}
