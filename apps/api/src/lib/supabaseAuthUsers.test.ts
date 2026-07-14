import assert from 'node:assert/strict';
import test from 'node:test';

import { findSupabaseAuthUserByEmail } from './supabaseAuthUsers';

test('finds an auth user by normalized email across pages', async () => {
  const requestedPages: number[] = [];
  const client = {
    auth: {
      admin: {
        async listUsers({ page }: { page: number; perPage: number }) {
          requestedPages.push(page);
          return {
            data: {
              users: page === 1
                ? [{ id: 'one', email: 'one@example.com' }]
                : [{ id: 'target', email: 'Teammate@Example.com' }],
            },
            error: null,
          };
        },
      },
    },
  };

  const user = await findSupabaseAuthUserByEmail(client, ' teammate@example.com ', { perPage: 1 });

  assert.equal(user?.id, 'target');
  assert.deepEqual(requestedPages, [1, 2]);
});

test('returns null after the final partial page', async () => {
  const client = {
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [] }, error: null };
        },
      },
    },
  };

  assert.equal(await findSupabaseAuthUserByEmail(client, 'missing@example.com'), null);
});

test('surfaces Supabase admin lookup errors', async () => {
  const client = {
    auth: {
      admin: {
        async listUsers() {
          return { data: null, error: { message: 'not authorized' } };
        },
      },
    },
  };

  await assert.rejects(
    () => findSupabaseAuthUserByEmail(client, 'person@example.com'),
    /not authorized/,
  );
});
