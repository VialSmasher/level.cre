import { createHash } from 'node:crypto';
import type { IntelSourceAdapterSlug, IntelSourceRunContext, IntelSourceRunResult, NormalizedIntelListingRecord } from './types';
import { runCwedmSource } from './sources/cwedm';

export function ensureContentHash(record: Omit<NormalizedIntelListingRecord, 'contentHash'> & { contentHash?: string | null }): NormalizedIntelListingRecord {
  const contentHash = record.contentHash || createHash('sha256').update(JSON.stringify(record.rawPayload || {})).digest('hex');
  return {
    ...record,
    contentHash,
  };
}

export async function runSourceAdapter(
  slug: IntelSourceAdapterSlug,
  _context: IntelSourceRunContext,
): Promise<IntelSourceRunResult> {
  switch (slug) {
    case 'cwedm': {
      const records = await runCwedmSource();
      return {
        sourceSlug: slug,
        records: records.map((record) => ensureContentHash(record)),
      };
    }
    case 'nai_edmonton':
    case 'avison_young':
    case 'jll':
    case 'cbre':
    case 'colliers':
    case 'manual_url':
      throw new Error(`Source adapter not implemented yet for ${slug}`);
    default:
      throw new Error(`Unknown industrial intel source adapter: ${String(slug)}`);
  }
}
