export const XP_VALUES = {
  PROSPECTING: 25,
  FOLLOW_UP_BASE: 10,
  FOLLOW_UP_CALL: 15,
  FOLLOW_UP_EMAIL: 10,
  FOLLOW_UP_MEETING: 25,
  STATUS_CHANGE: 10,
  REQUIREMENT: 20,
  MARKET_COMP: 20,
  CONSISTENCY: 100,
} as const;

export type InteractionType = 'call' | 'email' | 'meeting' | 'note';

export function actionForInteractionType(type: InteractionType): string {
  switch (type) {
    case 'call':
      return 'phone_call';
    case 'email':
      return 'email_sent';
    case 'meeting':
      return 'meeting_held';
    default:
      return 'interaction';
  }
}

export function xpForInteractionType(type: InteractionType): number {
  switch (type) {
    case 'call':
      return XP_VALUES.FOLLOW_UP_CALL;
    case 'email':
      return XP_VALUES.FOLLOW_UP_EMAIL;
    case 'meeting':
      return XP_VALUES.FOLLOW_UP_MEETING;
    default:
      return XP_VALUES.FOLLOW_UP_BASE;
  }
}

export function inferInteractionTypeFromNote(note?: string | null): InteractionType | null {
  if (!note) return null;
  const text = note.toLowerCase();
  if (/\b(call|called|phone|voicemail)\b/.test(text)) return 'call';
  if (/\b(email|emailed|sent email)\b/.test(text)) return 'email';
  if (/\b(meeting|met|appointment|tour)\b/.test(text)) return 'meeting';
  return null;
}

