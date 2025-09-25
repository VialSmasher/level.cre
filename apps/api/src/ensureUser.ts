import { db } from './db';
import { users } from '@level-cre/shared/schema';

// Idempotently ensure a public.users row exists for the authenticated user.
// Uses ON CONFLICT DO NOTHING to avoid race conditions.
export async function ensureUser(userId: string, email?: string | null) {
  if (!userId) return;
  try {
    await db
      .insert(users)
      .values({ id: userId, email: email || null } as any)
      .onConflictDoNothing({ target: users.id });
  } catch (err) {
    // Best-effort; log and continue
    const e: any = err;
    console.error('ensureUser failed:', {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      constraint: e?.constraint,
      table: e?.table,
    });
  }
}

