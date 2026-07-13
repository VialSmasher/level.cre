export type FollowUpReminderRank = {
  score: number;
  titlePrefix: 'Overdue follow-up' | 'Upcoming follow-up' | 'Review old reminder';
  reason: string;
};

export function rankFollowUpReminder(params: {
  dueInDays: number;
  prospectStatus?: string | null;
}): FollowUpReminderRank {
  const { dueInDays } = params;
  const listingBoost = params.prospectStatus === 'listing' ? 8 : 0;

  if (dueInDays < -90) {
    const overdueDays = Math.abs(dueInDays);
    return {
      score: 38 + listingBoost,
      titlePrefix: 'Review old reminder',
      reason: `Reminder is ${overdueDays} days old. Confirm this is still active before it competes with current prospecting.`,
    };
  }

  if (dueInDays < -30) {
    const overdueDays = Math.abs(dueInDays);
    return {
      score: 52 + listingBoost,
      titlePrefix: 'Review old reminder',
      reason: `Reminder is ${overdueDays} days old and needs a quick keep-or-close decision.`,
    };
  }

  if (dueInDays < 0) {
    const overdueDays = Math.abs(dueInDays);
    return {
      score: 74 + Math.min(overdueDays, 16) + listingBoost,
      titlePrefix: 'Overdue follow-up',
      reason: `Follow-up is ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`,
    };
  }

  return {
    score: 78 - Math.min(dueInDays * 2, 14) + listingBoost,
    titlePrefix: 'Upcoming follow-up',
    reason: `Follow-up is due in ${dueInDays} day${dueInDays === 1 ? '' : 's'}.`,
  };
}

export function rankEmailCleanup(ageDays: number, hasContext: boolean): number {
  const base = hasContext ? 56 : 64;
  if (ageDays <= 3) return base + 8;
  if (ageDays <= 14) return base;
  if (ageDays <= 90) return base - 12;
  return base - 24;
}
