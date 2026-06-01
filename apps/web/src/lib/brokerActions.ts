import type { Prospect } from '@level-cre/shared/schema';

export type BrokerActivityType = 'call' | 'email' | 'meeting' | 'note';
export type BrokerActivityOutcome =
  | 'contacted'
  | 'no_answer'
  | 'left_message'
  | 'scheduled_meeting'
  | 'not_interested'
  | 'follow_up_later';

export type BrokerActivityInput = {
  prospect: Pick<Prospect, 'id'>;
  type: BrokerActivityType;
  outcome?: BrokerActivityOutcome;
  notes?: string;
  nextFollowUp?: string | null;
  listingId?: string | null;
  date?: string;
};

export function buildBrokerActivityPayload(input: BrokerActivityInput) {
  return {
    prospectId: input.prospect.id,
    listingId: input.listingId || undefined,
    date: input.date,
    type: input.type,
    outcome: input.outcome || (input.type === 'meeting' ? 'scheduled_meeting' : 'contacted'),
    notes: input.notes || '',
    nextFollowUp: input.nextFollowUp,
  };
}

export async function logBrokerActivity(input: BrokerActivityInput) {
  const { apiRequest } = await import('@/lib/queryClient');
  const response = await apiRequest('POST', '/api/broker-actions/log-activity', buildBrokerActivityPayload(input));
  return response.json() as Promise<{
    interaction: unknown;
    prospect?: Prospect;
    newXpGained?: number;
  }>;
}
