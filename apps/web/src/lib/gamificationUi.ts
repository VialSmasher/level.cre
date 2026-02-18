export type QuickLogType = 'call' | 'email' | 'meeting';

export type QuickLogSpec = {
  note: string;
  xp: number;
  followUpDays: number;
  toastLabel: string;
};

const QUICK_LOG_SPECS: Record<QuickLogType, QuickLogSpec> = {
  call: {
    note: 'Phone call follow-up',
    xp: 15,
    followUpDays: 30,
    toastLabel: 'Call logged',
  },
  email: {
    note: 'Email follow-up',
    xp: 10,
    followUpDays: 14,
    toastLabel: 'Email logged',
  },
  meeting: {
    note: 'Meeting follow-up',
    xp: 25,
    followUpDays: 7,
    toastLabel: 'Meeting logged',
  },
};

export function quickLogSpecFor(type: QuickLogType): QuickLogSpec {
  return QUICK_LOG_SPECS[type];
}
